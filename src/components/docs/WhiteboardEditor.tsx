"use client";

import "@excalidraw/excalidraw/index.css";
import { useCallback, useRef, useState } from "react";
import { convertToExcalidrawElements, Excalidraw, exportToBlob, exportToSvg, MainMenu } from "@excalidraw/excalidraw";
import type { BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Download, FileText, History, ImagePlus, Workflow } from "lucide-react";
import { runAi } from "@/lib/ai/client";
import { blobToDataUrl, compressImage, MAX_UPLOAD_BYTES } from "@/lib/compress-image";
import { useAutosave } from "@/lib/use-autosave";
import type { Doc } from "@/lib/types";
import { download, safeFilename } from "@/lib/zip";
import { AiButton } from "../AiButton";
import { useWorkspace } from "../WorkspaceShell";
import { SaveBadge } from "./SaveBadge";
import { VersionHistory } from "./VersionHistory";

interface Scene {
  elements?: readonly { id: string; type: string; isDeleted?: boolean; version: number; fileId?: string | null; text?: string }[];
  files?: BinaryFiles;
  appState?: { viewBackgroundColor?: string; gridSize?: number | null };
}

type Elements = Parameters<NonNullable<React.ComponentProps<typeof Excalidraw>["onChange"]>>[0];

// A data URL is about 4/3 the size of the bytes it holds.
const MAX_DATA_URL = Math.floor(MAX_UPLOAD_BYTES * 1.37);

/** An Excalidraw whiteboard that saves itself, with AI diagram and image helpers. */
export function WhiteboardEditor({
  doc,
  onRenamed,
  onReload,
  onCreateDoc,
}: {
  doc: Doc;
  onRenamed: (title: string) => void;
  onReload: () => void;
  onCreateDoc: (title: string, content: string) => Promise<void>;
}) {
  const { org, aiEnabled, theme } = useWorkspace();
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const save = useAutosave(doc.id, doc.version, 1500);
  const lastVersion = useRef<number | null>(null);
  const shrinking = useRef(new Set<string>());
  const [title, setTitle] = useState(doc.title);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"diagram" | "image">("diagram");
  const [history, setHistory] = useState(false);

  const scene = (doc.scene ?? {}) as Scene;
  const [initialData] = useState(() => ({
    elements: (scene.elements ?? []) as never,
    files: scene.files ?? {},
    appState: { viewBackgroundColor: scene.appState?.viewBackgroundColor ?? "#FFF8F0" },
    scrollToContent: true,
  }));

  const onChange = useCallback(
    (elements: Elements, appState: { viewBackgroundColor: string; gridSize?: number | null }, files: BinaryFiles) => {
      const version = elements.reduce((sum, el) => sum + el.version, elements.length);
      if (lastVersion.current === null) {
        lastVersion.current = version; // The initial load is not an edit.
        return;
      }
      if (version === lastVersion.current) return;
      lastVersion.current = version;

      // Images pasted onto the board are shrunk below 250 KB like every upload.
      for (const file of Object.values(files)) {
        if (file.dataURL.length > MAX_DATA_URL && !shrinking.current.has(file.id)) {
          shrinking.current.add(file.id);
          (async () => {
            try {
              const blob = await (await fetch(file.dataURL)).blob();
              const small = await compressImage(new File([blob], "board-image", { type: blob.type }));
              api.current?.addFiles([
                { ...file, mimeType: "image/webp", dataURL: (await blobToDataUrl(small)) as BinaryFileData["dataURL"] },
              ]);
            } catch {
              setError("An image on this board could not be shrunk below 250 KB. Remove it and try a smaller one.");
            }
          })();
        }
      }

      const live = elements.filter((el) => !el.isDeleted);
      const used = new Set(live.map((el) => ("fileId" in el ? el.fileId : null)).filter(Boolean) as string[]);
      const keptFiles = Object.fromEntries(
        Object.entries(files).filter(([id, f]) => used.has(id) && f.dataURL.length <= MAX_DATA_URL),
      );
      save.queue({
        scene: {
          elements: live,
          files: keptFiles,
          appState: { viewBackgroundColor: appState.viewBackgroundColor, gridSize: appState.gridSize ?? null },
        },
      });
    },
    [save],
  );

  async function run(name: string, action: () => Promise<void>) {
    setBusy(name);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  /** Where new content goes: just right of everything on the board. */
  function freeSpot() {
    const els = api.current?.getSceneElements() ?? [];
    if (!els.length) return { x: 0, y: 0 };
    const right = Math.max(...els.map((e) => e.x + e.width));
    const top = Math.min(...els.map((e) => e.y));
    return { x: right + 120, y: top };
  }

  const addDiagram = () =>
    run("diagram", async () => {
      const { mermaid } = await runAi("diagram", org.id, { prompt });
      const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
      const parsed = await parseMermaidToExcalidraw(mermaid, { themeVariables: { fontSize: "16px" } });
      const created = convertToExcalidrawElements(parsed.elements, { regenerateIds: true });
      const spot = freeSpot();
      const minX = Math.min(...created.map((e) => e.x));
      const minY = Math.min(...created.map((e) => e.y));
      const moved = created.map((e) => ({ ...e, x: e.x - minX + spot.x, y: e.y - minY + spot.y }));
      if (parsed.files) api.current?.addFiles(Object.values(parsed.files));
      api.current?.updateScene({ elements: [...(api.current.getSceneElements() ?? []), ...moved] });
      api.current?.scrollToContent(moved, { fitToContent: true, animate: true });
      setPrompt("");
    });

  const addImage = () =>
    run("image", async () => {
      const { dataUrl } = await runAi("board-image", org.id, { prompt });
      const fileId = crypto.randomUUID() as BinaryFileData["id"];
      api.current?.addFiles([
        { id: fileId, dataURL: dataUrl as BinaryFileData["dataURL"], mimeType: "image/webp", created: Date.now() },
      ]);
      const spot = freeSpot();
      const [image] = convertToExcalidrawElements([{ type: "image", fileId, x: spot.x, y: spot.y, width: 480, height: 360 }]);
      api.current?.updateScene({ elements: [...(api.current.getSceneElements() ?? []), image] });
      api.current?.scrollToContent([image], { fitToContent: true, animate: true });
      setPrompt("");
    });

  const toDoc = () =>
    run("doc", async () => {
      const texts = (api.current?.getSceneElements() ?? [])
        .filter((e) => e.type === "text")
        .map((e) => ("text" in e ? String(e.text) : ""))
        .filter((t) => t.trim());
      if (!texts.length) throw new Error("Add some text or sticky notes to the board first.");
      const { markdown } = await runAi("board-to-doc", org.id, { title, texts: texts.slice(0, 300) });
      await onCreateDoc(`${title} (notes)`, markdown);
    });

  async function exportAs(kind: "png" | "svg") {
    const a = api.current;
    if (!a) return;
    const options = { elements: a.getSceneElements(), appState: { ...a.getAppState(), exportBackground: true }, files: a.getFiles() };
    if (kind === "png") download(await exportToBlob({ ...options, mimeType: "image/png" }), `${safeFilename(title)}.png`);
    else {
      const svg = await exportToSvg(options);
      download(new Blob([svg.outerHTML], { type: "image/svg+xml" }), `${safeFilename(title)}.svg`);
    }
  }

  return (
    <div className="doc-layout">
      <article className="doc-main board-main">
        <div className="board-bar" role="toolbar" aria-label="Board tools">
          <input
            className="doc-title board-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (e.target.value.trim()) {
                save.queue({ title: e.target.value.trim().slice(0, 200) });
                onRenamed(e.target.value.trim());
              }
            }}
            maxLength={200}
            aria-label="Board title"
          />
          <SaveBadge state={save.state} error={save.error} />
          {aiEnabled && (
            <>
              <div className="btn-group" role="group" aria-label="AI mode">
                <button className="btn btn-small" aria-pressed={mode === "diagram"} onClick={() => setMode("diagram")}>
                  <Workflow size={13} />
                  <span>Diagram</span>
                </button>
                <button className="btn btn-small" aria-pressed={mode === "image"} onClick={() => setMode("image")}>
                  <ImagePlus size={13} />
                  <span>Image</span>
                </button>
              </div>
              <input
                className="board-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && prompt.trim().length >= 3) (mode === "diagram" ? addDiagram : addImage)();
                }}
                placeholder={mode === "diagram" ? "AI: describe a flow to draw…" : "AI: describe an image…"}
                maxLength={mode === "diagram" ? 2000 : 1000}
                aria-label={mode === "diagram" ? "Describe a diagram" : "Describe an image"}
              />
              <AiButton busy={busy === "diagram" || busy === "image"} disabled={prompt.trim().length < 3} onClick={mode === "diagram" ? addDiagram : addImage}>
                {mode === "diagram" ? "Draw it" : "Generate"}
              </AiButton>
              <AiButton busy={busy === "doc"} onClick={toDoc} title="Turn the board's text into a Markdown doc">
                Board → doc
              </AiButton>
            </>
          )}
          <span className="spacer" />
          <button
            className="btn btn-small btn-icon"
            onClick={() => setHistory(!history)}
            aria-pressed={history}
            aria-label="Version history"
            title="Version history"
          >
            <History size={15} />
          </button>
          <button className="btn btn-small btn-icon" onClick={() => exportAs("png")} aria-label="Download PNG" title="Download PNG">
            <Download size={15} />
          </button>
          <button className="btn btn-small btn-icon" onClick={() => exportAs("svg")} aria-label="Download SVG" title="Download SVG">
            <FileText size={15} />
          </button>
        </div>

        {save.state === "conflict" && (
          <div className="notice conflict" role="alert">
            <span>A teammate saved this board after you opened it.</span>
            <button className="btn btn-small" onClick={onReload}>
              Load their version
            </button>
            <button className="btn btn-small btn-danger" onClick={save.overwrite}>
              Keep mine (overwrite)
            </button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="board-canvas">
          <Excalidraw
            initialData={initialData}
            excalidrawAPI={(instance) => {
              api.current = instance;
            }}
            onChange={onChange}
            theme={theme}
            name={title}
            UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false } }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
          </Excalidraw>
        </div>
      </article>
      {history && <VersionHistory docId={doc.id} isBoard onRestored={onReload} onClose={() => setHistory(false)} />}
    </div>
  );
}

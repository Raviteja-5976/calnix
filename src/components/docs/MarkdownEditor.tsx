"use client";

import { useEffect, useRef } from "react";
import { EditorState, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  placeholder as placeholderExt,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { tags } from "@lezer/highlight";

export interface MarkdownEditorHandle {
  selection: () => { from: number; to: number; text: string; before: string };
  replace: (from: number, to: number, text: string) => void;
  insert: (text: string) => void;
  wrap: (before: string, after?: string) => void;
  prefixLines: (prefix: string) => void;
  focus: () => void;
}

interface Callbacks {
  onChange: (text: string) => void;
  onOpenLink: (title: string) => void;
  onUploadImage?: (file: File) => Promise<string>;
  titles: () => string[];
}

// ---------------------------------------------------------------------------
// Live preview: markup characters hide on every line the cursor is not on,
// the way Obsidian's editor works.
// ---------------------------------------------------------------------------

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
  ) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.pos === this.pos;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-task-box";
    box.setAttribute("aria-label", this.checked ? "Mark not done" : "Mark done");
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({ changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? " " : "x" } });
    });
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const dot = document.createElement("span");
    dot.className = "cm-bullet";
    dot.textContent = "•";
    return dot;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const hr = document.createElement("span");
    hr.className = "cm-hr";
    return hr;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM() {
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.className = "cm-image";
    img.loading = "lazy";
    return img;
  }
}

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });

function activeLines(view: EditorView) {
  const lines = new Set<number>();
  if (!view.hasFocus) return lines;
  for (const range of view.state.selection.ranges) {
    const first = view.state.doc.lineAt(range.from).number;
    const last = view.state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) lines.add(n);
  }
  return lines;
}

const WIKILINK = /\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g;
const SAFE_URL = /^(https?:\/\/|\/api\/docs\/files\/|data:image\/)/i;

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { state } = view;
  const active = activeLines(view);
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number);
  const lineClass = (from: number, to: number, cls: string) => {
    for (let n = state.doc.lineAt(from).number; n <= state.doc.lineAt(to).number; n++) {
      ranges.push(Decoration.line({ class: cls }).range(state.doc.line(n).from));
    }
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;
        const heading = /^ATXHeading(\d)$/.exec(name);
        if (heading) {
          ranges.push(Decoration.line({ class: `cm-h cm-h${heading[1]}` }).range(state.doc.lineAt(node.from).from));
          return;
        }
        switch (name) {
          case "HeaderMark": {
            if (!isActive(node.from)) {
              const end = state.sliceDoc(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
              ranges.push(hide.range(node.from, end));
            }
            return;
          }
          case "EmphasisMark":
          case "StrikethroughMark":
            if (!isActive(node.from)) ranges.push(hide.range(node.from, node.to));
            return;
          case "CodeMark":
            if (node.node.parent?.name === "InlineCode" && !isActive(node.from)) {
              ranges.push(hide.range(node.from, node.to));
            }
            return;
          case "Emphasis":
            ranges.push(Decoration.mark({ class: "cm-em" }).range(node.from, node.to));
            return;
          case "StrongEmphasis":
            ranges.push(Decoration.mark({ class: "cm-strong" }).range(node.from, node.to));
            return;
          case "Strikethrough":
            ranges.push(Decoration.mark({ class: "cm-strike" }).range(node.from, node.to));
            return;
          case "InlineCode":
            ranges.push(Decoration.mark({ class: "cm-inline-code" }).range(node.from, node.to));
            return;
          case "FencedCode":
            lineClass(node.from, node.to, "cm-codeblock");
            return false;
          case "Blockquote":
            lineClass(node.from, node.to, "cm-quote");
            return;
          case "QuoteMark":
            if (!isActive(node.from)) ranges.push(hide.range(node.from, node.to));
            return;
          case "HorizontalRule":
            if (!isActive(node.from)) ranges.push(rule.range(node.from, node.to));
            return;
          case "ListMark": {
            const mark = state.sliceDoc(node.from, node.to);
            const isTask = node.node.parent?.getChild("Task");
            if (!isActive(node.from) && /^[-*+]$/.test(mark)) {
              ranges.push((isTask ? hide : bullet).range(node.from, isTask ? node.to + 1 : node.to));
            }
            return;
          }
          case "TaskMarker": {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to));
            ranges.push(Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }).range(node.from, node.to));
            if (checked) {
              const line = state.doc.lineAt(node.from);
              if (node.to < line.to) ranges.push(Decoration.mark({ class: "cm-task-done" }).range(node.to, line.to));
            }
            return;
          }
          case "Image": {
            if (isActive(node.from)) return false;
            const url = node.node.getChild("URL");
            const src = url ? state.sliceDoc(url.from, url.to) : "";
            const text = state.sliceDoc(node.from, node.to);
            const alt = /^!\[([^\]]*)\]/.exec(text)?.[1] ?? "";
            if (SAFE_URL.test(src)) {
              ranges.push(Decoration.replace({ widget: new ImageWidget(src, alt) }).range(node.from, node.to));
            }
            return false;
          }
          case "Link": {
            const url = node.node.getChild("URL");
            const href = url ? state.sliceDoc(url.from, url.to) : "";
            const marks = node.node.getChildren("LinkMark");
            if (marks.length >= 2) {
              const textFrom = marks[0].to;
              const textTo = marks[1].from;
              if (textTo > textFrom) {
                ranges.push(
                  Decoration.mark({ class: "cm-link", attributes: { "data-href": href, title: `${href} (Ctrl+click to open)` } }).range(
                    textFrom,
                    textTo,
                  ),
                );
              }
              if (!isActive(node.from)) {
                ranges.push(hide.range(node.from, textFrom));
                if (node.to > textTo) ranges.push(hide.range(textTo, node.to));
              }
            }
            return false;
          }
        }
      },
    });

    // [[Wiki links]]: Obsidian-style links between docs.
    for (let pos = from; pos <= to; ) {
      const line = state.doc.lineAt(pos);
      WIKILINK.lastIndex = 0;
      for (let m; (m = WIKILINK.exec(line.text)); ) {
        const start = line.from + m.index;
        const end = start + m[0].length;
        const target = m[1].trim();
        if (active.has(line.number)) {
          ranges.push(Decoration.mark({ class: "cm-wikilink-src" }).range(start, end));
        } else {
          const labelFrom = m[2] ? start + 2 + m[1].length + 1 : start + 2;
          ranges.push(hide.range(start, labelFrom));
          ranges.push(
            Decoration.mark({ class: "cm-wikilink", attributes: { "data-wikilink": target, title: `Open “${target}”` } }).range(
              labelFrom,
              end - 2,
            ),
          );
          ranges.push(hide.range(end - 2, end));
        }
      }
      pos = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, class: "cm-md-link" },
  { tag: tags.url, class: "cm-md-url" },
  { tag: tags.monospace, class: "cm-md-mono" },
  { tag: tags.processingInstruction, class: "cm-md-mark" },
  { tag: tags.quote, class: "cm-md-quote" },
]);

export function MarkdownEditor({
  initial,
  onChange,
  onOpenLink,
  onUploadImage,
  titles,
  editorRef,
  readOnly = false,
  placeholder = "Start writing… Use # for headings, - [ ] for tasks and [[ to link a doc.",
}: {
  initial: string;
  onChange: (text: string) => void;
  onOpenLink: (title: string) => void;
  onUploadImage?: (file: File) => Promise<string>;
  titles: string[];
  editorRef?: React.RefObject<MarkdownEditorHandle | null>;
  readOnly?: boolean;
  placeholder?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef<Callbacks>({ onChange, onOpenLink, onUploadImage, titles: () => titles });

  // The editor is created once per mount; callbacks are read through a ref.
  useEffect(() => {
    callbacks.current = { onChange, onOpenLink, onUploadImage, titles: () => titles };
  });

  useEffect(() => {
    if (!host.current) return;

    const insertImages = (view: EditorView, files: File[], at: number) => {
      const upload = callbacks.current.onUploadImage;
      if (!upload) return false;
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (!images.length) return false;
      for (const file of images) {
        const marker = `![Uploading ${file.name.replace(/[[\]]/g, "")}…]()`;
        view.dispatch({ changes: { from: at, insert: `${marker}\n` } });
        upload(file)
          .then((url) => {
            const doc = view.state.doc.toString();
            const index = doc.indexOf(marker);
            if (index >= 0) view.dispatch({ changes: { from: index, to: index + marker.length, insert: `![](${url})` } });
          })
          .catch((err) => {
            const doc = view.state.doc.toString();
            const index = doc.indexOf(marker);
            const message = err instanceof Error ? err.message : "Upload failed";
            if (index >= 0) view.dispatch({ changes: { from: index, to: index + marker.length, insert: `> ${message}` } });
          });
      }
      return true;
    };

    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial,
        extensions: [
          history(),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(highlight),
          livePreview,
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          placeholderExt(placeholder),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ "aria-label": "Document text", spellcheck: "true" }),
          autocompletion({
            override: [
              (context: CompletionContext) => {
                const match = context.matchBefore(/\[\[[^\]\n]*$/);
                if (!match) return null;
                return {
                  from: match.from + 2,
                  options: callbacks.current.titles().map((title) => ({ label: title, apply: `${title}]]`, type: "text" })),
                  validFor: /^[^\]\n]*$/,
                };
              },
            ],
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            mousedown(event) {
              const target = event.target as HTMLElement;
              const wiki = target.closest<HTMLElement>(".cm-wikilink");
              if (wiki?.dataset.wikilink) {
                event.preventDefault();
                callbacks.current.onOpenLink(wiki.dataset.wikilink);
                return true;
              }
              const link = target.closest<HTMLElement>(".cm-link");
              if (link?.dataset.href && (event.ctrlKey || event.metaKey) && /^https?:\/\//i.test(link.dataset.href)) {
                event.preventDefault();
                window.open(link.dataset.href, "_blank", "noopener,noreferrer");
                return true;
              }
              return false;
            },
            paste(event, view) {
              const files = [...(event.clipboardData?.files ?? [])];
              if (files.length && insertImages(view, files, view.state.selection.main.head)) {
                event.preventDefault();
                return true;
              }
              return false;
            },
            drop(event, view) {
              const files = [...(event.dataTransfer?.files ?? [])];
              const at = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
              if (files.length && insertImages(view, files, at)) {
                event.preventDefault();
                return true;
              }
              return false;
            },
          }),
        ],
      }),
    });

    if (editorRef) {
      editorRef.current = {
        selection: () => {
          const { from, to } = view.state.selection.main;
          return {
            from,
            to,
            text: view.state.sliceDoc(from, to),
            before: view.state.sliceDoc(Math.max(0, from - 6000), from),
          };
        },
        replace: (from, to, text) => {
          view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
          view.focus();
        },
        insert: (text) => {
          const { head } = view.state.selection.main;
          view.dispatch({ changes: { from: head, insert: text }, selection: { anchor: head + text.length } });
          view.focus();
        },
        wrap: (before, after = before) => {
          const { from, to } = view.state.selection.main;
          view.dispatch({
            changes: [
              { from, insert: before },
              { from: to, insert: after },
            ],
            selection: { anchor: from + before.length, head: to + before.length },
          });
          view.focus();
        },
        prefixLines: (prefix) => {
          const { from, to } = view.state.selection.main;
          const changes = [];
          for (let n = view.state.doc.lineAt(from).number; n <= view.state.doc.lineAt(to).number; n++) {
            changes.push({ from: view.state.doc.line(n).from, insert: prefix });
          }
          view.dispatch({ changes });
          view.focus();
        },
        focus: () => view.focus(),
      };
    }
    return () => {
      view.destroy();
      if (editorRef) editorRef.current = null;
    };
    // Recreated only when the document identity changes (the parent sets a key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="md-editor" />;
}

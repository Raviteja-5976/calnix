"use client";

import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { relativeTime } from "@/lib/dates";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useWorkspace } from "../WorkspaceShell";

interface Version {
  id: number;
  version: number;
  title: string;
  content: string;
  saved_by: string | null;
  created_at: string;
}

/** Earlier saves of a doc. Restoring one saves it as the newest version. */
export function VersionHistory({
  docId,
  isBoard,
  onRestored,
  onClose,
}: {
  docId: string;
  isBoard: boolean;
  onRestored: () => void;
  onClose: () => void;
}) {
  const { memberById } = useWorkspace();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [selected, setSelected] = useState<Version | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabaseBrowser()
        .from("document_versions")
        .select("id, version, title, content, saved_by, created_at")
        .eq("document_id", docId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!cancelled) setVersions((data ?? []) as Version[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  async function restore(version: Version) {
    if (!window.confirm(`Restore version ${version.version}? Your current text is kept in history.`)) return;
    const { error: failure } = await supabaseBrowser().rpc("restore_document_version", { p_version: version.id });
    if (failure) setError(failure.message);
    else onRestored();
  }

  return (
    <aside className="doc-side-panel" aria-label="Version history">
      <header className="section-head">
        <h3 className="inline-icon">
          <History size={15} /> History
        </h3>
        <button className="btn-plain" onClick={onClose} aria-label="Close history">
          <X size={15} />
        </button>
      </header>
      {error && <p className="error">{error}</p>}
      {versions === null ? (
        <p className="muted small">Loading…</p>
      ) : versions.length === 0 ? (
        <p className="muted small">No earlier versions yet. A snapshot is kept each time someone edits after a pause.</p>
      ) : (
        <ul className="version-list">
          {versions.map((v) => (
            <li key={v.id} className={selected?.id === v.id ? "is-active" : ""}>
              <button className="link-button" onClick={() => setSelected(v)}>
                v{v.version} · {relativeTime(v.created_at)}
              </button>
              <span className="muted small">{memberById(v.saved_by)?.full_name ?? "Someone"}</span>
              <button className="btn btn-small" onClick={() => restore(v)}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && !isBoard && <pre className="version-preview">{selected.content || "(empty)"}</pre>}
      {selected && isBoard && <p className="muted small">Board versions can be restored but not previewed here.</p>}
    </aside>
  );
}

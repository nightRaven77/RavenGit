import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileBlame } from "./types";

export interface BlameDialogProps {
  repoId: string;
  path: string;
  revision?: string | null;
  onClose: () => void;
  onJumpToCommitHash: (hash: string) => void;
  onOpenHistory?: (path: string, revision?: string | null) => void;
}

const errorMessage = (reason: unknown) =>
  typeof reason === "object" && reason && "message" in reason
    ? String((reason as { message: unknown }).message)
    : String(reason);

const BLAME_PALETTE = [
  "var(--graph-palette-1, #7C6FF6)",
  "var(--graph-palette-2, #36D399)",
  "var(--graph-palette-3, #38BDF8)",
  "var(--graph-palette-4, #F59E0B)",
  "var(--graph-palette-5, #F472B6)",
  "var(--graph-palette-6, #A78BFA)",
];

function colorForHash(hash: string): string {
  let acc = 0;
  for (let i = 0; i < Math.min(hash.length, 8); i++) {
    acc = (acc * 31 + hash.charCodeAt(i)) >>> 0;
  }
  return BLAME_PALETTE[acc % BLAME_PALETTE.length];
}

export default function BlameDialog({
  repoId,
  path,
  revision = null,
  onClose,
  onJumpToCommitHash,
  onOpenHistory,
}: BlameDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reqRef = useRef(0);

  const [blame, setBlame] = useState<FileBlame | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) {
      el.showModal?.();
    }
  }, []);

  useEffect(() => {
    const token = ++reqRef.current;
    setBusy(true);
    setError("");
    invoke<FileBlame>("read_file_blame", {
      id: repoId,
      path,
      revision,
    })
      .then((res) => {
        if (token === reqRef.current) setBlame(res);
      })
      .catch((reason) => {
        if (token === reqRef.current) setError(errorMessage(reason));
      })
      .finally(() => {
        if (token === reqRef.current) setBusy(false);
      });
  }, [repoId, path, revision]);

  const visibleLines = useMemo(() => {
    const lines = blame?.lines ?? [];
    const q = filter.trim().toLocaleLowerCase();
    if (!q) return lines;
    return lines.filter(
      (line) =>
        line.author.toLocaleLowerCase().includes(q) ||
        line.summary.toLocaleLowerCase().includes(q) ||
        line.hash.toLocaleLowerCase().includes(q) ||
        line.content.toLocaleLowerCase().includes(q),
    );
  }, [blame, filter]);

  return (
    <dialog
      ref={dialogRef}
      className="operation-dialog blame-dialog"
      aria-labelledby="blame-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="blame-dialog-head">
        <div>
          <span className="trust-dialog-eyebrow">GIT BLAME INTERACTIVO</span>
          <h2 id="blame-dialog-title">Blame de {path}</h2>
          <p className="worktree-dialog-sub">
            {blame?.commit
              ? `Revisión ${blame.commit.slice(0, 8)} · ${blame.lines.length} líneas`
              : "Autoría y commit de origen por línea."}
          </p>
        </div>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Cerrar Git Blame"
        >
          ×
        </button>
      </header>

      <div className="blame-toolbar">
        <label className="blame-filter-label">
          <span className="sr-only">Filtrar líneas o autor</span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar líneas, autor o commit…"
          />
        </label>
        {onOpenHistory && (
          <button
            type="button"
            className="button"
            onClick={() => {
              onOpenHistory(path, revision);
              onClose();
            }}
          >
            Ver historial (--follow)
          </button>
        )}
      </div>

      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className="blame-table-wrap" aria-busy={busy}>
        {busy ? (
          <p className="search-dialog-empty">Analizando autoría por línea…</p>
        ) : visibleLines.length > 0 ? (
          <div
            className="blame-table"
            role="table"
            aria-label={`Blame ${path}`}
          >
            {visibleLines.map((line) => (
              <div
                key={line.lineNumber}
                className="blame-row"
                role="row"
                title={line.summary || undefined}
                style={{
                  borderLeftColor: colorForHash(line.hash),
                }}
              >
                <button
                  type="button"
                  className="blame-hash-btn"
                  onClick={() => {
                    onJumpToCommitHash(line.hash);
                    onClose();
                  }}
                  title={`Ir al commit ${line.hash.slice(0, 8)}: ${line.summary}`}
                >
                  {line.hash.slice(0, 8)}
                </button>
                <span className="blame-author truncate" title={line.author}>
                  {line.author}
                </span>
                <span className="blame-date">{line.date}</span>
                <span className="blame-lineno">{line.lineNumber}</span>
                <code className="blame-code">{line.content || " "}</code>
              </div>
            ))}
          </div>
        ) : (
          !error && (
            <p className="search-dialog-empty">
              Sin líneas para mostrar con el filtro actual.
            </p>
          )
        )}
      </div>
    </dialog>
  );
}

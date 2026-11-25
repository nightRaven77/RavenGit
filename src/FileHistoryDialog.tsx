import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import DiffViewer from "./DiffViewer";
import type {
  Commit,
  CommitDiff,
  FileHistoryEntry,
  FileHistoryPage,
} from "./types";

export interface FileHistoryDialogProps {
  repoId: string;
  path: string;
  revision?: string | null;
  onClose: () => void;
  onJumpToCommit: (commit: Commit) => void;
  onOpenBlame: (path: string, commitHash: string) => void;
}

const errorMessage = (reason: unknown) =>
  typeof reason === "object" && reason && "message" in reason
    ? String((reason as { message: unknown }).message)
    : String(reason);

function shortHash(hash: string) {
  return hash.slice(0, 8);
}

function formatDate(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString("es-MX", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export default function FileHistoryDialog({
  repoId,
  path,
  revision = null,
  onClose,
  onJumpToCommit,
  onOpenBlame,
}: FileHistoryDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pageReqRef = useRef(0);
  const diffReqRef = useRef(0);

  const [entries, setEntries] = useState<FileHistoryEntry[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [selected, setSelected] = useState<FileHistoryEntry | null>(null);
  const [busy, setBusy] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [diff, setDiff] = useState<CommitDiff | null>(null);
  const [diffBusy, setDiffBusy] = useState(false);
  const [diffError, setDiffError] = useState("");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [contextLines, setContextLines] = useState(3);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) {
      el.showModal?.();
    }
  }, []);

  async function loadPage(offset: number) {
    const token = ++pageReqRef.current;
    if (offset === 0) {
      setBusy(true);
    } else {
      setLoadingMore(true);
    }
    setError("");
    try {
      const page = await invoke<FileHistoryPage>("read_file_history", {
        id: repoId,
        path,
        revision,
        offset,
        limit: 50,
      });
      if (token !== pageReqRef.current) return;
      setNextOffset(page.nextOffset);
      setEntries((current) =>
        offset === 0 ? page.entries : [...current, ...page.entries],
      );
      if (offset === 0 && page.entries.length > 0) {
        setSelected(page.entries[0]);
      }
    } catch (reason) {
      if (token === pageReqRef.current) setError(errorMessage(reason));
    } finally {
      if (token === pageReqRef.current) {
        setBusy(false);
        setLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    void loadPage(0);
  }, [repoId, path, revision]);

  useEffect(() => {
    const token = ++diffReqRef.current;
    setDiff(null);
    setDiffError("");
    if (!selected) {
      setDiffBusy(false);
      return;
    }
    setDiffBusy(true);
    invoke<CommitDiff>("read_commit_diff", {
      id: repoId,
      hash: selected.commit.hash,
      parentIndex: 0,
      path: selected.path,
      oldPath: selected.oldPath,
      ignoreWhitespace,
      contextLines,
    })
      .then((value) => {
        if (token === diffReqRef.current) setDiff(value);
      })
      .catch((reason) => {
        if (token === diffReqRef.current) setDiffError(errorMessage(reason));
      })
      .finally(() => {
        if (token === diffReqRef.current) setDiffBusy(false);
      });
  }, [repoId, selected, ignoreWhitespace, contextLines]);

  return (
    <dialog
      ref={dialogRef}
      className="operation-dialog file-history-dialog"
      aria-labelledby="file-history-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="file-history-head">
        <div>
          <span className="trust-dialog-eyebrow">
            HISTORIAL DE ARCHIVO (--FOLLOW)
          </span>
          <h2 id="file-history-title">Historial de {path}</h2>
          <p className="worktree-dialog-sub">
            Seguimiento completo de cambios incluyendo renombres históricos.
          </p>
        </div>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Cerrar historial de archivo"
        >
          ×
        </button>
      </header>

      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className="search-dialog-split">
        <div
          className="search-dialog-results"
          role="region"
          aria-label="Commits del archivo"
        >
          <div className="search-dialog-results-head" role="status">
            {busy
              ? "Consultando historial…"
              : `${entries.length} revisiones cargadas`}
          </div>
          {entries.length > 0 && (
            <ul className="search-dialog-list">
              {entries.map((entry) => {
                const active = selected?.commit.hash === entry.commit.hash;
                return (
                  <li key={`${entry.commit.hash}:${entry.path}`}>
                    <button
                      type="button"
                      className={`search-dialog-item ${active ? "selected" : ""}`}
                      aria-pressed={active}
                      onClick={() => setSelected(entry)}
                    >
                      <div className="search-dialog-item-top">
                        <code>{shortHash(entry.commit.hash)}</code>
                        <span
                          className={`commit-file-status status-${entry.status}`}
                        >
                          {entry.status}
                        </span>
                        <span>{formatDate(entry.commit.date)}</span>
                      </div>
                      <strong className="truncate">
                        {entry.commit.subject || "(sin mensaje)"}
                      </strong>
                      <small className="truncate">
                        {entry.oldPath
                          ? `${entry.oldPath} → ${entry.path}`
                          : entry.path}
                      </small>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!busy && entries.length === 0 && !error && (
            <p className="search-dialog-empty">
              No se encontraron commits para este archivo.
            </p>
          )}
          {nextOffset !== null && (
            <div className="search-dialog-more">
              <button
                type="button"
                className="button"
                disabled={loadingMore}
                onClick={() => void loadPage(nextOffset)}
              >
                {loadingMore ? "Cargando más…" : "Cargar más"}
              </button>
            </div>
          )}
        </div>

        <div
          className="search-dialog-preview"
          role="region"
          aria-label="Diff de revisión del archivo"
        >
          {selected ? (
            <>
              <div className="search-dialog-preview-head">
                <div>
                  <h3>{selected.commit.subject || "(sin mensaje)"}</h3>
                  <p>
                    {selected.commit.author} ·{" "}
                    {formatDate(selected.commit.date)} ·{" "}
                    <code>{shortHash(selected.commit.hash)}</code>
                  </p>
                </div>
                <div className="file-history-actions">
                  <button
                    type="button"
                    className="button"
                    disabled={selected.status === "D"}
                    onClick={() => {
                      onOpenBlame(selected.path, selected.commit.hash);
                      onClose();
                    }}
                  >
                    Ver Blame aquí
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      onJumpToCommit(selected.commit);
                      onClose();
                    }}
                  >
                    Ir al commit
                  </button>
                </div>
              </div>
              <div className="search-dialog-preview-body" aria-busy={diffBusy}>
                {diffBusy ? (
                  <p className="search-dialog-empty">Cargando diff…</p>
                ) : diffError ? (
                  <div className="banner error" role="alert">
                    <span>{diffError}</span>
                  </div>
                ) : diff?.text ? (
                  <DiffViewer
                    text={diff.text}
                    filePath={selected.path}
                    ignoreWhitespace={ignoreWhitespace}
                    onIgnoreWhitespaceChange={setIgnoreWhitespace}
                    contextLines={contextLines}
                    onContextLinesChange={setContextLines}
                  />
                ) : (
                  <p className="search-dialog-empty">
                    Sin cambios textuales en esta revisión.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="search-dialog-empty">
              Selecciona una revisión para ver el diff del archivo.
            </p>
          )}
        </div>
      </div>
    </dialog>
  );
}

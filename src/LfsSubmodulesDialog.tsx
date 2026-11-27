import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LfsActionOutcome,
  LfsLock,
  LfsStatus,
  SubmoduleAction,
  SubmoduleList,
  SubmoduleOutcome,
} from "./types";

export interface LfsSubmodulesDialogProps {
  repoId: string;
  repoName: string;
  trusted: boolean;
  onAuthorize?: () => void;
  onUpdated: () => Promise<void> | void;
  onLock?: (locked: boolean) => void;
  onClose: () => void;
}

type ActiveTab = "lfs" | "submodules";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function errorMessage(reason: unknown): string {
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message: unknown }).message);
  }
  if (reason instanceof Error) return reason.message;
  return String(reason || "Error desconocido.");
}

function submoduleStatusLabel(status: string): string {
  if (status === "uninitialized") return "Sin inicializar";
  if (status === "modified") return "Desfasado";
  if (status === "conflict") return "Conflicto";
  return "Limpio";
}

export default function LfsSubmodulesDialog({
  repoId,
  repoName,
  trusted,
  onAuthorize,
  onUpdated,
  onLock,
  onClose,
}: LfsSubmodulesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<ActiveTab>("lfs");
  const [lfs, setLfs] = useState<LfsStatus | null>(null);
  const [submodules, setSubmodules] = useState<SubmoduleList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [recursive, setRecursive] = useState(false);
  const [lockPathInput, setLockPathInput] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) {
      el.showModal?.();
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [lfsRes, subRes] = await Promise.all([
        invoke<LfsStatus>("read_lfs_status", { id: repoId }),
        invoke<SubmoduleList>("read_submodules", { id: repoId }),
      ]);
      setLfs(lfsRes);
      setSubmodules(subRes);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function runLfsPull(path: string | null) {
    if (busy || !trusted) return;
    setBusy(true);
    onLock?.(true);
    setError("");
    setNotice("");
    try {
      const outcome = await invoke<LfsActionOutcome>("pull_lfs_objects", {
        id: repoId,
        path,
      });
      setLfs(outcome.status);
      setNotice(outcome.message);
      await onUpdated();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      onLock?.(false);
      setBusy(false);
    }
  }

  async function handleRefreshLocks() {
    if (busy || !trusted) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const nextLocks = await invoke<LfsLock[]>("refresh_lfs_locks", {
        id: repoId,
      });
      setLfs((prev) => (prev ? { ...prev, locks: nextLocks } : prev));
      setNotice(`${nextLocks.length} bloqueo(s) LFS consultado(s).`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleLockFile(targetPath: string) {
    const trimmed = targetPath.trim();
    if (!trimmed || busy || !trusted) return;
    setBusy(true);
    onLock?.(true);
    setError("");
    setNotice("");
    try {
      const outcome = await invoke<LfsActionOutcome>("lock_lfs_file", {
        id: repoId,
        path: trimmed,
      });
      setLfs(outcome.status);
      if (targetPath === lockPathInput) setLockPathInput("");
      setNotice(outcome.message);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      onLock?.(false);
      setBusy(false);
    }
  }

  async function handleUnlockFile(targetPath: string, force = false) {
    if (busy || !trusted) return;
    setBusy(true);
    onLock?.(true);
    setError("");
    setNotice("");
    try {
      const outcome = await invoke<LfsActionOutcome>("unlock_lfs_file", {
        id: repoId,
        path: targetPath,
        force,
      });
      setLfs(outcome.status);
      setNotice(outcome.message);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      onLock?.(false);
      setBusy(false);
    }
  }

  async function runSubmoduleAction(action: SubmoduleAction) {
    if (busy || !trusted) return;
    setBusy(true);
    onLock?.(true);
    setError("");
    setNotice("");
    try {
      const outcome = await invoke<SubmoduleOutcome>("update_submodule", {
        id: repoId,
        action,
      });
      setSubmodules(outcome.list);
      setNotice(outcome.message);
      await onUpdated();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      onLock?.(false);
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="operation-dialog lfs-submodules-dialog"
      aria-labelledby="lfs-submodules-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="env-dialog-head">
        <div>
          <span className="trust-dialog-eyebrow">EXPANSIÓN GIT</span>
          <h2 id="lfs-submodules-title">Git LFS y Submódulos</h2>
          <p className="worktree-dialog-sub">
            Gestión local y controlada bajo demanda para{" "}
            <strong>{repoName}</strong>.
          </p>
        </div>
        <button
          type="button"
          className="modal-close"
          disabled={busy}
          onClick={onClose}
          aria-label="Cerrar Git LFS y Submódulos"
        >
          ×
        </button>
      </header>

      <div
        className="lfs-tabs"
        role="tablist"
        aria-label="Secciones LFS y Submódulos"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "lfs"}
          className={tab === "lfs" ? "button active" : "button"}
          onClick={() => setTab("lfs")}
        >
          Git LFS ({lfs?.files.length ?? 0})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "submodules"}
          className={tab === "submodules" ? "button active" : "button"}
          onClick={() => setTab("submodules")}
        >
          Submódulos ({submodules?.submodules.length ?? 0})
        </button>
      </div>

      {!trusted && (
        <div className="trust-warning-box" role="alert">
          <p>
            Este repositorio está en modo de solo lectura. Autorízalo antes de
            descargar objetos LFS, gestionar bloqueos o actualizar submódulos.
          </p>
          {onAuthorize && (
            <button
              type="button"
              className="primary-button"
              onClick={onAuthorize}
            >
              Autorizar este repositorio…
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="dialog-notice" role="status">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="muted-empty">Consultando estado local…</p>
      ) : tab === "lfs" ? (
        <div className="lfs-panel" role="tabpanel">
          <div className="snapshots-stats">
            <span>
              Binario LFS:{" "}
              <strong>
                {lfs?.installed
                  ? (lfs.version ?? "Instalado")
                  : "No detectado en PATH"}
              </strong>
            </span>
            <span>
              Caché local: <strong>{formatBytes(lfs?.cacheBytes ?? 0)}</strong>
            </span>
          </div>

          {lfs && lfs.trackedPatterns.length > 0 && (
            <p className="lfs-patterns">
              Patrones en <code>.gitattributes</code>:{" "}
              {lfs.trackedPatterns.map((pat) => (
                <code key={pat} className="lfs-pattern-chip">
                  {pat}
                </code>
              ))}
            </p>
          )}

          <div className="lfs-section-head">
            <h3>Archivos LFS</h3>
            <button
              type="button"
              className="primary-button"
              disabled={busy || !trusted || !lfs?.installed}
              onClick={() => void runLfsPull(null)}
            >
              Descargar objetos LFS (pull)
            </button>
          </div>

          {!lfs || lfs.files.length === 0 ? (
            <p className="muted-empty">
              No se detectaron archivos o punteros Git LFS en este repositorio.
            </p>
          ) : (
            <ul className="snapshots-list lfs-scroll-list">
              {lfs.files.map((file) => (
                <li key={`${file.oid}:${file.path}`} className="snapshot-item">
                  <div className="snapshot-item-main">
                    <div className="snapshot-item-title">
                      <span
                        className={`snap-trigger ${file.downloaded ? "" : "snap-trigger-auto"}`}
                      >
                        {file.downloaded ? "Descargado" : "Puntero"}
                      </span>
                      <strong>{file.path}</strong>
                    </div>
                    <div className="snapshot-item-meta">
                      <code>{file.oid.slice(0, 12)}</code>
                      {file.sizeLabel && <span>{file.sizeLabel}</span>}
                    </div>
                  </div>
                  <div className="snapshot-item-actions">
                    {!file.downloaded && (
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={busy || !trusted || !lfs.installed}
                        onClick={() => void runLfsPull(file.path)}
                      >
                        Descargar
                      </button>
                    )}
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy || !trusted || !lfs.installed}
                      onClick={() => void handleLockFile(file.path)}
                    >
                      Bloquear
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="lfs-section-head">
            <h3>Bloqueos de archivo (File Locks)</h3>
            <button
              type="button"
              className="ghost-button"
              disabled={busy || !trusted || !lfs?.installed}
              onClick={() => void handleRefreshLocks()}
            >
              Consultar bloqueos en remoto
            </button>
          </div>

          <form
            className="snapshots-capture-row"
            onSubmit={(e) => {
              e.preventDefault();
              void handleLockFile(lockPathInput);
            }}
          >
            <input
              type="text"
              value={lockPathInput}
              disabled={busy || !trusted || !lfs?.installed}
              placeholder="Ruta de archivo para bloquear (ej. assets/scene.blend)"
              aria-label="Ruta de archivo a bloquear"
              onChange={(e) => setLockPathInput(e.target.value)}
            />
            <button
              type="submit"
              className="ghost-button"
              disabled={
                busy || !trusted || !lfs?.installed || !lockPathInput.trim()
              }
            >
              Bloquear ruta
            </button>
          </form>

          {!lfs || lfs.locks.length === 0 ? (
            <p className="muted-empty">No hay bloqueos LFS registrados.</p>
          ) : (
            <ul className="snapshots-list lfs-scroll-list">
              {lfs.locks.map((lock) => (
                <li key={`${lock.id}:${lock.path}`} className="snapshot-item">
                  <div className="snapshot-item-main">
                    <strong>{lock.path}</strong>
                    <div className="snapshot-item-meta">
                      <span>Propietario: {lock.owner}</span>
                      {lock.lockedAt && <span>{lock.lockedAt}</span>}
                    </div>
                  </div>
                  <div className="snapshot-item-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy || !trusted || !lfs.installed}
                      onClick={() => void handleUnlockFile(lock.path, false)}
                    >
                      Desbloquear
                    </button>
                    <button
                      type="button"
                      className="ghost-button danger-button"
                      disabled={busy || !trusted || !lfs.installed}
                      onClick={() => void handleUnlockFile(lock.path, true)}
                    >
                      Forzar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="submodules-panel" role="tabpanel">
          <div className="lfs-section-head">
            <label className="snapshots-checkbox">
              <input
                type="checkbox"
                checked={recursive}
                disabled={busy}
                onChange={(e) => setRecursive(e.target.checked)}
              />
              <span>Actualización recursiva</span>
            </label>
            <button
              type="button"
              className="primary-button"
              disabled={
                busy ||
                !trusted ||
                !submodules ||
                submodules.submodules.length === 0
              }
              onClick={() =>
                void runSubmoduleAction({
                  kind: "initUpdate",
                  path: null,
                  recursive,
                })
              }
            >
              Actualizar todos
            </button>
          </div>

          {!submodules || submodules.submodules.length === 0 ? (
            <p className="muted-empty">
              Este repositorio no tiene submódulos Git configurados.
            </p>
          ) : (
            <ul className="snapshots-list lfs-scroll-list">
              {submodules.submodules.map((sub) => (
                <li key={sub.path} className="snapshot-item">
                  <div className="snapshot-item-main">
                    <div className="snapshot-item-title">
                      <span
                        className={`snap-trigger ${sub.status === "clean" ? "" : "snap-trigger-pre-op"}`}
                      >
                        {submoduleStatusLabel(sub.status)}
                      </span>
                      <strong>{sub.path}</strong>
                    </div>
                    <div className="snapshot-item-meta">
                      <code>{sub.head.slice(0, 7)}</code>
                      {sub.describe && <span>{sub.describe}</span>}
                      {sub.url && <span>{sub.url}</span>}
                    </div>
                  </div>
                  <div className="snapshot-item-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy || !trusted}
                      onClick={() =>
                        void runSubmoduleAction({
                          kind: "initUpdate",
                          path: sub.path,
                          recursive,
                        })
                      }
                    >
                      Actualizar
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy || !trusted}
                      onClick={() =>
                        void runSubmoduleAction({
                          kind: "syncUrls",
                          path: sub.path,
                        })
                      }
                    >
                      Sincronizar URL
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <footer className="dialog-actions">
        <button
          type="button"
          className="ghost-button"
          disabled={busy}
          onClick={onClose}
        >
          Cerrar
        </button>
      </footer>
    </dialog>
  );
}

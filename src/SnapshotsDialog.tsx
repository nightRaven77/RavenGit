import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SnapshotPreferences } from "./themes";
import type {
  SnapshotCaptureOutcome,
  SnapshotList,
  SnapshotRestoreOutcome,
  SnapshotRestorePlan,
} from "./types";

export interface SnapshotsDialogProps {
  repoId: string;
  repoName: string;
  trusted: boolean;
  preferences: SnapshotPreferences;
  onSavePreferences: (next: SnapshotPreferences) => Promise<void>;
  onAuthorize?: () => void;
  onRestored: () => Promise<void> | void;
  onLock?: (locked: boolean) => void;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function formatDate(tsSeconds: number): string {
  if (!tsSeconds) return "";
  try {
    return new Date(tsSeconds * 1000).toLocaleString();
  } catch {
    return "";
  }
}

function triggerLabel(trigger: string): string {
  if (trigger === "auto") return "Automático";
  if (trigger === "pre-restore") return "Respaldo previo";
  if (trigger === "pre-op") return "Previo";
  return "Manual";
}

function restoreActionLabel(action: string): string {
  if (action === "recreate") return "Recrear";
  if (action === "delete") return "Eliminar";
  if (action === "unchanged") return "Sin cambios";
  return "Restaurar";
}

function errorMessage(reason: unknown): string {
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message: unknown }).message);
  }
  if (reason instanceof Error) return reason.message;
  return String(reason || "Error desconocido.");
}

export default function SnapshotsDialog({
  repoId,
  repoName,
  trusted,
  preferences,
  onSavePreferences,
  onAuthorize,
  onRestored,
  onLock,
  onClose,
}: SnapshotsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [list, setList] = useState<SnapshotList>({
    snapshots: [],
    totalBytes: 0,
    count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [plan, setPlan] = useState<SnapshotRestorePlan | null>(null);

  const [autoEnabled, setAutoEnabled] = useState(preferences.autoEnabled);
  const [intervalMinutes, setIntervalMinutes] = useState(
    String(preferences.intervalMinutes),
  );
  const [maxSnapshots, setMaxSnapshots] = useState(
    String(preferences.maxSnapshots),
  );
  const [maxDiskMb, setMaxDiskMb] = useState(String(preferences.maxDiskMb));

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) {
      el.showModal?.();
    }
  }, []);

  useEffect(() => {
    setAutoEnabled(preferences.autoEnabled);
    setIntervalMinutes(String(preferences.intervalMinutes));
    setMaxSnapshots(String(preferences.maxSnapshots));
    setMaxDiskMb(String(preferences.maxDiskMb));
  }, [preferences]);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await invoke<SnapshotList>("read_snapshots", {
        id: repoId,
      });
      setList(next);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  async function handleCapture() {
    if (busy || !trusted) return;
    setBusy(true);
    onLock?.(true);
    setError("");
    setNotice("");
    try {
      const outcome = await invoke<SnapshotCaptureOutcome>("create_snapshot", {
        id: repoId,
        label: label.trim() || null,
        trigger: "manual",
      });
      setList(outcome.list);
      setLabel("");
      setNotice(outcome.message);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      onLock?.(false);
      setBusy(false);
    }
  }

  async function handleDelete(snapshotId: string) {
    if (busy || !trusted) return;
    setBusy(true);
    onLock?.(true);
    setError("");
    setNotice("");
    try {
      const next = await invoke<SnapshotList>("delete_snapshot", {
        id: repoId,
        snapshotId,
      });
      setList(next);
      if (plan?.snapshotId === snapshotId) {
        setPlan(null);
      }
      setNotice("Snapshot eliminado.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      onLock?.(false);
      setBusy(false);
    }
  }

  async function handlePreviewRestore(snapshotId: string) {
    if (busy || !trusted) return;
    setBusy(true);
    onLock?.(true);
    setError("");
    setNotice("");
    try {
      const nextPlan = await invoke<SnapshotRestorePlan>(
        "preview_snapshot_restore",
        {
          id: repoId,
          snapshotId,
        },
      );
      setPlan(nextPlan);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      onLock?.(false);
      setBusy(false);
    }
  }

  async function handleConfirmRestore() {
    if (!plan || busy || !trusted) return;
    setBusy(true);
    onLock?.(true);
    setError("");
    setNotice("");
    try {
      const outcome = await invoke<SnapshotRestoreOutcome>(
        "confirm_snapshot_restore",
        {
          id: repoId,
          token: plan.token,
        },
      );
      setPlan(null);
      setNotice(outcome.message);
      await loadSnapshots();
      await onRestored();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      onLock?.(false);
      setBusy(false);
    }
  }

  async function handleSaveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsedInterval = Number.parseInt(intervalMinutes, 10);
    const parsedMax = Number.parseInt(maxSnapshots, 10);
    const parsedDisk = Number.parseInt(maxDiskMb, 10);
    if (
      !Number.isFinite(parsedInterval) ||
      parsedInterval < 1 ||
      parsedInterval > 120
    ) {
      setError("El intervalo automático debe estar entre 1 y 120 minutos.");
      return;
    }
    if (!Number.isFinite(parsedMax) || parsedMax < 5 || parsedMax > 200) {
      setError("El máximo de snapshots debe estar entre 5 y 200.");
      return;
    }
    if (!Number.isFinite(parsedDisk) || parsedDisk < 10 || parsedDisk > 2048) {
      setError("El límite de disco debe estar entre 10 y 2048 MiB.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await onSavePreferences({
        autoEnabled,
        intervalMinutes: parsedInterval,
        maxSnapshots: parsedMax,
        maxDiskMb: parsedDisk,
      });
      setNotice("Preferencias de snapshots guardadas.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="operation-dialog snapshots-dialog"
      aria-labelledby="snapshots-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="env-dialog-head">
        <div>
          <span className="trust-dialog-eyebrow">SEGURIDAD LOCAL</span>
          <h2 id="snapshots-dialog-title">Snapshots locales</h2>
          <p className="worktree-dialog-sub">
            Respaldos rápidos en disco para <strong>{repoName}</strong> sin
            crear commits ni ensuciar el stash.
          </p>
        </div>
        <button
          type="button"
          className="modal-close"
          disabled={busy}
          onClick={onClose}
          aria-label="Cerrar snapshots"
        >
          ×
        </button>
      </header>

      <div className="snapshots-stats">
        <span>
          <strong>{list.count}</strong> snapshot(s) guardado(s)
        </span>
        <span>
          Uso local: <strong>{formatBytes(list.totalBytes)}</strong> /{" "}
          {preferences.maxDiskMb} MiB
        </span>
      </div>

      {!trusted ? (
        <div className="trust-warning-box" role="alert">
          <p>
            Este repositorio está en modo de solo lectura. Autorízalo antes de
            capturar, restaurar o eliminar snapshots del árbol de trabajo.
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
      ) : (
        <div className="snapshots-capture-row">
          <input
            type="text"
            value={label}
            disabled={busy}
            maxLength={120}
            placeholder="Etiqueta opcional (ej. Antes de refactorizar)"
            aria-label="Etiqueta del snapshot"
            onChange={(e) => setLabel(e.target.value)}
          />
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void handleCapture()}
          >
            Capturar snapshot ahora
          </button>
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

      {plan && (
        <section
          className="snapshot-restore-preview"
          aria-label="Vista previa de restauración"
        >
          <div className="snapshot-restore-head">
            <strong>Restaurar «{plan.label}»</strong>
            <span className="snapshot-restore-summary">{plan.summary}</span>
          </div>
          {(plan.branchMismatch || plan.headMismatch) && (
            <p className="snapshot-mismatch-warn">
              Atención: el snapshot se tomó en{" "}
              <code>{plan.snapshotBranch ?? "HEAD separado"}</code> (
              <code>{plan.snapshotHead?.slice(0, 7) ?? "sin HEAD"}</code>), y
              ahora estás en{" "}
              <code>{plan.currentBranch ?? "HEAD separado"}</code> (
              <code>{plan.currentHead?.slice(0, 7) ?? "sin HEAD"}</code>).
            </p>
          )}
          <ul className="snapshot-restore-files">
            {plan.files.map((item) => (
              <li key={item.path}>
                <span className={`snap-action snap-action-${item.action}`}>
                  {restoreActionLabel(item.action)}
                </span>
                <code>{item.path}</code>
              </li>
            ))}
          </ul>
          <div className="dialog-actions">
            <button
              type="button"
              className="ghost-button"
              disabled={busy}
              onClick={() => setPlan(null)}
            >
              Cancelar vista previa
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => void handleConfirmRestore()}
            >
              Confirmar restauración
            </button>
          </div>
        </section>
      )}

      <div className="snapshots-list-wrap">
        {loading ? (
          <p className="muted-empty">Cargando snapshots locales…</p>
        ) : list.snapshots.length === 0 ? (
          <p className="muted-empty">
            No hay snapshots guardados todavía para este repositorio.
          </p>
        ) : (
          <ul className="snapshots-list">
            {list.snapshots.map((snap) => (
              <li key={snap.id} className="snapshot-item">
                <div className="snapshot-item-main">
                  <div className="snapshot-item-title">
                    <span
                      className={`snap-trigger snap-trigger-${snap.trigger}`}
                    >
                      {triggerLabel(snap.trigger)}
                    </span>
                    <strong>{snap.label}</strong>
                  </div>
                  <div className="snapshot-item-meta">
                    <span>{formatDate(snap.createdAt)}</span>
                    <span>
                      <code>{snap.branch ?? "HEAD separado"}</code>
                      {snap.head ? ` · ${snap.head.slice(0, 7)}` : ""}
                    </span>
                    <span>
                      {snap.fileCount} archivo(s) ·{" "}
                      {formatBytes(snap.totalBytes)}
                    </span>
                  </div>
                  <details className="snapshot-files-details">
                    <summary>Ver archivos capturados</summary>
                    <ul>
                      {snap.files.map((f) => (
                        <li key={f.path}>
                          <code>{f.status}</code> {f.path}{" "}
                          <span className="muted">
                            ({f.existed ? formatBytes(f.size) : "eliminado"})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
                <div className="snapshot-item-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy || !trusted}
                    onClick={() => void handlePreviewRestore(snap.id)}
                  >
                    Restaurar…
                  </button>
                  <button
                    type="button"
                    className="ghost-button danger-button"
                    disabled={busy || !trusted}
                    onClick={() => void handleDelete(snap.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="snapshots-settings">
        <summary>Configuración de snapshots automáticos y retención</summary>
        <form className="snapshots-settings-form" onSubmit={handleSaveSettings}>
          <label className="snapshots-checkbox">
            <input
              type="checkbox"
              checked={autoEnabled}
              disabled={busy}
              onChange={(e) => setAutoEnabled(e.target.checked)}
            />
            <span>Capturar snapshot automático si hay cambios pendientes</span>
          </label>
          <div className="snapshots-settings-grid">
            <label>
              <span>Intervalo (min)</span>
              <input
                type="number"
                min={1}
                max={120}
                value={intervalMinutes}
                disabled={busy}
                onChange={(e) => setIntervalMinutes(e.target.value)}
              />
            </label>
            <label>
              <span>Máx. snapshots</span>
              <input
                type="number"
                min={5}
                max={200}
                value={maxSnapshots}
                disabled={busy}
                onChange={(e) => setMaxSnapshots(e.target.value)}
              />
            </label>
            <label>
              <span>Tope disco (MiB)</span>
              <input
                type="number"
                min={10}
                max={2048}
                value={maxDiskMb}
                disabled={busy}
                onChange={(e) => setMaxDiskMb(e.target.value)}
              />
            </label>
          </div>
          <div className="dialog-actions">
            <button type="submit" className="ghost-button" disabled={busy}>
              Guardar configuración
            </button>
          </div>
        </form>
      </details>

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

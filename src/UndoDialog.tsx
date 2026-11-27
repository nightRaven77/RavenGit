import { useEffect, useRef } from "react";
import type { UndoPlan } from "./types";

export interface UndoDialogProps {
  plan: UndoPlan;
  undoCount: number;
  redoCount: number;
  busy: boolean;
  error: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

function formatState(branch: string | null, head: string | null): string {
  const shortHead = head ? head.slice(0, 7) : "sin commit";
  if (branch) return `${branch} (${shortHead})`;
  return `HEAD separado (${shortHead})`;
}

export default function UndoDialog({
  plan,
  undoCount,
  redoCount,
  busy,
  error,
  onConfirm,
  onClose,
}: UndoDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) {
      el.showModal?.();
    }
  }, []);

  const isRedo = plan.direction === "redo";
  const title = isRedo ? "Rehacer operación" : "Deshacer operación";
  const confirmLabel = isRedo ? "Confirmar rehacer" : "Confirmar deshacer";

  return (
    <dialog
      ref={dialogRef}
      className="operation-dialog undo-dialog"
      aria-labelledby="undo-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="env-dialog-head">
        <div>
          <span className="trust-dialog-eyebrow">SEGURIDAD LOCAL</span>
          <h2 id="undo-dialog-title">{title}</h2>
          <p className="worktree-dialog-sub">
            Revisa el movimiento de referencias antes de confirmar.
          </p>
        </div>
        <button
          type="button"
          className="modal-close"
          disabled={busy}
          onClick={onClose}
          aria-label="Cerrar diálogo de deshacer"
        >
          ×
        </button>
      </header>

      <section className="undo-detail-card">
        <div className="undo-op-header">
          <span className="snap-trigger snap-trigger-manual">
            {plan.entry.kind}
          </span>
          <strong>{plan.entry.label}</strong>
        </div>

        <div className="undo-transition">
          <div>
            <span className="undo-label">Actual</span>
            <code>{formatState(plan.currentBranch, plan.currentHead)}</code>
          </div>
          <span className="undo-arrow" aria-hidden="true">
            →
          </span>
          <div>
            <span className="undo-label">Destino</span>
            <code>{formatState(plan.targetBranch, plan.targetHead)}</code>
          </div>
        </div>

        <p className="undo-summary">{plan.summary}</p>
      </section>

      {plan.warning && (
        <div className="trust-warning-box" role="alert">
          <p>{plan.warning}</p>
        </div>
      )}

      {error && (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}

      <p className="undo-counts">
        Historial local: Deshacer ({undoCount}) · Rehacer ({redoCount})
      </p>

      <footer className="dialog-actions">
        <button
          type="button"
          className="ghost-button"
          disabled={busy}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => void onConfirm()}
        >
          {busy ? "Aplicando…" : confirmLabel}
        </button>
      </footer>
    </dialog>
  );
}

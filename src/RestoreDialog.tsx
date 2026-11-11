import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MutationResult } from "./types";
import { emitOperation, nextOperationId } from "./operations";

export type RestorePlan = {
  token: string;
  path: string;
  diff: string;
  currentContent: string;
  targetContent: string;
  isRedo: boolean;
  backupId: string;
};

export type RestoreOutcome = {
  result: MutationResult;
  backup: string;
  isRedo: boolean;
  message: string;
};

const messageOf = (error: unknown) =>
  typeof error === "object" && error && "message" in error
    ? String(error.message)
    : "No se pudo completar la operación. Actualiza antes de continuar.";

function navigateContent(event: KeyboardEvent<HTMLPreElement>) {
  if (event.altKey || event.shiftKey) return;
  const start =
    event.key === "Home" || (event.metaKey && event.key === "ArrowUp");
  const end =
    event.key === "End" || (event.metaKey && event.key === "ArrowDown");
  if (!start && !end) return;
  event.preventDefault();
  event.currentTarget.scrollTop = start ? 0 : event.currentTarget.scrollHeight;
}

export default function RestoreDialog({
  repoId,
  path,
  isRedo,
  onClose,
  onLock,
  onRestored,
}: {
  repoId: string;
  path: string;
  isRedo: boolean;
  onClose: () => void;
  onLock: (busy: boolean) => void;
  onRestored: (result: MutationResult) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const flight = useRef(false);
  const request = useRef(0);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const sequence = ++request.current;
    setLoading(true);
    setError("");
    setPlan(null);
    setConfirmed(false);
    try {
      const p = await invoke<RestorePlan>("preview_worktree_restore", {
        id: repoId,
        path,
        isRedo,
      });
      if (sequence === request.current) {
        setPlan(p);
      }
    } catch (err) {
      if (sequence === request.current) {
        setError(messageOf(err));
      }
    } finally {
      if (sequence === request.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const el = dialog.current;
    const previous = document.activeElement;
    el?.showModal();
    void load();
    return () => {
      request.current++;
      el?.close();
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, [repoId, path, isRedo]);

  function close() {
    if (flight.current) return;
    request.current++;
    dialog.current?.close();
    onClose();
  }

  async function handleConfirm() {
    if (!plan || !confirmed || flight.current || busy) return;
    flight.current = true;
    setBusy(true);
    onLock(true);
    setError("");
    const opId = nextOperationId();
    emitOperation({
      id: opId,
      repoId,
      operation: isRedo ? "stage" : "unstage",
      status: "progress",
      title: isRedo ? "Rehaciendo cambios" : "Restaurando archivo",
      message: isRedo
        ? "Aplicando respaldo al archivo de trabajo…"
        : "Restaurando versión del índice con respaldo…",
    });

    try {
      const outcome = await invoke<RestoreOutcome>("confirm_worktree_restore", {
        id: repoId,
        token: plan.token,
      });
      setNotice(outcome.message);
      emitOperation({
        id: opId,
        repoId,
        operation: isRedo ? "stage" : "unstage",
        status: "confirmed",
        title: isRedo ? "Cambios rehechos" : "Archivo restaurado",
        message: outcome.message,
      });
      await onRestored(outcome.result);
      flight.current = false;
      close();
    } catch (err) {
      const msg = messageOf(err);
      setError(msg);
      emitOperation({
        id: opId,
        repoId,
        operation: isRedo ? "stage" : "unstage",
        status: "error",
        title: isRedo ? "Error al rehacer" : "Error al restaurar",
        message: msg,
      });
    } finally {
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="dialog confirm-dialog"
      aria-label={isRedo ? "Rehacer cambios de archivo" : "Restaurar archivo de trabajo"}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header className="dialog-header">
        <h2>{isRedo ? "Rehacer cambios respaldados" : "Restaurar archivo de trabajo"}</h2>
        <button
          className="button icon-only close-button"
          aria-label="Cerrar diálogo de restauración"
          disabled={busy}
          onClick={close}
        >
          ×
        </button>
      </header>

      <div className="dialog-body">
        <p className="dialog-description">
          Archivo: <code>{path}</code>
        </p>
        <p>
          {isRedo
            ? "Se aplicará la última copia de seguridad al archivo de trabajo."
            : "Se sustituirán las modificaciones de este archivo por la versión del índice. Se creará una copia de seguridad para que puedas rehacer los cambios."}
        </p>

        {loading && <p role="status">Calculando vista previa de restauración…</p>}

        {error && (
          <div className="banner error" role="alert">
            {error}
          </div>
        )}

        {notice && (
          <div className="banner success" role="status">
            {notice}
          </div>
        )}

        {plan && (
          <div className="restore-review">
            <p id="restore-diff-help">
              Revisión de diferencias que se aplicarán (Inicio/Fin para desplazarse):
            </p>
            <pre
              className="diff-view"
              tabIndex={0}
              aria-describedby="restore-diff-help"
              onKeyDown={navigateContent}
              style={{ maxHeight: "240px", overflow: "auto", whiteSpace: "pre-wrap" }}
            >
              {plan.diff || "Sin diferencias textuales calculables."}
            </pre>

            <div className="checkbox-row" style={{ marginTop: "1rem" }}>
              <label>
                <input
                  type="checkbox"
                  id="confirm-restore"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                {isRedo
                  ? "Confirmo rehacer los cambios respaldados"
                  : "Confirmo restaurar los bytes revisados con respaldo"}
              </label>
            </div>
          </div>
        )}
      </div>

      <footer className="dialog-footer">
        <button className="button" disabled={busy} onClick={close}>
          Cancelar
        </button>
        <button
          className="button primary"
          disabled={!plan || !confirmed || busy || loading}
          onClick={() => void handleConfirm()}
        >
          {busy
            ? "Procesando…"
            : isRedo
              ? "Confirmar rehacer"
              : "Confirmar restauración"}
        </button>
      </footer>
    </dialog>
  );
}

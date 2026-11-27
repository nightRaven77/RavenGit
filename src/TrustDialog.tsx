import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckIcon, LockClosedIcon } from "@radix-ui/react-icons";

export interface TrustDialogProps {
  repoId: string;
  repoName: string;
  repoPath: string;
  onAuthorized: () => void;
  onReadOnly: () => void;
  onLock: (busy: boolean) => void;
}

const errorMessage = (reason: unknown) =>
  typeof reason === "object" && reason && "message" in reason
    ? String((reason as { message: unknown }).message)
    : String(reason);

export default function TrustDialog({
  repoId,
  repoName,
  repoPath,
  onAuthorized,
  onReadOnly,
  onLock,
}: TrustDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const flightRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) {
      el.showModal?.();
    }
  }, []);

  async function handleAuthorize() {
    if (flightRef.current) return;
    flightRef.current = true;
    setBusy(true);
    onLock(true);
    setError("");
    try {
      await invoke("authorize_repository", { id: repoId });
      onAuthorized();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      flightRef.current = false;
      setBusy(false);
      onLock(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="operation-dialog trust-dialog"
      aria-labelledby="trust-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onReadOnly();
      }}
    >
      <header className="trust-dialog-head">
        <div className="trust-dialog-title-wrap">
          <span className="trust-dialog-icon" aria-hidden="true">
            <LockClosedIcon />
          </span>
          <div>
            <span className="trust-dialog-eyebrow">CONFIANZA LOCAL</span>
            <h2 id="trust-dialog-title">
              ¿Autorizar operaciones en {repoName}?
            </h2>
            <p className="trust-dialog-sub">
              Confirma esta carpeta antes de habilitar escritura y detección en
              vivo.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="modal-close"
          onClick={onReadOnly}
          disabled={busy}
          aria-label="Cerrar autorización"
        >
          ×
        </button>
      </header>

      <div className="trust-dialog-body">
        <div className="trust-path-card">
          <span className="trust-path-label">Ubicación del repositorio</span>
          <code className="trust-dialog-path" title={repoPath}>
            {repoPath}
          </code>
        </div>

        <ul className="trust-checklist">
          <li>
            <CheckIcon aria-hidden="true" />
            <span>
              Detecta cambios locales en vivo (fila WIP y contador en pestaña).
            </span>
          </li>
          <li>
            <CheckIcon aria-hidden="true" />
            <span>
              Habilita preparar archivos, commits, ramas, stash y worktrees.
            </span>
          </li>
          <li>
            <CheckIcon aria-hidden="true" />
            <span>
              Permite que Git ejecute filtros, hooks y firma locales
              configurados en este repo.
            </span>
          </li>
        </ul>

        <div className="trust-privacy-note">
          <LockClosedIcon aria-hidden="true" />
          <span>
            Se recuerda sólo en este equipo · Nunca contacta remotos
            automáticamente.
          </span>
        </div>

        {error && (
          <div className="banner error" role="alert">
            <span>{error}</span>
          </div>
        )}
      </div>

      <footer className="trust-dialog-actions">
        <button
          type="button"
          className="button"
          onClick={onReadOnly}
          disabled={busy}
        >
          Continuar en solo lectura
        </button>
        <button
          type="button"
          className="button primary"
          onClick={() => void handleAuthorize()}
          disabled={busy}
        >
          Autorizar este repositorio
        </button>
      </footer>
    </dialog>
  );
}

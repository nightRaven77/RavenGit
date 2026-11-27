import { useEffect, useRef, useState } from "react";
import {
  CheckCircledIcon,
  ExclamationTriangleIcon,
  InfoCircledIcon,
} from "@radix-ui/react-icons";
import type { EnvironmentStatus } from "./types";

export interface EnvironmentDialogProps {
  status: EnvironmentStatus | null;
  checking: boolean;
  onRecheck: () => Promise<void>;
  onClose: () => void;
}

function installGuide(os: string | undefined): {
  title: string;
  command: string;
  hint: string;
  url: string;
} {
  if (os === "windows") {
    return {
      title: "Instalar Git en Windows",
      command: "winget install --id Git.Git -e --source winget",
      hint: "También puedes instalarlo desde el instalador oficial de git-scm.com y reiniciar RavenGit o pulsar «Volver a comprobar».",
      url: "https://git-scm.com/download/win",
    };
  }
  if (os === "macos") {
    return {
      title: "Instalar Git en macOS",
      command: "xcode-select --install",
      hint: "También puedes usar Homebrew con «brew install git».",
      url: "https://git-scm.com/download/mac",
    };
  }
  return {
    title: "Instalar Git en Linux",
    command: "sudo apt install git",
    hint: "Usa el gestor de paquetes de tu distribución (apt, dnf, pacman, zypper).",
    url: "https://git-scm.com/download/linux",
  };
}

export default function EnvironmentDialog({
  status,
  checking,
  onRecheck,
  onClose,
}: EnvironmentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) {
      el.showModal?.();
    }
  }, []);

  const guide = installGuide(status?.os);

  function copyCommand() {
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(guide.command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="operation-dialog env-dialog"
      aria-labelledby="env-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="env-dialog-head">
        <div>
          <span className="trust-dialog-eyebrow">ENTORNO Y MOTOR GIT</span>
          <h2 id="env-dialog-title">Entorno y motor Git</h2>
          <p className="worktree-dialog-sub">
            Estado del motor híbrido local (`gix` + Git CLI) y herramientas
            detectadas en este equipo.
          </p>
        </div>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Cerrar diagnóstico de entorno"
        >
          ×
        </button>
      </header>

      <div className="env-cards">
        <div className="env-card">
          <div className="env-card-main">
            <span className="env-card-icon ok" aria-hidden="true">
              <CheckCircledIcon />
            </span>
            <div>
              <strong>Motor nativo gix (gitoxide)</strong>
              <p>
                Lecturas rápidas de referencias e historial en memoria, embebido
                en RavenGit sin instalación extra.
              </p>
            </div>
          </div>
          <span className="env-status-pill ok">
            {status?.gixEnabled === false ? "Inactivo" : "Activo"}
          </span>
        </div>

        <div className="env-card">
          <div className="env-card-main">
            <span
              className={`env-card-icon ${status?.gitAvailable ? "ok" : "warn"}`}
              aria-hidden="true"
            >
              {status?.gitAvailable ? (
                <CheckCircledIcon />
              ) : (
                <ExclamationTriangleIcon />
              )}
            </span>
            <div>
              <strong>Git CLI base (`git`)</strong>
              <p>
                {status?.gitAvailable
                  ? (status.gitVersion ?? "Disponible en PATH")
                  : "No detectado en el sistema. Es necesario para escrituras, hooks y operaciones remotas."}
              </p>
            </div>
          </div>
          <span
            className={`env-status-pill ${status?.gitAvailable ? "ok" : "warn"}`}
          >
            {status?.gitAvailable ? "Disponible" : "Faltante"}
          </span>
        </div>

        <div className="env-card">
          <div className="env-card-main">
            <span
              className={`env-card-icon ${status?.lfsAvailable ? "ok" : "muted"}`}
              aria-hidden="true"
            >
              {status?.lfsAvailable ? (
                <CheckCircledIcon />
              ) : (
                <InfoCircledIcon />
              )}
            </span>
            <div>
              <strong>Git LFS (opcional)</strong>
              <p>
                {status?.lfsAvailable
                  ? (status.lfsVersion ?? "Disponible en PATH")
                  : "No detectado. Sólo es necesario para repositorios con archivos grandes en LFS."}
              </p>
            </div>
          </div>
          <span
            className={`env-status-pill ${status?.lfsAvailable ? "ok" : "muted"}`}
          >
            {status?.lfsAvailable ? "Disponible" : "No detectado"}
          </span>
        </div>
      </div>

      {status && !status.gitAvailable && (
        <section
          className="env-install-box"
          aria-label="Guía rápida para instalar Git"
        >
          <h3>{guide.title}</h3>
          <div className="env-install-cmd-row">
            <code>{guide.command}</code>
            <button
              type="button"
              className="button"
              onClick={copyCommand}
              aria-label="Copiar comando de instalación"
            >
              {copied ? "Copiado" : "Copiar comando"}
            </button>
          </div>
          <p>{guide.hint}</p>
          <p className="env-install-url">Descarga oficial: {guide.url}</p>
        </section>
      )}

      <footer className="trust-dialog-actions">
        <button
          type="button"
          className="button"
          onClick={() => void onRecheck()}
          disabled={checking}
        >
          {checking ? "Comprobando…" : "Volver a comprobar"}
        </button>
        <button type="button" className="button primary" onClick={onClose}>
          Cerrar
        </button>
      </footer>
    </dialog>
  );
}

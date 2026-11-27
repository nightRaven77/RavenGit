import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LockClosedIcon } from "@radix-ui/react-icons";
import type { ForgeInfo, PullRequestItem, PullRequestsOutcome } from "./types";

export interface PullRequestsDialogProps {
  repoId: string;
  repoName: string;
  branches: readonly string[];
  cachedItems?: PullRequestItem[];
  onLoaded: (outcome: PullRequestsOutcome) => void;
  onAuthorize: () => void;
  onJumpToBranch: (branchRef: string) => void;
  onClose: () => void;
}

function errorMessage(reason: unknown): string {
  if (typeof reason === "object" && reason && "message" in reason) {
    return String(reason.message);
  }
  return "No se pudo completar la operación con el proveedor remoto.";
}

export default function PullRequestsDialog({
  repoId,
  repoName,
  branches,
  cachedItems,
  onLoaded,
  onAuthorize,
  onJumpToBranch,
  onClose,
}: PullRequestsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [info, setInfo] = useState<ForgeInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<PullRequestItem[] | null>(
    cachedItems ?? null,
  );
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    const previous = document.activeElement;
    el?.showModal?.();
    return () => {
      el?.close?.();
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingInfo(true);
    setError("");
    void invoke<ForgeInfo>("read_forge_info", { id: repoId })
      .then((loaded) => {
        if (active) setInfo(loaded);
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setLoadingInfo(false);
      });
    return () => {
      active = false;
    };
  }, [repoId]);

  async function handleFetch() {
    setFetching(true);
    setError("");
    try {
      const outcome = await invoke<PullRequestsOutcome>("fetch_pull_requests", {
        id: repoId,
      });
      setItems(outcome.items);
      setFetchedAt(outcome.fetchedAt);
      onLoaded(outcome);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setFetching(false);
    }
  }

  async function handleOpenUrl(url: string) {
    setError("");
    try {
      await invoke<string>("open_forge_url", { id: repoId, url });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  const providerLabel =
    info?.provider === "github"
      ? "GitHub"
      : info?.provider === "gitlab"
        ? "GitLab"
        : "Proveedor no detectado";
  const isGitlab = info?.provider === "gitlab";
  const nounPlural = isGitlab ? "MRs" : "PRs";

  return (
    <dialog
      ref={dialogRef}
      className="operation-dialog pr-dialog"
      aria-labelledby="pr-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <header className="env-dialog-head">
        <div>
          <span className="trust-dialog-eyebrow">INTEGRACIÓN OPT-IN</span>
          <h2 id="pr-dialog-title">Pull Requests / MRs · {repoName}</h2>
          <p className="worktree-dialog-sub">
            Consulta explícita bajo demanda mediante tu CLI local (
            <code>gh</code> / <code>glab</code>).
          </p>
        </div>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Cerrar Pull Requests"
        >
          ×
        </button>
      </header>

      <div className="banner notice pr-privacy-note" role="status">
        <LockClosedIcon aria-hidden="true" />
        <span>
          RavenGit nunca consulta GitHub ni GitLab en segundo plano. Pulsa
          «Consultar PRs / MRs» cuando quieras actualizar la lista.
        </span>
      </div>

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      {loadingInfo ? (
        <p className="pr-muted">Inspeccionando remotos locales…</p>
      ) : info ? (
        <section className="pr-meta-card" aria-label="Proveedor remoto">
          <div className="pr-meta-row">
            <div>
              <strong>{providerLabel}</strong>
              {info.repoSlug ? (
                <p>
                  Remoto <code>{info.remoteName}</code> ·{" "}
                  <code>{info.repoSlug}</code>
                </p>
              ) : (
                <p>
                  No se detectó un remoto HTTPS/SSH de GitHub ni GitLab en este
                  repositorio.
                </p>
              )}
            </div>
            {info.cliName && (
              <span
                className={`env-status-pill ${info.cliAvailable ? "ok" : "warn"}`}
              >
                {info.cliAvailable
                  ? `${info.cliName} disponible`
                  : `Falta ${info.cliName}`}
              </span>
            )}
          </div>

          {!info.trusted && (
            <div className="pr-untrusted-row">
              <span>
                El repositorio está en modo solo lectura. Autorízalo antes de
                consultar o abrir enlaces del proveedor.
              </span>
              <button
                type="button"
                className="button primary"
                onClick={onAuthorize}
              >
                Autorizar repositorio…
              </button>
            </div>
          )}

          <div className="pr-actions-row">
            <button
              type="button"
              className="button primary"
              disabled={
                fetching ||
                !info.trusted ||
                !info.provider ||
                !info.cliAvailable
              }
              onClick={() => void handleFetch()}
            >
              {fetching ? `Consultando ${nounPlural}…` : "Consultar PRs / MRs"}
            </button>
            {info.createPrUrl && info.currentBranch && (
              <button
                type="button"
                className="button"
                disabled={!info.trusted}
                onClick={() => void handleOpenUrl(info.createPrUrl!)}
              >
                Crear {isGitlab ? "MR" : "PR"} para {info.currentBranch}
              </button>
            )}
            {info.webUrl && (
              <button
                type="button"
                className="button"
                disabled={!info.trusted}
                onClick={() => void handleOpenUrl(info.webUrl!)}
              >
                Abrir repositorio en {providerLabel}
              </button>
            )}
          </div>
        </section>
      ) : null}

      <div className="pr-results">
        {items === null ? (
          <p className="pr-muted">
            No se ha realizado ninguna consulta de red en esta sesión.
          </p>
        ) : items.length === 0 ? (
          <p className="pr-muted">
            No hay {nounPlural} abiertos en este repositorio.
          </p>
        ) : (
          <>
            <div className="pr-results-head">
              <strong>
                {items.length} {nounPlural} abiertos
              </strong>
              {fetchedAt && (
                <span>
                  Actualizado a las{" "}
                  {new Date(fetchedAt * 1000).toLocaleTimeString("es-MX")}
                </span>
              )}
            </div>
            <ul className="pr-list">
              {items.map((item) => {
                const localBranchRef = `refs/heads/${item.headBranch}`;
                const hasLocalBranch = branches.includes(localBranchRef);
                return (
                  <li key={item.number} className="pr-item">
                    <div className="pr-item-main">
                      <div className="pr-item-title-row">
                        <code className="pr-number">#{item.number}</code>
                        <span
                          className={`pr-state-pill ${item.state === "draft" ? "draft" : "open"}`}
                        >
                          {item.state === "draft" ? "Borrador" : "Abierto"}
                        </span>
                        <strong className="pr-title">{item.title}</strong>
                      </div>
                      <div className="pr-item-meta">
                        <code>
                          {item.headBranch} → {item.baseBranch}
                        </code>
                        <span>por {item.author}</span>
                      </div>
                    </div>
                    <div className="pr-item-actions">
                      {hasLocalBranch && (
                        <button
                          type="button"
                          className="button"
                          onClick={() => {
                            onJumpToBranch(localBranchRef);
                            onClose();
                          }}
                        >
                          Localizar rama
                        </button>
                      )}
                      <button
                        type="button"
                        className="button"
                        disabled={!info?.trusted}
                        onClick={() => void handleOpenUrl(item.url)}
                      >
                        Abrir en navegador
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <footer className="shortcuts-footer">
        <span>
          Las credenciales permanecen en tu CLI oficial (<code>gh</code> /{" "}
          <code>glab</code>).
        </span>
        <button type="button" className="button" onClick={onClose}>
          Cerrar
        </button>
      </footer>
    </dialog>
  );
}

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BranchOutcome, PullOptions, PullPreview } from "./types";
import { emitOperation, nextOperationId } from "./operations";

type Props = {
  active: boolean;
  repoId: string;
  onLock: (value: boolean) => void;
  onUpdated: () => Promise<boolean>;
  onBranches: () => void;
};
const message = (error: unknown) =>
  typeof error === "object" && error && "message" in error
    ? String(error.message)
    : String(error);

export default function PullPanel({
  active,
  repoId,
  onLock,
  onUpdated,
  onBranches,
}: Props) {
  const [state, setState] = useState<PullOptions | null>(null);
  const [review, setReview] = useState<PullPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef(0);
  const flight = useRef(false);
  const allowed = !!state?.trusted && !state.restriction && !busy && !loading;
  async function reload(clearReview = true) {
    if (clearReview) setReview(null);
    const sequence = ++request.current;
    setLoading(true);
    setState(null);
    try {
      const next = await invoke<PullOptions>("read_pull_options", {
        id: repoId,
      });
      if (sequence === request.current) setState(next);
    } catch (error) {
      if (sequence === request.current) {
        setError(message(error));
        setReview(null);
      }
    } finally {
      if (sequence === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (active) {
      setError("");
      setNotice("");
      void reload();
    }
    return () => {
      request.current++;
    };
  }, [active, repoId]);

  async function perform(kind: "authorize" | "preview" | "integrate") {
    if (
      flight.current ||
      loading ||
      !state ||
      (kind !== "authorize" && !allowed) ||
      (kind === "integrate" && !review)
    )
      return;
    flight.current = true;
    const operationId = nextOperationId();
    const operation =
      kind === "preview" ? "fetch" : kind === "integrate" ? "pull" : "trust";
    const destination =
      kind === "preview"
        ? `${state.remote ?? "remoto"}/${state.remoteBranch ?? "upstream"}`
        : kind === "integrate"
          ? (state.branch ?? "Rama actual")
          : "Confianza local";
    setBusy(true);
    onLock(true);
    setError("");
    setNotice("");
    setReview(null);
    emitOperation({
      id: operationId,
      repoId,
      operation,
      status: "progress",
      title:
        kind === "preview"
          ? "Fetch en curso"
          : kind === "integrate"
            ? "Integrando Pull"
            : "Autorizando repositorio",
      destination,
      message:
        kind === "integrate"
          ? "Integrando mediante merge explícito…"
          : "Aplicando la operación revisada…",
    });
    try {
      let resultMessage =
        "Repositorio autorizado para operaciones locales y de red.";
      let resultWarning = "";
      if (kind === "authorize")
        await invoke("authorize_repository", { id: repoId });
      else if (kind === "preview") {
        const next = await invoke<PullPreview>("preview_pull", {
          id: repoId,
          token: state.token,
        });
        setReview(next);
        resultMessage =
          "Fetch completado. No se han integrado cambios: revisa los commits y confirma el merge por separado.";
        setNotice(resultMessage);
      } else {
        const result = await invoke<BranchOutcome>("integrate_pull", {
          id: repoId,
          previewToken: review!.token,
        });
        resultMessage = result.message;
        resultWarning = result.warning ?? "";
        setNotice([resultMessage, resultWarning].filter(Boolean).join(" "));
      }
      if (kind !== "authorize" && !(await onUpdated())) {
        resultWarning = [
          resultWarning,
          "No se pudo actualizar el historial. Actualiza la vista sin repetir la operación.",
        ]
          .filter(Boolean)
          .join(" ");
        setNotice(
          (previous) =>
            `${previous} No se pudo actualizar el historial. No repitas la operación para refrescarlo.`,
        );
      }
      emitOperation({
        id: operationId,
        repoId,
        operation,
        status: resultWarning ? "warning" : "confirmed",
        title:
          kind === "preview"
            ? "Fetch completado"
            : kind === "integrate"
              ? "Pull integrado"
              : "Repositorio autorizado",
        destination,
        message: resultMessage,
        warning: resultWarning || undefined,
      });
    } catch (error) {
      setReview(null);
      const text = message(error);
      setError(text);
      emitOperation({
        id: operationId,
        repoId,
        operation,
        status: "error",
        title:
          kind === "preview"
            ? "Fetch no completado"
            : kind === "integrate"
              ? "Pull no integrado"
              : "Autorización no completada",
        destination,
        message: text,
      });
      if (kind !== "authorize") await onUpdated();
    } finally {
      await reload(kind !== "preview");
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }
  return (
    <>
      <section
        id="pull-content"
        tabIndex={-1}
        hidden={!active}
        className="history-panel remote-panel"
        aria-label="Pull seguro"
      >
        <div className="panel-heading">
          <div>
            <h1>Pull seguro</h1>
            <p>Fetch y merge son pasos separados</p>
          </div>
          <button
            className="button"
            disabled={busy || loading}
            onClick={() => {
              setError("");
              void reload();
            }}
          >
            Actualizar Pull
          </button>
        </div>
        <div className="remote-body">
          {error && (
            <div className="banner error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="banner" role="status">
              {notice}
            </div>
          )}
          {loading && <p role="status">Leyendo el seguimiento local…</p>}
          {state && !state.trusted && (
            <section className="trust-panel">
              <h2>Autorizar este repositorio</h2>
              <p>
                Git puede ejecutar filtros y hooks configurados. Autoriza sólo
                repositorios y configuración de confianza. Se recordará en este
                equipo y podrás revocarlo desde Cambios; la autorización se
                comparte con Remotos y Ramas.
              </p>
              <button
                className="button primary"
                disabled={busy || loading}
                onClick={() => void perform("authorize")}
              >
                Autorizar operaciones
              </button>
            </section>
          )}
          {state?.trusted && (
            <section className="remote-form">
              <h2>Destino y upstream</h2>
              <p>
                Rama local: <strong>{state.branch ?? "HEAD separado"}</strong>
              </p>
              <p>
                Remoto: <strong>{state.remote ?? "Sin configurar"}</strong>
              </p>
              <p>
                Rama remota:{" "}
                <strong>{state.remoteBranch ?? "Sin configurar"}</strong>
              </p>
              <p>{state.url}</p>
              {state.restriction && (
                <div className="banner warning" role="status">
                  {state.restriction}
                </div>
              )}
              <p>
                Confirmar Fetch contacta este remoto y actualiza sólo la
                referencia vinculada. No cambia tus archivos, el índice, la rama
                activa ni FETCH_HEAD. No hace merge automáticamente.
              </p>
              <button
                className="button primary"
                disabled={!allowed}
                onClick={() => void perform("preview")}
              >
                Confirmar Fetch y revisar Pull
              </button>
              <p>
                La integración utiliza merge explícito, nunca rebase ni una
                estrategia elegida silenciosamente desde la configuración de
                Pull.
              </p>
              <button
                className="button"
                disabled={busy || loading}
                onClick={onBranches}
              >
                Gestionar merge en Ramas
              </button>
            </section>
          )}
        </div>
      </section>
      <aside
        className="inspector remote-panel"
        hidden={!active}
        aria-label="Revisión de Pull"
      >
        <div className="panel-heading">
          <div>
            <h2>Revisar antes de integrar</h2>
            <p>Sin stash ni descarte implícito</p>
          </div>
        </div>
        <div className="remote-body">
          {!review ? (
            <p>
              Confirma Fetch para obtener una revisión actualizada. Abrir Pull
              no contacta al servidor.
            </p>
          ) : (
            <section className="remote-form">
              <p>
                Origen:{" "}
                <strong>
                  {review.remote}/{review.remoteBranch}
                </strong>{" "}
                · Destino: <strong>{review.merge.destination}</strong>
              </p>
              <p>
                <code>{review.merge.sourceHash.slice(0, 8)}</code> →{" "}
                <code>{review.merge.destinationHash.slice(0, 8)}</code>
              </p>
              <p>
                Fetch confirmado:{" "}
                {new Date(review.fetchedAt * 1000).toLocaleString()}. El
                servidor puede cambiar después; se integra únicamente este
                commit revisado, sin otra conexión al confirmar.
              </p>
              <p>
                {review.merge.relation === "upToDate"
                  ? "La rama local ya contiene estos commits."
                  : review.merge.relation === "fastForward"
                    ? "Avance directo (fast-forward) disponible."
                    : "Ramas divergentes: merge de dos padres, con posible resolución de conflictos."}
              </p>
              <p>
                {review.merge.incoming} commits entrantes · {review.merge.local}{" "}
                exclusivos de tu rama.
              </p>
              <ul aria-label="Commits entrantes de Pull">
                {review.merge.commits.map((commit) => (
                  <li key={commit.hash}>
                    <code>{commit.hash.slice(0, 8)}</code> {commit.subject}
                  </li>
                ))}
              </ul>
              {review.merge.truncated && (
                <p>Se muestran los primeros 100 commits entrantes.</p>
              )}
              <p>
                Fast-forward avanza directamente. Si hay divergencia, se detiene
                antes del commit: revisa, resuelve y continúa o aborta desde
                Ramas, incluso después de reiniciar.
              </p>
              <button
                className="button primary"
                disabled={
                  !allowed ||
                  review.merge.shallow ||
                  review.merge.relation === "upToDate"
                }
                onClick={() => void perform("integrate")}
              >
                Confirmar integración con merge
              </button>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

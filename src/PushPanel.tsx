import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowRightIcon,
  UploadIcon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";
import type {
  PushOptions,
  PushPreview,
  PushOutcome,
  RemotesState,
} from "./types";
import type { OperationResult } from "./OperationNotice";
type Props = {
  repository?: { name: string; path: string };
  onResult?: (result: OperationResult) => void;
  active: boolean;
  repoId: string;
  onLock: (value: boolean) => void;
  onUpdated: () => Promise<boolean>;
};
const errorText = (e: unknown) =>
  typeof e === "object" && e && "message" in e
    ? String(e.message)
    : "La operación no pudo completarse. Revisa el estado antes de continuar.";
const relations = {
  new: "Crear rama remota",
  equal: "Ramas al día",
  ahead: "Avance directo disponible",
  behind: "Tu rama está atrasada",
  diverged: "Las ramas han divergido",
};
export default function PushPanel({
  active,
  repoId,
  repository,
  onResult,
  onLock,
  onUpdated,
}: Props) {
  const [state, setState] = useState<RemotesState | null>(null),
    [options, setOptions] = useState<PushOptions | null>(null);
  const [remoteName, setRemoteName] = useState(""),
    [source, setSource] = useState(""),
    [target, setTarget] = useState(""),
    [upstream, setUpstream] = useState(false);
  const [review, setReview] = useState<PushPreview | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [warning, setWarning] = useState("");
  const flight = useRef(false),
    request = useRef(0);
  const remote = state?.remotes.find((r) => r.name === remoteName);
  const sameDestination =
    !!remote &&
    remote.fetchUrls.length === 1 &&
    remote.pushUrls.length === 1 &&
    remote.fetchUrls[0] === remote.pushUrls[0];
  const enabled = !!state?.trusted && !busy && !loading;
  async function reload() {
    const seq = ++request.current;
    setLoading(true);
    try {
      const [next, branches] = await Promise.all([
        invoke<RemotesState>("read_remotes", { id: repoId }),
        invoke<PushOptions>("read_push_options", { id: repoId }),
      ]);
      if (seq !== request.current) return;
      setState(next);
      setOptions(branches);
      setRemoteName((old) =>
        next.remotes.some((r) => r.name === old)
          ? old
          : (next.remotes[0]?.name ?? ""),
      );
      setSource((old) =>
        branches.branches.includes(old)
          ? old
          : (branches.current ?? branches.branches[0] ?? ""),
      );
      setTarget((old) => old || branches.current || branches.branches[0] || "");
    } catch (e) {
      if (seq === request.current) {
        setState(null);
        setOptions(null);
        setError(errorText(e));
      }
    } finally {
      if (seq === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    setReview(null);
    if (active) void reload();
    return () => {
      request.current++;
    };
  }, [active, repoId]);
  function invalidate() {
    setReview(null);
    setNotice("");
    setWarning("");
    setError("");
  }
  async function act(kind: "trust" | "review" | "publish") {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    onLock(true);
    setError("");
    setNotice("");
    setWarning("");
    const captured = review;
    const operationId = crypto.randomUUID();
    setReview(null);
    try {
      if (kind === "trust") {
        setState(
          await invoke<RemotesState>("authorize_remote_operations", {
            id: repoId,
          }),
        );
      } else if (kind === "review") {
        setReview(
          await invoke<PushPreview>("preview_push", {
            id: repoId,
            token: state!.token,
            remote: remoteName,
            sourceBranch: source,
            targetBranch: target,
            setUpstream: upstream && sameDestination,
          }),
        );
      } else if (captured) {
        const context = {
          id: operationId,
          repository: repository?.name ?? repoId,
          path: repository?.path ?? "",
          destination: `${captured.sourceBranch} → ${captured.remote}/${captured.targetBranch}`,
        };
        onResult?.({
          ...context,
          status: "progress",
          title: "Push en curso",
          message: "Publicando el historial revisado…",
        });
        const result = await invoke<PushOutcome>("publish_push", {
          id: repoId,
          previewToken: captured.token,
        });
        setState(result.state);
        setNotice(result.message);
        setWarning(result.warning ?? "");
        const status =
          result.status === "confirmed" || result.status === "unchanged"
            ? result.status
            : "uncertain";
        let warning = result.warning ?? "";
        const report = () =>
          onResult?.({
            ...context,
            status:
              status === "uncertain"
                ? "uncertain"
                : warning
                  ? "warning"
                  : status,
            title:
              status === "uncertain"
                ? "Push sin confirmar"
                : status === "unchanged"
                  ? "Destino al día"
                  : "Push completado",
            message:
              status === "uncertain"
                ? "Comprueba el destino antes de repetir. No se reintentará automáticamente."
                : status === "unchanged"
                  ? "El destino ya contenía el commit revisado; no se publicaron commits nuevos."
                  : result.message,
            warning,
          });
        report();
        try {
          if ((await onUpdated()) === false) throw new Error("Refresh failed");
        } catch {
          warning = [
            warning,
            "El historial local no pudo actualizarse. Actualiza la vista; no repitas el push para refrescarla.",
          ]
            .filter(Boolean)
            .join(" ");
          report();
          setWarning((previous) =>
            [
              previous,
              "La operación terminó; el historial local no pudo actualizarse. Actualiza la vista.",
            ]
              .filter(Boolean)
              .join(" "),
          );
        }
      }
    } catch (e) {
      const notStarted =
        typeof e === "object" &&
        e &&
        "code" in e &&
        [
          "BUSY",
          "REPOSITORY_CHANGED",
          "PUSH_REVIEW",
          "TRUST_REQUIRED",
          "STALE_PUSH",
          "STALE_REMOTES",
        ].includes(String(e.code));
      if (kind === "publish" && captured)
        onResult?.({
          id: operationId,
          status: notStarted ? "error" : "uncertain",
          title: notStarted ? "Push no iniciado" : "Push sin confirmar",
          repository: repository?.name ?? repoId,
          path: repository?.path ?? "",
          destination: `${captured.sourceBranch} → ${captured.remote}/${captured.targetBranch}`,
          message: errorText(e),
          warning: notStarted
            ? "Vuelve a revisar antes de publicar."
            : "Comprueba el destino antes de repetir. No se reintentará automáticamente.",
        });
      if (kind !== "publish" || !onResult) setError(errorText(e));
      await reload();
    } finally {
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }
  return (
    <>
      <section
        id="push-content"
        tabIndex={-1}
        hidden={!active}
        className="history-panel remote-panel"
        aria-label="Publicar commits"
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">SINCRONIZACIÓN / PUSH</p>
            <h1>Publicar commits</h1>
            <p>Revisa el destino antes de enviar tu historial</p>
          </div>
          <button
            className="button"
            disabled={busy || loading}
            onClick={() => {
              invalidate();
              void reload();
            }}
          >
            Actualizar
          </button>
        </div>
        <div className="remote-body">
          {error && (
            <p className="banner" role="alert">
              {error}
            </p>
          )}
          {notice && !onResult && (
            <p className="banner" role="status">
              {notice}
            </p>
          )}
          {warning && !onResult && (
            <p className="banner" role="alert">
              {warning}
            </p>
          )}
          {loading && <p role="status">Leyendo ramas y configuración local…</p>}
          {state && !state.trusted && (
            <section className="trust-panel">
              <h2>Autorizar este repositorio</h2>
              <p>
                Git puede ejecutar hooks y ayudantes de credenciales
                configurados. Autoriza sólo repositorios de confianza; la
                autorización se recordará en este equipo. Puedes revocarla desde
                Cambios.
              </p>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void act("trust")}
              >
                Autorizar operaciones
              </button>
            </section>
          )}
          {state && !state.remotes.length && (
            <div className="empty-state">
              <h2>Configura primero un remoto</h2>
              <p>
                Añade el destino en Sincronizar → Remotos y Fetch y vuelve a
                Publicar.
              </p>
            </div>
          )}
          {options && !options.branches.length && (
            <p className="banner">
              Crea tu primer commit en Cambios para poder publicar una rama.
            </p>
          )}
          <form
            className="remote-form push-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act("review");
            }}
          >
            <label>
              Remoto de publicación
              <select
                disabled={!enabled}
                value={remoteName}
                onChange={(e) => {
                  invalidate();
                  setRemoteName(e.target.value);
                  setUpstream(false);
                }}
              >
                <option value="" disabled>
                  Selecciona un remoto
                </option>
                {state?.remotes.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name} · {r.provider}
                  </option>
                ))}
              </select>
            </label>
            <div className="push-branch-fields">
              <label>
                Rama local
                <select
                  disabled={!enabled}
                  value={source}
                  onChange={(e) => {
                    invalidate();
                    setSource(e.target.value);
                    setTarget(e.target.value);
                  }}
                >
                  <option value="" disabled>
                    Selecciona una rama
                  </option>
                  {options?.branches.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
              <ArrowRightIcon aria-hidden="true" />
              <label>
                Rama de destino
                <input
                  required
                  disabled={!enabled}
                  value={target}
                  onChange={(e) => {
                    invalidate();
                    setTarget(e.target.value);
                  }}
                  placeholder="main"
                />
              </label>
            </div>
            <label className="push-checkbox">
              <input
                type="checkbox"
                disabled={!enabled || !sameDestination}
                checked={upstream && sameDestination}
                onChange={(e) => {
                  invalidate();
                  setUpstream(e.target.checked);
                }}
              />
              Establecer seguimiento de esta rama hacia el destino
            </label>
            {!sameDestination && remote && (
              <p>
                El seguimiento se mantiene sin cambios porque descarga y
                publicación usan destinos diferentes.
              </p>
            )}
            {remote && !remote.pushAllowed && (
              <p className="banner">
                Publicación bloqueada para esta configuración avanzada,
                heredada, con reescrituras de URL o con destinos múltiples.
                Revísala desde Git.
              </p>
            )}
            <p>
              Sólo se publican commits; tus cambios sin commit permanecen
              locales. Revisar consulta la URL de publicación y puede descargar
              objetos para comparar el historial. No publica commits ni modifica
              tus archivos.
            </p>
            <button
              className="button primary"
              disabled={!enabled || !remote?.pushAllowed || !source || !target}
            >
              <UploadIcon />
              Revisar push
            </button>
          </form>
          {review && (
            <section className="push-commits" aria-label="Commits por publicar">
              <div className="push-review-heading">
                <h2>{relations[review.relation]}</h2>
                <span className="prototype">
                  {review.ahead} por enviar · {review.behind} por integrar
                </span>
              </div>
              {review.behind > 0 && (
                <p className="banner">
                  <ExclamationTriangleIcon />
                  Integra los cambios del destino antes de publicar. Esta fase
                  no permite force push.
                </p>
              )}
              {review.relation === "equal" && (
                <p>
                  El destino ya contiene el mismo commit. Sólo se habilita
                  confirmar si solicitaste establecer seguimiento.
                </p>
              )}
              {review.relation === "new" && (
                <p>
                  Se creará una rama nueva. La publicación incluye el historial
                  alcanzable desde el commit seleccionado; el servidor puede
                  tener ya algunos objetos.
                </p>
              )}
              <h3>Commits locales ausentes en la rama de destino</h3>
              <p>
                {review.commits.length} mostrados de {review.ahead}.{" "}
                {review.ahead > review.commits.length
                  ? "Se muestran los primeros 200; la publicación incluye todos los indicados por el total."
                  : ""}
              </p>
              <ol className="push-commit-list">
                {review.commits.map((c) => (
                  <li key={c.hash}>
                    <code title={c.hash}>{c.hash.slice(0, 8)}</code>
                    <span>{c.subject}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </section>
      <aside
        hidden={!active}
        className="inspector remote-panel"
        aria-label="Confirmación de publicación"
      >
        <div className="remote-body">
          <p className="eyebrow">DESTINO DE PUBLICACIÓN</p>
          <h2>{review?.remote ?? remote?.name ?? "Sin destino"}</h2>
          <code className="remote-url">
            {review?.url ??
              remote?.pushUrls.join("\n") ??
              "Selecciona un remoto"}
          </code>
          {review ? (
            <>
              <h3>Origen revisado</h3>
              <p>{review.sourceBranch}</p>
              <code className="remote-url">{review.sourceHash}</code>
              <h3>Rama del servidor</h3>
              <p>{review.targetBranch}</p>
              <code className="remote-url">
                {review.targetHash ?? "Rama nueva"}
              </code>
              <p>
                {review.setUpstream
                  ? `Se establecerá seguimiento: ${review.sourceBranch} → ${review.remote}/${review.targetBranch}.`
                  : "El seguimiento local se mantiene sin cambios."}
              </p>
              <p>
                Confirma para enviar el commit y su historial a esta URL. Git y
                el servidor pueden ejecutar hooks y aplicar sus reglas.
              </p>
              <button
                className="button primary"
                disabled={!enabled || !review.canPush}
                onClick={() => void act("publish")}
              >
                Confirmar publicación
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => setReview(null)}
              >
                Cancelar revisión
              </button>
            </>
          ) : (
            <p>
              Revisa el push para comparar las ramas y habilitar la
              confirmación. Cada publicación requiere una revisión nueva.
            </p>
          )}
          {busy && <p role="status">Ejecutando operación Git…</p>}
        </div>
      </aside>
    </>
  );
}

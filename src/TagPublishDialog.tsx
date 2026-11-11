import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RemotesState } from "./types";
import { emitOperation, nextOperationId } from "./operations";
type Options = { state: RemotesState; tags: { name: string; hash: string }[] };
type Preview = {
  token: string;
  tag: string;
  hash: string;
  remote: string;
  url: string;
  targetHash: string | null;
  relation: "new" | "equal" | "conflict";
  canPush: boolean;
};
const messageOf = (error: unknown) =>
  typeof error === "object" && error && "message" in error
    ? String(error.message)
    : "No se pudo completar la operación. Comprueba el remoto antes de repetir.";
export default function TagPublishDialog({
  repoId,
  initialTag,
  onClose,
  onLock,
  onUpdated,
}: {
  repoId: string;
  initialTag?: string;
  onClose: () => void;
  onLock: (busy: boolean) => void;
  onUpdated: () => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    flight = useRef(false),
    request = useRef(0);
  const [options, setOptions] = useState<Options | null>(null),
    [tag, setTag] = useState(initialTag ?? ""),
    [remote, setRemote] = useState("");
  const [plan, setPlan] = useState<Preview | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [warning, setWarning] = useState("");
  const destination = options?.state.remotes.find(
    (entry) => entry.name === remote,
  );
  async function load() {
    const sequence = ++request.current;
    setLoading(true);
    setError("");
    setPlan(null);
    setConfirmed(false);
    setOptions(null);
    try {
      const next = await invoke<Options>("read_tag_push_options", {
        id: repoId,
      });
      if (sequence !== request.current) return;
      setOptions(next);
      setTag((previous) =>
        next.tags.some((entry) => entry.name === previous) ? previous : "",
      );
      setRemote((previous) =>
        next.state.remotes.some(
          (entry) => entry.name === previous && entry.pushAllowed,
        )
          ? previous
          : (next.state.remotes.find((entry) => entry.pushAllowed)?.name ?? ""),
      );
    } catch (error) {
      if (sequence === request.current) setError(messageOf(error));
    } finally {
      if (sequence === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    const element = dialog.current,
      previous = document.activeElement;
    element?.showModal();
    void load();
    return () => {
      request.current++;
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [repoId]);
  function close() {
    if (flight.current) return;
    request.current++;
    dialog.current?.close();
    onClose();
  }
  function invalidate() {
    setPlan(null);
    setConfirmed(false);
    setError("");
    setNotice("");
    setWarning("");
  }
  async function run(publish: boolean) {
    if (
      flight.current ||
      loading ||
      done ||
      !options?.state.trusted ||
      !tag ||
      !destination?.pushAllowed ||
      (publish && (!plan?.canPush || !confirmed))
    )
      return;
    const reviewed = plan;
    const operationId = publish ? nextOperationId() : "";
    flight.current = true;
    setBusy(true);
    onLock(true);
    invalidate();
    try {
      if (!publish)
        setPlan(
          await invoke<Preview>("preview_tag_push", {
            id: repoId,
            token: options.state.token,
            tag,
            remote,
          }),
        );
      else if (reviewed) {
        emitOperation({
          id: operationId,
          repoId,
          operation: "publishTag",
          status: "progress",
          title: "Publicando etiqueta",
          destination: `${reviewed.tag} → ${reviewed.remote}`,
          message: "Publicando sólo la etiqueta revisada…",
        });
        const outcome = await invoke<{
          message: string;
          warning: string | null;
        }>("publish_tag", { id: repoId, token: reviewed.token });
        setDone(true);
        setNotice(outcome.message);
        setWarning(outcome.warning ?? "");
        let refreshWarning = "";
        try {
          if ((await onUpdated()) === false) {
            refreshWarning =
              "No se pudo refrescar la vista; comprueba el remoto y no repitas la publicación.";
            setWarning((previous) =>
              `${previous} No se pudo refrescar la vista; no repitas el push.`.trim(),
            );
          }
        } catch {
          refreshWarning =
            "No se pudo refrescar la vista; comprueba el remoto y no repitas la publicación.";
          setWarning((previous) =>
            `${previous} No se pudo refrescar la vista; no repitas el push.`.trim(),
          );
        }
        const warning = [outcome.warning, refreshWarning]
          .filter(Boolean)
          .join(" ");
        emitOperation({
          id: operationId,
          repoId,
          operation: "publishTag",
          status: warning ? "warning" : "confirmed",
          title: "Etiqueta publicada",
          destination: `${reviewed.tag} → ${reviewed.remote}`,
          message: outcome.message,
          warning: warning || undefined,
        });
      }
    } catch (error) {
      const text = messageOf(error);
      setError(text);
      if (publish)
        emitOperation({
          id: operationId,
          repoId,
          operation: "publishTag",
          status: "error",
          title: "Etiqueta no publicada",
          destination: reviewed
            ? `${reviewed.tag} → ${reviewed.remote}`
            : "Etiqueta remota",
          message: text,
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
      className="operation-dialog"
      aria-labelledby="tag-publish-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="tag-publish-title">Publicar etiqueta</h2>
        <button className="button" disabled={busy} onClick={close}>
          Cerrar
        </button>
      </header>
      <p>
        Publica una sola etiqueta ligera existente. No envía ramas ni otras
        etiquetas y no crea una release de GitHub.
      </p>
      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="banner" role="status">
          {notice}
        </p>
      )}
      {warning && (
        <p className="banner warning" role="status">
          {warning}
        </p>
      )}
      {!done && (
        <>
          <button
            className="button"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            Actualizar lista local
          </button>
          {loading ? (
            <p role="status">Leyendo etiquetas y remotos locales…</p>
          ) : options && !options.state.trusted ? (
            <p>Autoriza el repositorio desde Cambios antes de publicar.</p>
          ) : (
            options && (
              <>
                {!options.tags.length && (
                  <p>
                    No hay etiquetas ligeras locales. Crea una primero; las
                    etiquetas anotadas no se publican en este incremento.
                  </p>
                )}
                <label>
                  Etiqueta local
                  <select
                    value={tag}
                    disabled={busy}
                    onChange={(event) => {
                      setTag(event.target.value);
                      invalidate();
                    }}
                  >
                    <option value="">Selecciona una etiqueta</option>
                    {options.tags.map((entry) => (
                      <option key={entry.name} value={entry.name}>
                        {entry.name} · {entry.hash.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Remoto de publicación
                  <select
                    value={remote}
                    disabled={busy}
                    onChange={(event) => {
                      setRemote(event.target.value);
                      invalidate();
                    }}
                  >
                    <option value="">Selecciona un remoto</option>
                    {options.state.remotes.map((entry) => (
                      <option
                        key={entry.name}
                        value={entry.name}
                        disabled={!entry.pushAllowed}
                      >
                        {entry.name}
                        {!entry.pushAllowed
                          ? " · configuración restringida"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {destination && (
                  <p>
                    Destino: <code>{destination.pushUrls[0]}</code>
                  </p>
                )}
                {!options.state.remotes.some((entry) => entry.pushAllowed) && (
                  <p>
                    Configura un remoto estándar con una única URL segura en
                    Remotos.
                  </p>
                )}
                <p>
                  Consultar remoto contacta este destino para comprobar la
                  etiqueta. No publica ni descarga referencias automáticamente.
                </p>
                <button
                  className="button"
                  disabled={busy || !tag || !destination?.pushAllowed}
                  onClick={() => void run(false)}
                >
                  Consultar remoto y revisar
                </button>
              </>
            )
          )}
          {plan && (
            <section aria-label="Revisión de publicación de etiqueta">
              <h3>{plan.tag}</h3>
              <p>
                Hash local: <code>{plan.hash}</code>
              </p>
              <p>
                Remoto: <strong>{plan.remote}</strong> · <code>{plan.url}</code>
              </p>
              <p>
                {plan.relation === "new"
                  ? "La etiqueta no existe en este remoto."
                  : plan.relation === "equal"
                    ? "La etiqueta ya existe y coincide. No hace falta publicarla."
                    : "Conflicto: la etiqueta remota apunta a otro objeto. No se reemplazará."}
              </p>
              {plan.targetHash && (
                <p>
                  Hash remoto: <code>{plan.targetHash}</code>
                </p>
              )}
              {plan.canPush && (
                <>
                  <p className="banner warning">
                    Se transferirán los objetos y commits necesarios para esta
                    etiqueta, aunque no estén publicados en una rama. No hay
                    sobrescritura, publicación masiva ni envío de ramas.
                  </p>
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={busy}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />{" "}
                    Confirmo la etiqueta, su hash y este destino de publicación.
                  </label>
                  <button
                    className="button primary"
                    disabled={busy || !confirmed}
                    onClick={() => void run(true)}
                  >
                    Publicar etiqueta seleccionada
                  </button>
                </>
              )}
            </section>
          )}
        </>
      )}
    </dialog>
  );
}

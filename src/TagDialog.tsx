import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitOperation, nextOperationId } from "./operations";

type Plan = { token: string; name: string; commit: string; subject: string };
export default function TagDialog({
  repoId,
  commit,
  head,
  onClose,
  onLock,
  onUpdated,
  onPublish,
}: {
  repoId: string;
  commit: string;
  head: string | null;
  onClose: () => void;
  onLock: (busy: boolean) => void;
  onUpdated: () => Promise<boolean>;
  onPublish?: (name: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    flight = useRef(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState(commit);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [done, setDone] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const element = dialog.current,
      previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  function close() {
    if (flight.current) return;
    dialog.current?.close();
    onClose();
  }
  async function run(create: boolean) {
    if (flight.current || done || (create && (!plan || !confirmed))) return;
    flight.current = true;
    setBusy(true);
    onLock(true);
    setError("");
    setNotice("");
    const reviewed = plan;
    const operationId = create ? nextOperationId() : "";
    setPlan(null);
    setConfirmed(false);
    try {
      if (!create) {
        setPlan(
          await invoke<Plan>("preview_tag", {
            id: repoId,
            name,
            commit: target,
          }),
        );
      } else if (reviewed) {
        emitOperation({
          id: operationId,
          repoId,
          operation: "tag",
          status: "progress",
          title: "Creando etiqueta",
          destination: reviewed.name,
          message: "Actualizando la referencia local revisada…",
        });
        const message = await invoke<string>("create_tag", {
          id: repoId,
          token: reviewed.token,
        });
        setDone(true);
        setNotice(message);
        let warning = "";
        try {
          if ((await onUpdated()) === false) {
            warning =
              "No se pudo actualizar el historial; actualiza la vista sin repetir la creación.";
            setNotice(
              (previous) =>
                `${previous} No se pudo actualizar el historial; no repitas la creación.`,
            );
          }
        } catch {
          warning =
            "No se pudo actualizar el historial; actualiza la vista sin repetir la creación.";
          setNotice(
            (previous) =>
              `${previous} No se pudo actualizar el historial; no repitas la creación.`,
          );
        }
        emitOperation({
          id: operationId,
          repoId,
          operation: "tag",
          status: warning ? "warning" : "confirmed",
          title: "Etiqueta creada",
          destination: reviewed.name,
          message,
          warning: warning || undefined,
        });
      }
    } catch (error) {
      const text =
        typeof error === "object" && error && "message" in error
          ? String(error.message)
          : "No se pudo completar la operación. Comprueba las etiquetas antes de repetir.";
      setError(text);
      if (create)
        emitOperation({
          id: operationId,
          repoId,
          operation: "tag",
          status: "error",
          title: "Etiqueta no creada",
          destination: reviewed?.name ?? name,
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
      aria-labelledby="tag-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="tag-title">Crear etiqueta ligera</h2>
        <button className="button" disabled={busy} onClick={close}>
          Cerrar
        </button>
      </header>
      <p>
        Marca un commit con un nombre local. No cambia la rama, el index ni tus
        archivos. No crea una etiqueta anotada o firmada y no se publica en
        remotos.
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
      {done && onPublish && (
        <button
          className="button primary"
          disabled={busy}
          onClick={() => onPublish(name)}
        >
          Publicar esta etiqueta…
        </button>
      )}
      {!done && (
        <>
          <label>
            Nombre de etiqueta
            <input
              value={name}
              maxLength={255}
              placeholder="v1.0.0"
              disabled={busy}
              onChange={(event) => {
                setName(event.target.value);
                setPlan(null);
                setConfirmed(false);
              }}
            />
          </label>
          <label>
            Commit de destino
            <select
              value={target}
              disabled={busy}
              onChange={(event) => {
                setTarget(event.target.value);
                setPlan(null);
                setConfirmed(false);
              }}
            >
              <option value={commit}>
                Commit seleccionado · {commit.slice(0, 8)}
              </option>
              {head && head !== commit && (
                <option value={head}>HEAD al abrir · {head.slice(0, 8)}</option>
              )}
            </select>
          </label>
          <p>
            <code>{target}</code>
          </p>
          <button
            className="button"
            disabled={busy || !name.trim()}
            onClick={() => void run(false)}
          >
            Revisar etiqueta
          </button>
          {plan && (
            <section aria-label="Revisión de etiqueta">
              <h3>{plan.name}</h3>
              <p>{plan.subject}</p>
              <p>
                <code>{plan.commit}</code>
              </p>
              <p>
                Se creará <code>refs/tags/{plan.name}</code> sin reemplazar
                ninguna referencia existente. No se contactará ningún servidor.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />{" "}
                Confirmo este nombre y commit de destino.
              </label>
              <button
                className="button primary"
                disabled={busy || !confirmed}
                onClick={() => void run(true)}
              >
                Crear etiqueta local
              </button>
            </section>
          )}
        </>
      )}
    </dialog>
  );
}

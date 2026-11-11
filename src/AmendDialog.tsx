import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import DiffViewer from "./DiffViewer";
import type { MutationResult } from "./types";
import { emitOperation, nextOperationId } from "./operations";

type Plan = {
  token: string;
  head: string;
  branch: string;
  author: string;
  committer: string;
  originalMessage: string;
  message: string;
  originalPatch: string;
  stagedPatch: string;
  publishedRefs: string[];
};
const messageOf = (error: unknown) =>
  typeof error === "object" && error && "message" in error
    ? String(error.message)
    : "No se pudo completar amend. Comprueba HEAD antes de repetir.";

export default function AmendDialog({
  repoId,
  onClose,
  onLock,
  onAmended,
}: {
  repoId: string;
  onClose: () => void;
  onLock: (busy: boolean) => void;
  onAmended: (result: MutationResult) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const flight = useRef(false),
    request = useRef(0);
  const [message, setMessage] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [completed, setCompleted] = useState(false);
  async function load() {
    const sequence = ++request.current;
    setLoading(true);
    setError("");
    setPlan(null);
    setConfirmed(false);
    try {
      const initial = await invoke<Plan>("preview_amend", {
        id: repoId,
        message: null,
      });
      if (sequence === request.current) setMessage(initial.message);
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
  async function run(confirm: boolean) {
    if (
      flight.current ||
      loading ||
      completed ||
      (confirm && (!plan || !confirmed))
    )
      return;
    flight.current = true;
    setBusy(true);
    onLock(true);
    setError("");
    setNotice("");
    setConfirmed(false);
    const reviewed = plan;
    const operationId = confirm ? nextOperationId() : "";
    setPlan(null);
    try {
      if (!confirm) {
        setPlan(await invoke<Plan>("preview_amend", { id: repoId, message }));
      } else if (reviewed) {
        emitOperation({
          id: operationId,
          repoId,
          operation: "amend",
          status: "progress",
          title: "Reemplazando último commit",
          destination: reviewed.branch,
          message: "Ejecutando hooks y conservando una referencia de respaldo…",
        });
        const outcome = await invoke<{
          result: MutationResult;
          backup: string;
        }>("confirm_amend", { id: repoId, token: reviewed.token });
        setCompleted(true);
        setNotice(
          `Amend confirmado: ${outcome.result.commitHash?.slice(0, 8) ?? "comprueba HEAD"}. Respaldo: ${outcome.backup}.${outcome.result.warning ? " " + outcome.result.warning : ""}`,
        );
        try {
          await onAmended(outcome.result);
        } catch {
          setNotice(
            (previous) =>
              `${previous} No se pudo actualizar la vista; no repitas amend.`,
          );
        }
        emitOperation({
          id: operationId,
          repoId,
          operation: "amend",
          status: outcome.result.warning ? "warning" : "confirmed",
          title: "Último commit reemplazado",
          destination: reviewed.branch,
          message: `Amend ${outcome.result.commitHash?.slice(0, 8) ?? "confirmado"}. El respaldo local se conserva.`,
          warning: outcome.result.warning ?? undefined,
        });
      }
    } catch (error) {
      const text = messageOf(error);
      setError(text);
      if (confirm)
        emitOperation({
          id: operationId,
          repoId,
          operation: "amend",
          status: "error",
          title: "Amend no completado",
          destination: reviewed?.branch ?? "Último commit",
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
      className="operation-dialog amend-dialog"
      aria-labelledby="amend-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="panel-heading">
        <h2 id="amend-title">Reemplazar último commit · Amend</h2>
        <button className="button" disabled={busy} onClick={close}>
          Cerrar
        </button>
      </div>
      <p>
        No crea un commit adicional: reemplaza el último de la rama. Conserva su
        autor e incluye todo el index actual; los cambios sin preparar quedan
        fuera. Los hooks pueden validar o modificar el contenido.
      </p>
      <div className="banner warning">
        Reescribe historial. Si el commit ya fue compartido, coordina con tus
        colaboradores. No se ejecuta Fetch ni Push y no se habilita publicación
        forzada.
      </div>
      {loading && <p role="status">Leyendo último commit…</p>}
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
      {!completed && (
        <>
          <label htmlFor="amend-message">Mensaje del commit reemplazado</label>
          <textarea
            id="amend-message"
            rows={6}
            maxLength={65536}
            value={message}
            disabled={busy || loading}
            onChange={(event) => {
              setMessage(event.target.value);
              setPlan(null);
              setConfirmed(false);
            }}
          />
          <div className="library-entry-actions">
            <button
              className="button"
              disabled={busy || loading}
              onClick={() => void load()}
            >
              Recargar último commit
            </button>
            <button
              className="button"
              disabled={busy || loading || !message.trim()}
              onClick={() => void run(false)}
            >
              Revisar amend
            </button>
          </div>
          {plan && (
            <section aria-label="Revisión de amend">
              <p>
                Rama: <strong>{plan.branch}</strong> · Commit reemplazado:{" "}
                <code>{plan.head}</code>
              </p>
              <p>
                Autor conservado: {plan.author}
                <br />
                Committer configurado: {plan.committer}
              </p>
              <h3>Mensaje anterior</h3>
              <pre className="amend-message">{plan.originalMessage}</pre>
              <h3>Mensaje nuevo</h3>
              <pre className="amend-message">{plan.message}</pre>
              <p>
                {plan.publishedRefs.length
                  ? `El commit aparece en referencias remotas locales: ${plan.publishedRefs.join(", ")}.`
                  : "No se detectó el commit en referencias remotas locales. Esto no demuestra que no haya sido publicado."}{" "}
                No se consultó la red.
              </p>
              <details>
                <summary>Contenido del commit original</summary>
                <DiffViewer
                  text={
                    plan.originalPatch || "Commit original sin diferencias."
                  }
                />
              </details>
              <details open>
                <summary>Cambios preparados que se incorporarán</summary>
                <DiffViewer
                  text={
                    plan.stagedPatch ||
                    "Sin cambios preparados: sólo se reemplaza el mensaje/metadatos; se conserva el contenido."
                  }
                />
              </details>
              <p>
                Se conservará el commit anterior en una referencia local bajo{" "}
                <code>refs/ravengit/amend/</code>. No hay restauración
                automática.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />{" "}
                Entiendo que reemplazaré este commit y revisé el contenido
                preparado y el riesgo de publicación.
              </label>
              <button
                className="button primary"
                disabled={busy || !confirmed}
                onClick={() => void run(true)}
              >
                Confirmar amend
              </button>
            </section>
          )}
        </>
      )}
    </dialog>
  );
}

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BranchOutcome, RebasePreview, RebaseStep } from "./types";
import { emitOperation, nextOperationId } from "./operations";

export default function InteractiveRebaseDialog({
  repoId,
  preview,
  onClose,
  onLock,
  onUpdated,
}: {
  repoId: string;
  preview: RebasePreview;
  onClose: () => void;
  onLock: (locked: boolean) => void;
  onUpdated: () => Promise<boolean>;
}) {
  const errorElement = useRef<HTMLParagraphElement>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    flight = useRef(false);
  const [steps, setSteps] = useState<RebaseStep[]>(
    preview.commits.map((c) => ({ hash: c.hash, action: "pick", message: "" })),
  );
  const [review, setReview] = useState<RebasePreview | null>(null);
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => {
    if (!error) return;
    errorElement.current?.focus();
    errorElement.current?.scrollIntoView?.({ block: "center" });
  }, [error]);
  function close() {
    if (!flight.current) onClose();
  }
  function change(next: RebaseStep[]) {
    setSteps(next);
    setReview(null);
    setConsent(false);
    setError("");
  }
  function move(index: number, delta: number) {
    const next = [...steps];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    change(next);
  }
  async function run(execute: boolean) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    onLock(true);
    setError("");
    setNotice("");
    const token = review?.interactive?.token;
    const operationId = execute ? nextOperationId() : "";
    setConsent(false);
    setReview(null);
    if (execute)
      emitOperation({
        id: operationId,
        repoId,
        operation: "rebase",
        status: "progress",
        title: "Rebase interactivo en curso",
        destination: `${preview.branch} sobre ${preview.base}`,
        message: "Ejecutando el plan revisado y conservando el respaldo…",
      });
    try {
      if (!execute)
        setReview(
          await invoke<RebasePreview>("review_interactive_rebase", {
            id: repoId,
            token: preview.token,
            steps,
          }),
        );
      else {
        const result = await invoke<BranchOutcome>("edit_rebase", {
          id: repoId,
          token,
          edit: null,
        });
        setNotice([result.message, result.warning].filter(Boolean).join(" "));
        let warning = result.warning ?? "";
        try {
          if (!(await onUpdated())) throw new Error();
        } catch {
          warning = [
            warning,
            "No se pudo refrescar el historial. Actualiza sin repetir el rebase.",
          ]
            .filter(Boolean)
            .join(" ");
          setNotice(
            (n) =>
              `${n} No se pudo refrescar; no repitas el rebase para actualizar.`,
          );
        }
        emitOperation({
          id: operationId,
          repoId,
          operation: "rebase",
          status: warning ? "warning" : "confirmed",
          title: "Rebase interactivo actualizado",
          destination: `${preview.branch} sobre ${preview.base}`,
          message: result.message,
          warning: warning || undefined,
        });
      }
    } catch (e) {
      const text =
        typeof e === "object" && e && "message" in e
          ? String(e.message)
          : "No se pudo confirmar el plan. Actualiza Ramas antes de repetir.";
      setError(text);
      if (execute)
        emitOperation({
          id: operationId,
          repoId,
          operation: "rebase",
          status: "error",
          title: "Rebase interactivo no completado",
          destination: `${preview.branch} sobre ${preview.base}`,
          message: text,
        });
      if (execute) {
        try {
          await onUpdated();
        } catch {
          /* Keep original error. */
        }
      }
    } finally {
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="operation-dialog interactive-rebase-dialog"
      aria-labelledby="interactive-rebase-title"
      aria-busy={busy}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="interactive-rebase-title">Rebase interactivo</h2>
        <button className="button" disabled={busy} onClick={close}>
          Cerrar
        </button>
      </header>
      <p>
        Rama <strong>{preview.branch}</strong> sobre{" "}
        <strong>{preview.base}</strong>. Orden de aplicación: de arriba hacia
        abajo.
      </p>
      <p>
        Se reescribe el historial local y cambian hashes. No publica ni fuerza
        Push. Se conserva una referencia de respaldo; los conflictos se
        continúan o abortan desde Ramas.
      </p>
      {error && (
        <p
          ref={errorElement}
          tabIndex={-1}
          role="alert"
          className="banner error"
        >
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!notice && (
        <>
          <ol className="interactive-rebase-steps" aria-label="Plan de commits">
            {steps.map((step, index) => {
              const subject =
                preview.commits.find((c) => c.hash === step.hash)?.subject ??
                step.hash;
              return (
                <li key={step.hash}>
                  <p>
                    <code>{step.hash.slice(0, 8)}</code> {subject}
                  </p>
                  <div className="commit-actions">
                    <button
                      className="button"
                      disabled={busy || index === 0}
                      aria-label={`Subir ${subject}`}
                      onClick={() => move(index, -1)}
                    >
                      Subir
                    </button>
                    <button
                      className="button"
                      disabled={busy || index === steps.length - 1}
                      aria-label={`Bajar ${subject}`}
                      onClick={() => move(index, 1)}
                    >
                      Bajar
                    </button>
                    <label>
                      Acción para {subject}
                      <select
                        disabled={busy}
                        value={step.action}
                        onChange={(e) => {
                          const action = e.target.value as RebaseStep["action"];
                          change(
                            steps.map((s, i) =>
                              i === index
                                ? {
                                    ...s,
                                    action,
                                    message:
                                      action === "reword" || action === "squash"
                                        ? subject
                                        : "",
                                  }
                                : s,
                            ),
                          );
                        }}
                      >
                        <option value="pick">pick · Conservar</option>
                        <option value="reword">reword · Cambiar mensaje</option>
                        <option value="squash">
                          squash · Combinar y definir mensaje
                        </option>
                        <option value="fixup">
                          fixup · Combinar sin su mensaje
                        </option>
                        <option value="drop">drop · Omitir commit</option>
                      </select>
                    </label>
                  </div>
                  {(step.action === "reword" || step.action === "squash") && (
                    <label>
                      Mensaje final para {subject}
                      <textarea
                        disabled={busy}
                        rows={3}
                        maxLength={4096}
                        value={step.message}
                        onChange={(e) =>
                          change(
                            steps.map((s, i) =>
                              i === index
                                ? { ...s, message: e.target.value }
                                : s,
                            ),
                          )
                        }
                      />
                    </label>
                  )}
                </li>
              );
            })}
          </ol>
          <p>
            Squash/fixup se combinan con el commit anterior conservado. En
            squash, el mensaje final sustituye el del grupo; el último squash
            del grupo define su mensaje. Drop omite sus cambios.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() => void run(false)}
          >
            Revisar plan
          </button>
          {review?.interactive && (
            <section aria-label="Plan revisado">
              <h3>Plan revisado · {steps.length} commits originales</h3>
              <p>
                HEAD <code>{review.headHash}</code>
                <br />
                Base <code>{review.baseHash}</code>
              </p>
              <p>
                Git generará hashes nuevos al aplicar las acciones. El resultado
                exacto depende de los cambios y de posibles conflictos.
              </p>
              <ol>
                {review.interactive.steps.map((s) => (
                  <li key={s.hash}>
                    <strong>{s.action}</strong>{" "}
                    <code>{s.hash.slice(0, 8)}</code>{" "}
                    {preview.commits.find((c) => c.hash === s.hash)?.subject}
                    {s.message && <pre>{s.message}</pre>}
                  </li>
                ))}
              </ol>
              <label>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />{" "}
                Revisé orden, acciones y mensajes. Comprobé si el historial está
                compartido y autorizo reescribir esta rama con respaldo.
              </label>
              <button
                className="button primary"
                disabled={busy || !consent}
                onClick={() => void run(true)}
              >
                Ejecutar plan revisado
              </button>
            </section>
          )}
        </>
      )}
      {busy && <p role="status">Comprobando el plan y el repositorio…</p>}
    </dialog>
  );
}

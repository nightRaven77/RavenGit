import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import DiffViewer from "./DiffViewer";
import { emitOperation, nextOperationId } from "./operations";
type Action =
  | { kind: "save"; message: string; untracked: boolean }
  | { kind: "apply"; hash: string; index: boolean };
type Plan = {
  token: string;
  action: Action;
  head: string;
  branch: string;
  files: string[];
  patch: string;
};
type Recovery = {
  token: string;
  action: Action;
  head: string;
  branch: string;
  conflicts: string[];
  canFinish: boolean;
};
type Options = {
  trusted: boolean;
  entries: { hash: string; label: string; subject: string }[];
  recovery: Recovery | null;
};
const messageOf = (error: unknown) =>
  typeof error === "object" && error && "message" in error
    ? String(error.message)
    : String(error);
export default function StashDialog({
  repoId,
  onClose,
  onLock,
  onUpdated,
}: {
  repoId: string;
  onClose: () => void;
  onLock: (busy: boolean) => void;
  onUpdated: () => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    flight = useRef(false),
    request = useRef(0);
  const [options, setOptions] = useState<Options | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"save" | "apply">("save"),
    [description, setDescription] = useState(""),
    [untracked, setUntracked] = useState(false),
    [hash, setHash] = useState(""),
    [index, setIndex] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  function invalidate() {
    setPlan(null);
    setConfirmed(false);
    setAcknowledged(false);
  }
  async function load() {
    const sequence = ++request.current;
    setLoading(true);
    invalidate();
    setOptions(null);
    try {
      const next = await invoke<Options>("read_stash", { id: repoId });
      if (sequence === request.current) {
        setOptions(next);
        setHash((previous) =>
          next.entries.some((e) => e.hash === previous)
            ? previous
            : (next.entries[0]?.hash ?? ""),
        );
      }
    } catch (error) {
      if (sequence === request.current) setError(messageOf(error));
    } finally {
      if (sequence === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    const element = dialog.current,
      previousFocus = document.activeElement;
    element?.showModal();
    void load();
    return () => {
      request.current++;
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [repoId]);
  function close() {
    if (flight.current) return;
    request.current++;
    dialog.current?.close();
    onClose();
  }
  async function run(
    kind: "authorize" | "review" | "confirm" | "finish" | "refresh",
  ) {
    if (flight.current || loading) return;
    flight.current = true;
    setBusy(true);
    onLock(true);
    setError("");
    setNotice("");
    const token = plan?.token,
      recoveryToken = options?.recovery?.token;
    const changesState = kind === "confirm" || kind === "finish";
    const reports = changesState || kind === "authorize";
    const operationId = reports ? nextOperationId() : "";
    invalidate();
    if (reports)
      emitOperation({
        id: operationId,
        repoId,
        operation: changesState ? "stash" : "trust",
        status: "progress",
        title:
          kind === "authorize"
            ? "Autorizando repositorio"
            : kind === "finish"
              ? "Finalizando Stash"
              : "Aplicando Stash",
        destination:
          kind === "authorize"
            ? "Confianza local"
            : kind === "finish"
              ? "Recuperación"
              : mode,
        message:
          kind === "authorize"
            ? "Habilitando operaciones locales para esta ruta…"
            : "Aplicando la revisión y conservando la entrada recuperable…",
      });
    try {
      if (kind === "authorize") {
        await invoke("authorize_repository", { id: repoId });
        emitOperation({
          id: operationId,
          repoId,
          operation: "trust",
          status: "confirmed",
          title: "Repositorio autorizado",
          destination: "Confianza local",
          message: "La gestión de Stash quedó habilitada para esta ruta.",
        });
        await load();
      } else if (kind === "refresh") await load();
      else if (kind === "review") {
        const action: Action =
          mode === "save"
            ? { kind: "save", message: description, untracked }
            : { kind: "apply", hash, index };
        setPlan(await invoke<Plan>("preview_stash", { id: repoId, action }));
      } else {
        const resultMessage = await invoke<string>(
          kind === "finish" ? "finish_stash" : "confirm_stash",
          { id: repoId, token: kind === "finish" ? recoveryToken : token },
        );
        setNotice(resultMessage);
        let warning = "";
        if (!(await onUpdated())) {
          warning =
            "El historial no pudo actualizarse. Actualiza la vista sin repetir Stash.";
          setNotice(
            (previous) =>
              `${previous} El historial no pudo actualizarse. No repitas Stash para refrescarlo.`,
          );
        }
        emitOperation({
          id: operationId,
          repoId,
          operation: "stash",
          status: warning ? "warning" : "confirmed",
          title: kind === "finish" ? "Stash finalizado" : "Stash actualizado",
          destination: kind === "finish" ? "Recuperación" : mode,
          message: resultMessage,
          warning: warning || undefined,
        });
        await load();
      }
    } catch (error) {
      const text = messageOf(error);
      setError(text);
      if (reports)
        emitOperation({
          id: operationId,
          repoId,
          operation: changesState ? "stash" : "trust",
          status: "error",
          title:
            kind === "authorize"
              ? "Autorización no completada"
              : "Stash no completado",
          destination:
            kind === "authorize"
              ? "Confianza local"
              : kind === "finish"
                ? "Recuperación"
                : mode,
          message: text,
        });
      if (kind === "confirm" || kind === "finish") {
        await onUpdated();
        await load();
      }
    } finally {
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }
  const recovery = options?.recovery,
    disabled = busy || loading;
  return (
    <dialog
      ref={dialog}
      className="operation-dialog stash-dialog"
      aria-labelledby="stash-title"
      aria-busy={busy || loading}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="stash-title">Stash</h2>
        <button className="button" onClick={close} disabled={busy}>
          Cerrar
        </button>
      </header>
      <p>Guarda cambios temporalmente y restáuralos cuando los necesites.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">Leyendo stashes…</p>}
      {!loading && !options && (
        <button
          className="button"
          disabled={busy}
          onClick={() => void run("refresh")}
        >
          Volver a leer
        </button>
      )}
      {options && !options.trusted && (
        <>
          <p>Autoriza este repositorio para consultar sus cambios y stashes.</p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void run("authorize")}
          >
            Autorizar repositorio
          </button>
        </>
      )}
      {options?.trusted &&
        (recovery ? (
          <section aria-label="Recuperación de stash">
            <h3>Revisa la operación pendiente</h3>
            <p>
              Se intentó{" "}
              {recovery.action.kind === "save"
                ? "guardar cambios"
                : "restaurar un stash"}{" "}
              en <strong>{recovery.branch}</strong>. No se repetirá la
              operación.
            </p>
            <p>
              Revisa los archivos desde Cambios. Si hay conflictos, edítalos y
              prepáralos desde Git; después pulsa Actualizar.
            </p>
            {recovery.conflicts.length > 0 && (
              <ul className="stash-files" aria-label="Archivos en conflicto">
                {recovery.conflicts.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            )}
            {!recovery.canFinish && (
              <p>
                Faltan conflictos por resolver o HEAD y la rama ya no coinciden
                con el inicio. Conserva los archivos y revisa Git.
              </p>
            )}
            <label>
              <input
                type="checkbox"
                checked={acknowledged}
                disabled={disabled || !recovery.canFinish}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />{" "}
              Revisé el resultado y quiero finalizar esta recuperación
              conservando los archivos.
            </label>
            <div className="stash-actions">
              <button
                className="button"
                disabled={disabled}
                onClick={() => void run("refresh")}
              >
                Actualizar
              </button>
              <button
                className="button primary"
                disabled={disabled || !recovery.canFinish || !acknowledged}
                onClick={() => void run("finish")}
              >
                Finalizar revisión
              </button>
            </div>
          </section>
        ) : (
          <>
            <div
              className="stash-actions"
              role="group"
              aria-label="Operación de stash"
            >
              <button
                className="button"
                aria-pressed={mode === "save"}
                disabled={disabled}
                onClick={() => {
                  setMode("save");
                  invalidate();
                }}
              >
                Guardar cambios
              </button>
              <button
                className="button"
                aria-pressed={mode === "apply"}
                disabled={disabled}
                onClick={() => {
                  setMode("apply");
                  invalidate();
                }}
              >
                Restaurar stash ({options.entries.length})
              </button>
            </div>
            {mode === "save" ? (
              <>
                <label>
                  Descripción del stash
                  <input
                    value={description}
                    disabled={disabled}
                    maxLength={1000}
                    placeholder="Trabajo pendiente en…"
                    onChange={(event) => {
                      setDescription(event.target.value);
                      invalidate();
                    }}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={untracked}
                    disabled={disabled}
                    onChange={(event) => {
                      setUntracked(event.target.checked);
                      invalidate();
                    }}
                  />{" "}
                  Incluir archivos sin seguimiento
                </label>
                <p>
                  Se guardarán los cambios preparados y sin preparar. Los
                  archivos ignorados permanecerán en el árbol.
                </p>
              </>
            ) : options.entries.length ? (
              <>
                <label>
                  Stash guardado
                  <select
                    value={hash}
                    disabled={disabled}
                    onChange={(event) => {
                      setHash(event.target.value);
                      invalidate();
                    }}
                  >
                    {options.entries.map((entry, i) => (
                      <option key={`${entry.hash}-${i}`} value={entry.hash}>
                        {entry.label} · {entry.subject}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={index}
                    disabled={disabled}
                    onChange={(event) => {
                      setIndex(event.target.checked);
                      invalidate();
                    }}
                  />{" "}
                  Recuperar también qué cambios estaban preparados
                </label>
                <p>
                  La entrada y su respaldo se conservarán. La restauración
                  requiere un árbol limpio, incluidos archivos nuevos e
                  ignorados.
                </p>
              </>
            ) : (
              <p>
                No tienes stashes guardados. Usa Guardar cambios para crear el
                primero.
              </p>
            )}
            <div className="stash-actions">
              <button
                className="button"
                disabled={disabled}
                onClick={() => void run("refresh")}
              >
                Actualizar
              </button>
              <button
                className="button"
                disabled={
                  disabled || (mode === "save" ? !description.trim() : !hash)
                }
                onClick={() => void run("review")}
              >
                Revisar {mode === "save" ? "guardado" : "restauración"}
              </button>
            </div>
            {plan && (
              <section aria-label="Revisión de stash">
                <h3>
                  {plan.action.kind === "save"
                    ? "Guardar cambios"
                    : "Restaurar stash"}{" "}
                  en {plan.branch}
                </h3>
                <p>
                  HEAD <code>{plan.head.slice(0, 12)}</code>
                  {plan.action.kind === "apply" && (
                    <>
                      {" "}
                      · stash <code>{plan.action.hash.slice(0, 12)}</code>
                    </>
                  )}
                </p>
                {plan.files.length > 0 && (
                  <ul
                    className="stash-files"
                    aria-label="Archivos que se guardarán"
                  >
                    {plan.files.map((path) => (
                      <li key={path}>{path}</li>
                    ))}
                  </ul>
                )}
                {plan.patch && (
                  <details>
                    <summary>Ver diff del stash</summary>
                    <p>
                      Este diff muestra el resultado total de los archivos. No
                      separa los fragmentos que estaban preparados; revisa la
                      preparación en Cambios después de restaurar.
                    </p>
                    <DiffViewer text={plan.patch} />
                  </details>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={disabled}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />{" "}
                  {plan.action.kind === "save"
                    ? "Revisé los archivos; guardar y retirar estos cambios del árbol."
                    : "Revisé el stash; restaurarlo conservando la entrada original."}
                </label>
                <button
                  className="button primary"
                  disabled={disabled || !confirmed}
                  onClick={() => void run("confirm")}
                >
                  {plan.action.kind === "save"
                    ? "Guardar en Stash"
                    : "Restaurar conservando stash"}
                </button>
              </section>
            )}
          </>
        ))}
      {busy && <p role="status">Procesando Stash…</p>}
    </dialog>
  );
}

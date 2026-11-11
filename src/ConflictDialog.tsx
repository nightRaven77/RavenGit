import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitOperation, nextOperationId } from "./operations";

export interface ConflictView {
  path: string;
  versions: {
    stage: number;
    hash: string;
    text: string | null;
    restriction: string | null;
  }[];
}
interface EditPreview {
  token: string;
  path: string;
  text: string;
  lineEnding: string;
}
interface Saved {
  backup: string;
  message: string;
  prepareToken?: string | null;
}
interface StagePreview {
  token: string;
  path: string;
  hash: string;
  text: string;
  mode: string;
}
interface Prepared {
  message: string;
  warning: string | null;
}

export default function ConflictDialog({
  repoId,
  token,
  path,
  onClose,
  onLock,
}: {
  repoId: string;
  token: string;
  path: string;
  onClose: () => void;
  onLock?: (busy: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<ConflictView | null>(null);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<EditPreview | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [stage, setStage] = useState<StagePreview | null>(null);
  const [stageConfirmed, setStageConfirmed] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const flight = useRef(false);
  const lock = useRef(onLock);
  lock.current = onLock;
  const dirty = draft !== null && draft !== original && !saved;
  function close() {
    if (flight.current) return;
    if (dirty) {
      setDiscard(true);
      return;
    }
    onClose();
  }
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      lock.current?.(false);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setView(null);
    setError("");
    setEdit(null);
    setDraft(null);
    setSaved(null);
    setStage(null);
    setStageConfirmed(false);
    setPrepared(null);
    setConfirmed(false);
    invoke<ConflictView>("read_conflict", { id: repoId, token, path })
      .then((result) => {
        if (!cancelled) setView(result);
      })
      .catch((failure: unknown) => {
        if (!cancelled)
          setError(
            typeof failure === "object" && failure && "message" in failure
              ? String(failure.message)
              : "No se pudo consultar el conflicto. Actualiza Cambios antes de repetir.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [repoId, token, path]);
  async function review() {
    if (flight.current || saved) return;
    flight.current = true;
    setBusy(true);
    setError("");
    setConfirmed(false);
    lock.current?.(true);
    try {
      const next = await invoke<EditPreview>("preview_conflict_edit", {
        id: repoId,
        token,
        path,
      });
      setEdit(next);
      setOriginal(next.text);
      setDraft((current) => current ?? next.text);
    } catch (failure) {
      setEdit(null);
      setError(
        typeof failure === "object" && failure && "message" in failure
          ? String(failure.message)
          : "No se pudo revisar la edición. Conserva tu borrador y actualiza Cambios.",
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (flight.current || !edit || draft === null || !confirmed || saved)
      return;
    const reviewed = edit;
    flight.current = true;
    setBusy(true);
    setEdit(null);
    setError("");
    setConfirmed(false);
    const operationId = nextOperationId();
    emitOperation({
      id: operationId,
      operation: "conflict",
      status: "progress",
      title: "Guardando resolución…",
      message: "Se conservará un respaldo antes de escribir.",
      repoId,
    });
    try {
      const result = await invoke<Saved>("save_conflict_result", {
        id: repoId,
        token: reviewed.token,
        result: draft,
      });
      setSaved(result);
      emitOperation({
        id: operationId,
        operation: "conflict",
        status: "confirmed",
        title: "Resolución guardada",
        message: result.message,
        repoId,
      });
    } catch (failure) {
      const detail =
        typeof failure === "object" && failure && "message" in failure
          ? String(failure.message)
          : "No se pudo confirmar el guardado. Comprueba el archivo y respaldo antes de repetir; tu borrador se conserva.";
      setError(detail);
      emitOperation({
        id: operationId,
        operation: "conflict",
        status: "error",
        title: "Resolución no guardada",
        message: detail,
        repoId,
      });
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  async function prepare(review: boolean) {
    if (
      flight.current ||
      prepared ||
      !saved ||
      (review ? !saved.prepareToken : !stage || !stageConfirmed)
    )
      return;
    const reviewed = stage;
    flight.current = true;
    setBusy(true);
    setError("");
    setStage(null);
    setStageConfirmed(false);
    setSaved({ ...saved, prepareToken: null });
    const operationId = review ? "" : nextOperationId();
    if (!review)
      emitOperation({
        id: operationId,
        operation: "conflict",
        status: "progress",
        title: "Preparando resolución…",
        message: "RavenGit espera la confirmación del índice.",
        repoId,
      });
    try {
      if (review)
        setStage(
          await invoke<StagePreview>("preview_conflict_stage", {
            id: repoId,
            token: saved.prepareToken,
          }),
        );
      else if (reviewed) {
        const result = await invoke<Prepared>("prepare_conflict_result", {
          id: repoId,
          token: reviewed.token,
        });
        setPrepared(result);
        emitOperation({
          id: operationId,
          operation: "conflict",
          status: result.warning ? "warning" : "confirmed",
          title: "Resolución preparada",
          message: result.warning ?? result.message,
          repoId,
        });
      }
    } catch (failure) {
      const detail =
        typeof failure === "object" && failure && "message" in failure
          ? String(failure.message)
          : "No se confirmó la preparación. El guardado y respaldo se conservan; actualiza y comprueba el índice antes de repetir.";
      setError(detail);
      if (!review)
        emitOperation({
          id: operationId,
          operation: "conflict",
          status: "error",
          title: "Preparación no confirmada",
          message: detail,
          repoId,
        });
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="operation-dialog conflict-dialog"
      aria-labelledby="conflict-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="conflict-title">Consultar conflicto</h2>
        <button className="button" onClick={close} disabled={busy} autoFocus>
          Cerrar
        </button>
      </header>
      <code>{path}</code>
      <p>
        Las etapas del índice son de sólo lectura. El editor guarda únicamente
        el archivo de trabajo con respaldo; no prepara ni continúa la operación.
      </p>
      {discard && (
        <section aria-label="Descartar borrador">
          <p>Hay cambios sin guardar. ¿Quieres descartar el borrador?</p>
          <button className="button" onClick={() => setDiscard(false)}>
            Seguir editando
          </button>
          <button className="button" onClick={onClose}>
            Descartar y cerrar
          </button>
        </section>
      )}
      <p>
        Local y entrante describen las etapas 2 y 3 de Git, no necesariamente
        tus ramas. En rebase, local suele ser el destino y entrante el commit
        reaplicado. Una etapa ausente no equivale a un archivo vacío.
      </p>
      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}
      {!view && !error ? (
        <p role="status">Leyendo versiones del conflicto…</p>
      ) : view ? (
        <div className="conflict-versions">
          {[
            [1, "Base"],
            [2, "Local (etapa 2)"],
            [3, "Entrante (etapa 3)"],
          ].map(([stage, label]) => {
            const version = view.versions.find(
              (version) => version.stage === stage,
            );
            return (
              <section key={stage} aria-label={String(label)}>
                <h3>{label}</h3>
                {!version ? (
                  <p>Etapa ausente: posible alta o eliminación.</p>
                ) : (
                  <>
                    <code>{version.hash.slice(0, 12)}</code>
                    {version.restriction ? (
                      <p>{version.restriction}</p>
                    ) : (
                      <pre tabIndex={0} aria-label={`Contenido ${label}`}>
                        {version.text === "" ? "(Archivo vacío)" : version.text}
                      </pre>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      ) : null}
      {saved ? (
        <section role="status">
          <p>{prepared?.message ?? saved.message}</p>
          {busy && <p>Comprobando preparación de la resolución…</p>}
          {prepared?.warning && (
            <p className="banner warning">{prepared.warning}</p>
          )}
          <p>
            Respaldo persistente: <code>{saved.backup}</code>
          </p>
          {!prepared && saved.prepareToken && (
            <>
              <p>
                Preparar es una acción independiente: Git puede aplicar filtros
                configurados y normalizar el texto. La revisión no instala el
                índice, pero puede escribir objetos Git y ejecutar filtros.
              </p>
              <button
                className="button"
                disabled={busy}
                onClick={() => void prepare(true)}
              >
                Revisar preparación…
              </button>
            </>
          )}
          {!prepared && stage && (
            <section
              className="conflict-stage-preview"
              aria-label="Revisión de preparación"
            >
              <h3>Contenido que quedará preparado</h3>
              <code>
                {stage.path} · {stage.hash} · modo {stage.mode}
              </code>
              <pre tabIndex={0} aria-label="Contenido preparado revisado">
                {stage.text || "(Archivo vacío)"}
              </pre>
              <label>
                <input
                  type="checkbox"
                  checked={stageConfirmed}
                  disabled={busy}
                  onChange={(event) => setStageConfirmed(event.target.checked)}
                />
                He revisado el contenido del índice y autorizo preparar
                únicamente este archivo.
              </label>
              <button
                className="button primary"
                disabled={busy || !stageConfirmed}
                onClick={() => void prepare(false)}
              >
                Preparar resolución revisada
              </button>
            </section>
          )}
          {!prepared && !saved.prepareToken && !stage && !busy && (
            <p>
              Si la revisión ya no está disponible, cierra y actualiza Cambios.
              Comprueba la preparación desde la recuperación de la operación; no
              se repite automáticamente.
            </p>
          )}
        </section>
      ) : (
        view && (
          <section aria-label="Editor de resultado">
            {draft === null || !edit ? (
              <button
                className="button"
                disabled={busy}
                onClick={() => void review()}
              >
                {draft === null
                  ? "Editar resultado…"
                  : "Volver a revisar el guardado"}
              </button>
            ) : null}
            {draft !== null && (
              <>
                <p>
                  Texto UTF-8, máximo 512 KiB. Finales de línea conservados:{" "}
                  {edit?.lineEnding ?? "según revisión"}. El respaldo queda en
                  la carpeta Git. No se permite guardar marcadores de conflicto.
                </p>
                <div className="commit-actions">
                  {view.versions
                    .filter(
                      (version) =>
                        version.text !== null && !version.restriction,
                    )
                    .map((version) => (
                      <button
                        className="button"
                        key={version.stage}
                        disabled={busy}
                        onClick={() => {
                          setDraft(version.text);
                          setConfirmed(false);
                        }}
                      >
                        Usar{" "}
                        {version.stage === 1
                          ? "base"
                          : version.stage === 2
                            ? "local"
                            : "entrante"}
                      </button>
                    ))}
                </div>
                <label htmlFor="conflict-result">
                  Resultado de la resolución
                </label>
                <textarea
                  id="conflict-result"
                  value={draft}
                  rows={14}
                  disabled={busy}
                  spellCheck={false}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setConfirmed(false);
                  }}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy || !edit}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  He revisado el resultado y autorizo reemplazar el archivo de
                  trabajo con respaldo.
                </label>
                <button
                  className="button primary"
                  disabled={busy || !edit || !confirmed || !dirty}
                  onClick={() => void save()}
                >
                  {busy ? "Guardando…" : "Guardar resolución con respaldo"}
                </button>
              </>
            )}
          </section>
        )
      )}
      <p>
        Guardar no resuelve el índice. Puedes revisar y preparar este archivo
        explícitamente; después cierra y actualiza la recuperación de la
        operación para continuar. Nunca se crea un commit ni se continúa
        automáticamente.
      </p>
    </dialog>
  );
}

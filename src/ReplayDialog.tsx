import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import DiffViewer from "./DiffViewer";
import { emitOperation, nextOperationId } from "./operations";
type Kind = "cherryPick" | "revert";
export type ReplayTarget = { kind: Kind; commit: string };
type Plan = ReplayTarget & {
  token: string;
  branch: string;
  head: string;
  subject: string;
  patch: string;
};
type Action =
  | { kind: "continue" | "abort" | "clearRecord" }
  | { kind: "resolve"; path: string };
type Recovery = {
  token: string;
  kind: Kind;
  commit: string;
  branch: string;
  original: string;
  backup: string;
  status: "active" | "unchanged" | "completed";
  conflicts: string[];
  canContinue: boolean;
  canClear: boolean;
};
type Options = {
  trusted: boolean;
  branch: string | null;
  restriction: string | null;
  recovery: Recovery | null;
};
const message = (error: unknown) =>
  typeof error === "object" && error && "message" in error
    ? String(error.message)
    : String(error);
export default function ReplayDialog({
  repoId,
  initial,
  onClose,
  onLock,
  onUpdated,
}: {
  repoId: string;
  initial?: ReplayTarget;
  onClose: () => void;
  onLock: (busy: boolean) => void;
  onUpdated: () => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef(0),
    flight = useRef(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [kind, setKind] = useState<Kind>(initial?.kind ?? "cherryPick");
  const [commit, setCommit] = useState(initial?.commit ?? "");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const recovery = options?.recovery;
  const allowed = !!options?.trusted && !busy && !loading;
  async function load() {
    const sequence = ++request.current;
    setLoading(true);
    setOptions(null);
    setPlan(null);
    setConfirmed(false);
    try {
      const next = await invoke<Options>("read_replay", { id: repoId });
      if (sequence === request.current) setOptions(next);
    } catch (error) {
      if (sequence === request.current) setError(message(error));
    } finally {
      if (sequence === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    void load();
    return () => {
      request.current++;
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [repoId]);
  function close() {
    if (flight.current) return;
    request.current++;
    dialog.current?.close();
    onClose();
  }
  async function run(
    operation: "authorize" | "review" | "edit",
    token = "",
    action: Action | null = null,
  ) {
    if (flight.current || loading) return;
    flight.current = true;
    const reports = operation === "edit" || operation === "authorize";
    const operationId = reports ? nextOperationId() : "";
    setBusy(true);
    onLock(true);
    setError("");
    setNotice("");
    setPlan(null);
    setConfirmed(false);
    if (reports)
      emitOperation({
        id: operationId,
        repoId,
        operation: operation === "edit" ? "replay" : "trust",
        status: "progress",
        title:
          operation === "edit"
            ? `${label} en curso`
            : "Autorizando repositorio",
        destination:
          operation === "edit" ? (action?.kind ?? kind) : "Confianza local",
        message:
          operation === "edit"
            ? "Aplicando la revisión y conservando el respaldo…"
            : "Habilitando operaciones locales para esta ruta…",
      });
    try {
      if (operation === "authorize") {
        await invoke("authorize_repository", { id: repoId });
        emitOperation({
          id: operationId,
          repoId,
          operation: "trust",
          status: "confirmed",
          title: "Repositorio autorizado",
          destination: "Confianza local",
          message:
            "Las operaciones de commit quedaron habilitadas para esta ruta.",
        });
        await load();
      } else if (operation === "review") {
        setPlan(
          await invoke<Plan>("preview_replay", { id: repoId, kind, commit }),
        );
      } else {
        const result = await invoke<{
          message: string;
          warning: string | null;
        }>("edit_replay", { id: repoId, token, action });
        setNotice([result.message, result.warning].filter(Boolean).join(" "));
        let warning = result.warning ?? "";
        if (!(await onUpdated())) {
          warning = [
            warning,
            "El historial no pudo refrescarse. Actualiza sin repetir la operación.",
          ]
            .filter(Boolean)
            .join(" ");
          setNotice(
            (previous) =>
              `${previous} El historial no pudo refrescarse. No repitas la operación para actualizarlo.`,
          );
        }
        emitOperation({
          id: operationId,
          repoId,
          operation: "replay",
          status: warning ? "warning" : "confirmed",
          title: `${label} actualizado`,
          destination: action?.kind ?? kind,
          message: result.message,
          warning: warning || undefined,
        });
        await load();
      }
    } catch (error) {
      const text = message(error);
      setError(text);
      if (reports)
        emitOperation({
          id: operationId,
          repoId,
          operation: operation === "edit" ? "replay" : "trust",
          status: "error",
          title:
            operation === "edit"
              ? `${label} no completado`
              : "Autorización no completada",
          destination:
            operation === "edit" ? (action?.kind ?? kind) : "Confianza local",
          message: text,
        });
      if (operation !== "authorize") {
        if (operation === "edit") await onUpdated();
        await load();
      }
    } finally {
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }
  const label = kind === "cherryPick" ? "Cherry-pick" : "Revert";
  return (
    <dialog
      ref={dialog}
      className="operation-dialog"
      aria-labelledby="replay-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="replay-title">Cherry-pick y revert</h2>
        <button className="button" disabled={busy} onClick={close}>
          Cerrar
        </button>
      </header>
      <p>
        Aplica un commit a la rama activa o crea un commit que invierte sus
        cambios. No reescribe ni publica el historial.
      </p>
      <button
        className="button"
        disabled={busy || loading}
        onClick={() => {
          setError("");
          void load();
        }}
      >
        Actualizar operación
      </button>
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
      {loading && <p role="status">Leyendo estado local…</p>}
      {options && !options.trusted && (
        <>
          <p>
            Autoriza este repositorio para inspeccionar cambios y ejecutar Git
            con sus filtros, hooks y firma configurados.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() => void run("authorize")}
          >
            Autorizar operaciones de commit
          </button>
        </>
      )}
      {options?.trusted && recovery && (
        <section aria-label="Recuperación de operación de commit">
          <h3>
            {recovery.kind === "cherryPick" ? "Cherry-pick" : "Revert"} ·
            recuperación
          </h3>
          <p>
            Rama: <strong>{recovery.branch}</strong> · Commit:{" "}
            <code>{recovery.commit}</code>
          </p>
          <p>
            Original: <code>{recovery.original}</code> · Respaldo:{" "}
            <code>{recovery.backup}</code>
          </p>
          {recovery.status === "active" ? (
            <>
              <p>
                La operación sigue en Git y puede recuperarse tras reiniciar.
                Edita y guarda los archivos fuera de RavenGit, elimina
                marcadores, actualiza y prepara cada resolución. Revisa los
                diffs en Cambios cerrando este diálogo.
              </p>
              <ul>
                {recovery.conflicts.map((path) => (
                  <li key={path}>
                    <code>{path}</code>{" "}
                    <button
                      className="button"
                      disabled={!allowed}
                      onClick={() =>
                        void run("edit", recovery.token, {
                          kind: "resolve",
                          path,
                        })
                      }
                    >
                      Marcar resuelto: {path}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                className="button primary"
                disabled={!allowed || !recovery.canContinue}
                onClick={() =>
                  void run("edit", recovery.token, { kind: "continue" })
                }
              >
                Continuar operación
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                He guardado mis ediciones: abortar puede descartar resoluciones
                y cambios de esta operación.
              </label>
              <button
                className="button"
                disabled={!allowed || !confirmed}
                onClick={() =>
                  void run("edit", recovery.token, { kind: "abort" })
                }
              >
                Abortar operación
              </button>
            </>
          ) : (
            <>
              <p>
                {recovery.status === "unchanged"
                  ? "HEAD conserva el commit original. No hay operación Git activa."
                  : "HEAD tiene un nuevo commit cuyo padre es el original. Comprueba el resultado antes de retirar el registro."}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                He revisado Git y quiero retirar sólo el registro, conservando
                archivos y respaldo.
              </label>
              <button
                className="button"
                disabled={!allowed || !confirmed || !recovery.canClear}
                onClick={() =>
                  void run("edit", recovery.token, { kind: "clearRecord" })
                }
              >
                Retirar registro de operación
              </button>
            </>
          )}
        </section>
      )}
      {options?.trusted && !recovery && (
        <>
          <p>
            Destino: <strong>{options.branch ?? "HEAD separado"}</strong>
          </p>
          {options.restriction && <p role="status">{options.restriction}</p>}
          <label>
            Operación{" "}
            <select
              value={kind}
              disabled={busy}
              onChange={(e) => {
                setKind(e.target.value as Kind);
                setPlan(null);
                setConfirmed(false);
              }}
            >
              <option value="cherryPick">Cherry-pick</option>
              <option value="revert">Revert</option>
            </select>
          </label>
          <label>
            Hash completo del commit{" "}
            <input
              value={commit}
              maxLength={64}
              disabled={busy}
              onChange={(e) => {
                setCommit(e.target.value);
                setPlan(null);
                setConfirmed(false);
              }}
            />
          </label>
          <p>
            Un commit por operación, sin rangos ni commits de merge. Requiere
            árbol limpio y archivos ignorados apartados. La revisión no predice
            conflictos.
          </p>
          <button
            className="button"
            disabled={!allowed || !!options.restriction || !commit.trim()}
            onClick={() => void run("review")}
          >
            Revisar {label}
          </button>
          {plan && (
            <section aria-label="Revisión de operación de commit">
              <h3>{plan.subject}</h3>
              <p>
                {plan.kind === "cherryPick" ? "Aplicar" : "Invertir"}{" "}
                <code>{plan.commit}</code> en <strong>{plan.branch}</strong>,
                HEAD <code>{plan.head}</code>.
              </p>
              <DiffViewer
                text={
                  plan.patch ||
                  "Sin diferencias de contenido. Git podría detenerse por resultado vacío."
                }
              />
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                Confirmo el commit y la rama de destino; se creará un nuevo
                commit y puede haber conflictos.
              </label>
              <button
                className="button primary"
                disabled={!allowed || !confirmed}
                onClick={() => void run("edit", plan.token)}
              >
                Confirmar{" "}
                {plan.kind === "cherryPick" ? "Cherry-pick" : "Revert"}
              </button>
            </section>
          )}
        </>
      )}
    </dialog>
  );
}

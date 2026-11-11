import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import MergeRecovery from "./MergeRecovery";
import RebaseRecovery from "./RebaseRecovery";
import InteractiveRebaseDialog from "./InteractiveRebaseDialog";
import type {
  BranchEdit,
  BranchesState,
  BranchOutcome,
  MergePreview,
  MergeEdit,
  RebasePreview,
  RebaseEdit,
} from "./types";
import { emitOperation, nextOperationId } from "./operations";

type Props = {
  active: boolean;
  repoId: string;
  onLock: (value: boolean) => void;
  onUpdated: () => Promise<boolean>;
};
const message = (error: unknown) =>
  typeof error === "object" && error && "message" in error
    ? String(error.message)
    : String(error);

export default function BranchesPanel({
  active,
  repoId,
  onLock,
  onUpdated,
}: Props) {
  const [state, setState] = useState<BranchesState | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("");
  const [rename, setRename] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);
  const [rebasePreview, setRebasePreview] = useState<RebasePreview | null>(
    null,
  );
  const [confirmRebase, setConfirmRebase] = useState(false);
  const [interactiveOpen, setInteractiveOpen] = useState(false);
  const request = useRef(0);
  const flight = useRef(false);
  const renameInput = useRef<HTMLInputElement>(null);
  const allowed = !!state?.trusted && !state.restriction && !busy && !loading;
  const branch = state?.branches.find((item) => item.name === selected);

  async function reload() {
    setConfirmRebase(false);
    setMergePreview(null);
    setRebasePreview(null);
    const sequence = ++request.current;
    setLoading(true);
    setState(null);
    try {
      const next = await invoke<BranchesState>("read_branches", { id: repoId });
      if (sequence !== request.current) return;
      setState(next);
      setSelected((previous) =>
        next.branches.some((item) => item.name === previous) ? previous : "",
      );
    } catch (error) {
      if (sequence === request.current) setError(message(error));
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

  async function reviewMerge(source: string) {
    if (flight.current || !allowed || !state) return;
    flight.current = true;
    const sequence = ++request.current;
    setBusy(true);
    onLock(true);
    setError("");
    setNotice("");
    setMergePreview(null);
    setRebasePreview(null);
    try {
      const result = await invoke<MergePreview>("preview_merge", {
        id: repoId,
        token: state.token,
        source,
      });
      if (sequence === request.current) setMergePreview(result);
    } catch (error) {
      if (sequence === request.current) setError(message(error));
    } finally {
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }

  async function reviewRebase(base: string) {
    setConfirmRebase(false);
    if (flight.current || !allowed || !state) return;
    flight.current = true;
    const sequence = ++request.current;
    setBusy(true);
    onLock(true);
    setError("");
    setNotice("");
    setMergePreview(null);
    setRebasePreview(null);
    try {
      const result = await invoke<RebasePreview>("preview_rebase", {
        id: repoId,
        token: state.token,
        base,
      });
      if (sequence === request.current) setRebasePreview(result);
    } catch (error) {
      if (sequence === request.current) setError(message(error));
    } finally {
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }

  async function perform(edit?: BranchEdit) {
    if (flight.current || loading || !state || (edit && !allowed)) return;
    flight.current = true;
    const operationId = nextOperationId();
    const operation = edit ? "branch" : "trust";
    const destination = edit
      ? edit.kind === "rename"
        ? `${edit.source} → ${edit.name}`
        : edit.name
      : "Confianza local";
    setBusy(true);
    onLock(true);
    setError("");
    setNotice("");
    emitOperation({
      id: operationId,
      repoId,
      operation,
      status: "progress",
      title: edit ? "Actualizando rama" : "Autorizando repositorio",
      destination,
      message: "Aplicando la operación revisada…",
    });
    try {
      if (!edit) {
        await invoke("authorize_repository", { id: repoId });
        emitOperation({
          id: operationId,
          repoId,
          operation,
          status: "confirmed",
          title: "Repositorio autorizado",
          destination,
          message: "La gestión de ramas quedó habilitada para esta ruta.",
        });
      } else {
        const result = await invoke<BranchOutcome>("edit_branch", {
          id: repoId,
          token: state.token,
          edit,
        });
        setNotice([result.message, result.warning].filter(Boolean).join(" "));
        setName("");
        setRename("");
        let warning = result.warning ?? "";
        if (!(await onUpdated())) {
          warning = [
            warning,
            "El historial no pudo actualizarse. Actualiza la vista sin repetir la operación.",
          ]
            .filter(Boolean)
            .join(" ");
          setNotice(
            (previous) =>
              `${previous} El historial no pudo actualizarse; revisa el aviso global. No repitas la operación para refrescarlo.`,
          );
        }
        emitOperation({
          id: operationId,
          repoId,
          operation,
          status: warning ? "warning" : "confirmed",
          title: "Rama actualizada",
          destination,
          message: result.message,
          warning: warning || undefined,
        });
      }
    } catch (error) {
      const text = message(error);
      setError(text);
      emitOperation({
        id: operationId,
        repoId,
        operation,
        status: "error",
        title: edit ? "Rama no actualizada" : "Autorización no completada",
        destination,
        message: text,
      });
      if (edit) await onUpdated();
    } finally {
      await reload();
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }
  async function performMerge(token: string, edit: MergeEdit) {
    if (flight.current || busy || loading || !state?.trusted) return;
    flight.current = true;
    const operationId = nextOperationId();
    setBusy(true);
    onLock(true);
    setMergePreview(null);
    setError("");
    setNotice("");
    emitOperation({
      id: operationId,
      repoId,
      operation: "merge",
      status: "progress",
      title: "Merge en curso",
      destination: edit.kind,
      message: "Aplicando la acción revisada…",
    });
    try {
      const result = await invoke<BranchOutcome>("edit_merge", {
        id: repoId,
        token,
        edit,
      });
      setNotice([result.message, result.warning].filter(Boolean).join(" "));
      let warning = result.warning ?? "";
      if (!(await onUpdated())) {
        warning = [
          warning,
          "No se pudo actualizar el historial. Actualiza sin repetir el merge.",
        ]
          .filter(Boolean)
          .join(" ");
        setNotice(
          (previous) =>
            `${previous} No se pudo actualizar el historial. No repitas el merge para refrescarlo.`,
        );
      }
      emitOperation({
        id: operationId,
        repoId,
        operation: "merge",
        status: warning ? "warning" : "confirmed",
        title: "Merge actualizado",
        destination: edit.kind,
        message: result.message,
        warning: warning || undefined,
      });
    } catch (error) {
      const text = message(error);
      setError(text);
      emitOperation({
        id: operationId,
        repoId,
        operation: "merge",
        status: "error",
        title: "Merge no completado",
        destination: edit.kind,
        message: text,
      });
      await onUpdated();
    } finally {
      await reload();
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }
  async function performRebase(token: string, edit: RebaseEdit | null) {
    if (flight.current || busy || loading || !state?.trusted) return;
    flight.current = true;
    const operationId = nextOperationId();
    setBusy(true);
    onLock(true);
    setRebasePreview(null);
    setConfirmRebase(false);
    setError("");
    setNotice("");
    emitOperation({
      id: operationId,
      repoId,
      operation: "rebase",
      status: "progress",
      title: "Rebase en curso",
      destination: edit?.kind ?? "Inicio",
      message: "Aplicando la revisión y conservando el respaldo…",
    });
    try {
      const result = await invoke<BranchOutcome>("edit_rebase", {
        id: repoId,
        token,
        edit,
      });
      setNotice([result.message, result.warning].filter(Boolean).join(" "));
      let warning = result.warning ?? "";
      if (!(await onUpdated())) {
        warning = [
          warning,
          "No se pudo refrescar el historial. Actualiza sin repetir el rebase.",
        ]
          .filter(Boolean)
          .join(" ");
        setNotice(
          (previous) =>
            `${previous} No se pudo refrescar el historial. No repitas el rebase para actualizarlo.`,
        );
      }
      emitOperation({
        id: operationId,
        repoId,
        operation: "rebase",
        status: warning ? "warning" : "confirmed",
        title: "Rebase actualizado",
        destination: edit?.kind ?? "Inicio",
        message: result.message,
        warning: warning || undefined,
      });
    } catch (error) {
      const text = message(error);
      setError(text);
      emitOperation({
        id: operationId,
        repoId,
        operation: "rebase",
        status: "error",
        title: "Rebase no completado",
        destination: edit?.kind ?? "Inicio",
        message: text,
      });
      await onUpdated();
    } finally {
      await reload();
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }
  return (
    <>
      {interactiveOpen && rebasePreview && (
        <InteractiveRebaseDialog
          repoId={repoId}
          preview={rebasePreview}
          onClose={() => {
            setInteractiveOpen(false);
            setRebasePreview(null);
            void reload();
          }}
          onLock={(value) => {
            if (value) setNotice("");
            setBusy(value);
            onLock(value);
          }}
          onUpdated={onUpdated}
        />
      )}
      <section
        id="branches-content"
        tabIndex={-1}
        hidden={!active}
        className="history-panel remote-panel"
        aria-label="Ramas locales"
      >
        <div className="panel-heading">
          <div>
            <h1>Ramas locales</h1>
            <p>Organiza tu trabajo desde el commit actual</p>
          </div>
          <button
            className="button"
            disabled={busy || loading}
            onClick={() => {
              setError("");
              void reload();
            }}
          >
            Actualizar ramas
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
          {loading && <p role="status">Leyendo ramas y cambios locales…</p>}
          {state && !state.trusted && (
            <section className="trust-panel">
              <h2>Autorizar este repositorio</h2>
              <p>
                Git puede ejecutar filtros y hooks configurados. La autorización
                se recordará en este equipo y puede revocarse desde Cambios.
              </p>
              <button
                className="button primary"
                disabled={busy || loading}
                onClick={() => void perform()}
              >
                Autorizar operaciones
              </button>
            </section>
          )}
          {state?.trusted && (
            <>
              {(state.operation === "rebase-merge" || state.rebaseRecord) && (
                <RebaseRecovery
                  repoId={repoId}
                  busy={busy}
                  onEdit={performRebase}
                />
              )}
              {state.operation === "MERGE_HEAD" && (
                <MergeRecovery
                  repoId={repoId}
                  busy={busy}
                  onEdit={performMerge}
                />
              )}
              <p>
                Rama activa: <strong>{state.current ?? "HEAD separado"}</strong>
              </p>
              {state.restriction && (
                <div className="banner warning" role="status">
                  {state.restriction}
                </div>
              )}
              <p>
                Usa Cambiar junto a la rama con la que quieras trabajar. Se
                actualizarán los archivos y el índice sin descartar cambios.
              </p>
              <ul
                className="remote-list branch-list"
                aria-label="Ramas locales disponibles"
              >
                {state.branches.map((item) => (
                  <li
                    key={item.name}
                    className={`remote-item branch-list-item ${state.current === item.name ? "selected" : ""}`}
                  >
                    <div className="branch-item-summary">
                      <strong>{item.name}</strong>
                      <code>{item.hash.slice(0, 8)}</code>
                    </div>
                    <div className="branch-item-actions">
                      <button
                        className="button"
                        aria-label={`Revisar rebase de ${state.current ?? "HEAD separado"} sobre ${item.name}`}
                        disabled={
                          !allowed ||
                          !state.current ||
                          item.name === state.current
                        }
                        onClick={() => void reviewRebase(item.name)}
                      >
                        Revisar rebase
                      </button>
                      <button
                        className="button"
                        aria-label={`Revisar merge de ${item.name} en ${state.current ?? "HEAD separado"}`}
                        disabled={
                          !allowed ||
                          !state.current ||
                          item.name === state.current
                        }
                        onClick={() => void reviewMerge(item.name)}
                      >
                        Revisar merge
                      </button>
                      <button
                        className="button primary"
                        aria-label={
                          item.name === state.current
                            ? `Rama activa: ${item.name}`
                            : `Cambiar a ${item.name}`
                        }
                        disabled={!allowed || item.name === state.current}
                        onClick={() =>
                          void perform({ kind: "switch", name: item.name })
                        }
                      >
                        {item.name === state.current ? "Activa" : "Cambiar"}
                      </button>
                      <button
                        className="button"
                        aria-label={`Renombrar ${item.name}`}
                        aria-pressed={selected === item.name}
                        disabled={!allowed}
                        onClick={() => {
                          setSelected(item.name);
                          setRename("");
                          requestAnimationFrame(() =>
                            renameInput.current?.focus(),
                          );
                        }}
                      >
                        Renombrar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {!state.branches.length && (
                <p>No hay ramas con commits todavía.</p>
              )}
            </>
          )}
        </div>
      </section>
      <aside
        className="inspector remote-panel"
        hidden={!active}
        aria-label="Operaciones de ramas"
      >
        <div className="panel-heading">
          <div>
            <h2>Gestionar ramas</h2>
            <p>Sin descartar archivos ni forzar cambios</p>
          </div>
        </div>
        <div className="remote-body">
          <section
            className="remote-form"
            aria-label="Revisión de rebase"
            hidden={!rebasePreview}
          >
            <h3>Rebase · revisión previa</h3>
            {rebasePreview ? (
              <>
                <p>
                  Rama que se reubicaría:{" "}
                  <strong>{rebasePreview.branch}</strong> · Base:{" "}
                  <strong>{rebasePreview.base}</strong>
                </p>
                <p>
                  HEAD: <code>{rebasePreview.headHash}</code>
                  <br />
                  Base: <code>{rebasePreview.baseHash}</code>
                </p>
                <p role="status">
                  {rebasePreview.relation === "upToDate"
                    ? "La rama activa ya contiene la base; no necesita rebase lineal. Puedes editar sus commits exclusivos con el plan interactivo."
                    : rebasePreview.relation === "fastForward"
                      ? "La rama activa puede avanzar a la base sin reproducir commits."
                      : "Las ramas han divergido. Reubicar los commits puede cambiar sus hashes y producir conflictos."}
                </p>
                <p>
                  {rebasePreview.candidates} commits exclusivos de la rama
                  activa.
                </p>
                <ul aria-label="Commits candidatos a rebase">
                  {rebasePreview.commits.map((commit) => (
                    <li key={commit.hash}>
                      <code>{commit.hash.slice(0, 8)}</code> {commit.subject}
                    </li>
                  ))}
                </ul>
                {rebasePreview.truncated && (
                  <p>
                    Lista limitada a 100 commits; no representa la secuencia
                    completa.
                  </p>
                )}
                {rebasePreview.containsMerges && (
                  <p className="banner warning">
                    El rango contiene merges. Su tratamiento requiere un flujo
                    específico todavía pendiente.
                  </p>
                )}
                <button
                  className="button"
                  disabled={
                    busy ||
                    rebasePreview.containsMerges ||
                    rebasePreview.truncated ||
                    rebasePreview.candidates < 1 ||
                    rebasePreview.candidates > 50
                  }
                  onClick={(event) => {
                    event.currentTarget.focus();
                    setInteractiveOpen(true);
                  }}
                >
                  Editar plan interactivo…
                </button>
                <p>El plan interactivo admite de 1 a 50 commits sin merges.</p>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmRebase}
                    disabled={busy}
                    onChange={(event) => setConfirmRebase(event.target.checked)}
                  />{" "}
                  Entiendo que el rebase puede cambiar hashes. He comprobado por
                  mi cuenta si estos commits están compartidos o publicados.
                </label>
                <button
                  className="button primary"
                  disabled={
                    !allowed ||
                    !confirmRebase ||
                    rebasePreview.containsMerges ||
                    rebasePreview.relation === "upToDate"
                  }
                  onClick={() => void performRebase(rebasePreview.token, null)}
                >
                  Confirmar rebase de {rebasePreview.branch} sobre{" "}
                  {rebasePreview.base}
                </button>
                <p>
                  Los candidatos se calculan por ascendencia. Git puede omitir
                  parches equivalentes; esta lista no predice el resultado ni
                  los conflictos. No se ha comprobado si estos commits están
                  publicados.
                </p>
              </>
            ) : (
              <p>
                Usa Revisar rebase junto a la rama que quieras tomar como base.
                La rama activa es la que se reubicaría.
              </p>
            )}
            <p>
              Revisar sólo lee información local. Confirmar rebase modifica la
              rama activa y conserva una referencia de respaldo; si se detiene,
              podrás resolver, continuar o abortar desde Ramas. No hay
              publicación automática.
            </p>
          </section>
          <section
            className="remote-form"
            aria-label="Revisión de merge"
            hidden={!mergePreview}
          >
            <h3>Revisar integración</h3>
            <p>
              Compara otra rama con la activa sin cambiar archivos ni contactar
              remotos.
            </p>
            {mergePreview ? (
              <>
                <p>
                  Origen: <strong>{mergePreview.source}</strong> · Destino:{" "}
                  <strong>{mergePreview.destination}</strong>
                </p>
                <p>
                  <code>{mergePreview.sourceHash.slice(0, 8)}</code> →{" "}
                  <code>{mergePreview.destinationHash.slice(0, 8)}</code>
                </p>
                <p role="status">
                  {mergePreview.shallow
                    ? "Historial superficial: la relación no es concluyente. Completa el historial antes de integrar."
                    : mergePreview.relation === "upToDate"
                      ? "La rama activa ya contiene todos los commits del origen."
                      : mergePreview.relation === "fastForward"
                        ? "Es posible avanzar la rama activa mediante fast-forward."
                        : "Las ramas han divergido. La integración requiere un merge y podría producir conflictos."}
                </p>
                <p>
                  {mergePreview.incoming} commits entrantes ·{" "}
                  {mergePreview.local} exclusivos del destino.
                </p>
                <ul aria-label="Commits entrantes">
                  {mergePreview.commits.map((commit) => (
                    <li key={commit.hash}>
                      <code>{commit.hash.slice(0, 8)}</code> {commit.subject}
                    </li>
                  ))}
                </ul>
                {mergePreview.truncated && (
                  <p>Se muestran los primeros 100 commits entrantes.</p>
                )}
                <p>
                  La revisión no predice conflictos. Un fast-forward avanza la
                  rama directamente. Un merge divergente se detiene antes del
                  commit para revisar y continuar, o abortar.
                </p>
                <button
                  className="button primary"
                  disabled={
                    !allowed ||
                    mergePreview.shallow ||
                    mergePreview.relation === "upToDate"
                  }
                  onClick={() =>
                    void performMerge(mergePreview.token, {
                      kind: "start",
                      source: mergePreview.source,
                      sourceHash: mergePreview.sourceHash,
                      destinationHash: mergePreview.destinationHash,
                    })
                  }
                >
                  Confirmar merge de {mergePreview.source} en{" "}
                  {mergePreview.destination}
                </button>
              </>
            ) : (
              <p>Usa Revisar merge junto a la rama que quieras integrar.</p>
            )}
          </section>
          <form
            className="remote-form"
            onSubmit={(event) => {
              event.preventDefault();
              void perform({ kind: "create", name });
            }}
          >
            <h3>Crear desde HEAD</h3>
            <p>
              Base: {state?.head?.slice(0, 8) ?? "Sin commits"}. Crear conserva
              la rama activa.
            </p>
            <label>
              Nombre de la nueva rama
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!allowed}
                maxLength={256}
                placeholder="feature/mi-cambio"
              />
            </label>
            <button
              className="button primary"
              disabled={!allowed || !name.trim()}
            >
              Crear rama
            </button>
          </form>
          <section className="remote-form" hidden={!branch}>
            <h3>Renombrar rama</h3>
            <p>
              {branch?.name ??
                "Usa Renombrar junto a la rama que quieras editar."}
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (branch)
                  void perform({
                    kind: "rename",
                    source: branch.name,
                    name: rename,
                  });
              }}
            >
              <label>
                Nuevo nombre de la rama seleccionada
                <input
                  ref={renameInput}
                  value={rename}
                  onChange={(event) => setRename(event.target.value)}
                  disabled={!allowed || !branch}
                  maxLength={256}
                />
              </label>
              <button
                className="button"
                disabled={
                  !allowed ||
                  !branch ||
                  !rename.trim() ||
                  rename === branch.name
                }
              >
                Renombrar rama
              </button>
            </form>
          </section>
        </div>
      </aside>
    </>
  );
}

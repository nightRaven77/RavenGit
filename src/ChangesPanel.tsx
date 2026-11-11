import { useEffect, useMemo, useRef, useState } from "react";
import { DiffContent, DiffModeControl, type DiffMode } from "./DiffViewer";
import { splitDiff } from "./splitDiff";
import { invoke } from "@tauri-apps/api/core";
import AmendDialog from "./AmendDialog";
import ConflictDialog from "./ConflictDialog";
import RestoreDialog from "./RestoreDialog";
import {
  CheckIcon,
  ExclamationTriangleIcon,
  FileTextIcon,
  LockClosedIcon,
  MinusIcon,
  PlusIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import type {
  ChangeArea,
  ChangeEntry,
  ChangesState,
  FileDiff,
  MutationResult,
} from "./types";
import {
  emitOperation,
  nextOperationId,
  type OperationReport,
} from "./operations";
interface Props {
  refreshKey?: number;
  active: boolean;
  repoId: string;
  onLock: (locked: boolean) => void;
  onCommitted: () => Promise<boolean>;
  onBranches?: () => void;
}
interface Selection {
  path: string;
  area: ChangeArea;
}
function message(error: unknown): string {
  return typeof error === "object" && error && "message" in error
    ? String(error.message)
    : "No se pudo completar la operación. Actualiza y comprueba el estado.";
}
function entriesIn(entries: ChangeEntry[], area: ChangeArea) {
  return entries.filter((e) =>
    area === "staged"
      ? !e.untracked && e.indexStatus !== " "
      : e.untracked || e.worktreeStatus !== " ",
  );
}
export default function ChangesPanel({
  active,
  repoId,
  refreshKey = 0,
  onLock,
  onCommitted,
  onBranches,
}: Props) {
  const [state, setState] = useState<ChangesState | null>(null);
  const [amendOpen, setAmendOpen] = useState(false);
  const [conflictPath, setConflictPath] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<{
    path: string;
    isRedo: boolean;
  } | null>(null);
  const [lastRestored, setLastRestored] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [diffMode, setDiffMode] = useState<DiffMode>("unified");
  const splitAvailable = useMemo(
    () => !!diff && splitDiff(diff.text) !== null,
    [diff],
  );
  const effectiveDiffMode = splitAvailable ? diffMode : "unified";
  const [loading, setLoading] = useState(true),
    [diffLoading, setDiffLoading] = useState(false),
    [writing, setWriting] = useState(false);
  const [error, setError] = useState(""),
    [diffError, setDiffError] = useState(""),
    [notice, setNotice] = useState("");
  const [summary, setSummary] = useState(""),
    [description, setDescription] = useState("");
  const inflight = useRef(false),
    request = useRef(0),
    diffRequest = useRef(0),
    selectAll = useRef<HTMLInputElement>(null);
  const bulkOrigin = useRef<Element | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const failure = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (writing || !bulkOrigin.current) return;
    const origin = bulkOrigin.current;
    bulkOrigin.current = null;
    if (
      active &&
      (document.activeElement === origin ||
        document.activeElement === document.body)
    )
      (error ? failure.current : feedback.current)?.focus();
  }, [writing, active, error, notice]);
  const staged = entriesIn(state?.entries ?? [], "staged");
  const unstaged = entriesIn(state?.entries ?? [], "unstaged");
  const eligibleUnstaged = unstaged.filter(
    (entry) => !entry.conflict && !entry.submodule,
  );
  const selectedCount = eligibleUnstaged.filter((entry) =>
    selectedPaths.has(entry.path),
  ).length;
  const blocked =
    !!state?.operation || !!state?.entries.some((e) => e.conflict);
  const canWrite = !!state?.trusted && !writing && !loading && !blocked;
  function accept(next: ChangesState | null) {
    if (next && !next.trusted) next = { ...next, entries: [] };
    setState(next);
    const available = new Set(
      entriesIn(next?.entries ?? [], "unstaged")
        .filter((entry) => !entry.conflict && !entry.submodule)
        .map((entry) => entry.path),
    );
    setSelectedPaths(
      (current) => new Set([...current].filter((path) => available.has(path))),
    );
    setSelected((current) => {
      if (
        current &&
        next &&
        entriesIn(next.entries, current.area).some(
          (e) => e.path === current.path,
        )
      )
        return current;
      const unstaged = entriesIn(next?.entries ?? [], "unstaged")[0];
      if (unstaged) return { path: unstaged.path, area: "unstaged" };
      const staged = entriesIn(next?.entries ?? [], "staged")[0];
      return staged ? { path: staged.path, area: "staged" } : null;
    });
  }
  async function reload() {
    const token = ++request.current;
    setLoading(true);
    setError("");
    try {
      const next = await invoke<ChangesState>("read_changes", { id: repoId });
      if (token === request.current) accept(next);
    } catch (e) {
      if (token === request.current) {
        setError(message(e));
        setState(null);
      }
    } finally {
      if (token === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    setSelectedPaths(new Set());
  }, [repoId]);
  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate =
        selectedCount > 0 && selectedCount < eligibleUnstaged.length;
  }, [selectedCount, eligibleUnstaged.length]);
  useEffect(() => {
    setConflictPath(null);
    if (active) void reload();
    else setState(null);
    return () => {
      request.current++;
      diffRequest.current++;
    };
  }, [repoId, active, refreshKey]);
  useEffect(() => {
    const token = ++diffRequest.current;
    setDiff(null);
    setDiffError("");
    if (!active || loading || !state?.trusted || !selected) {
      setDiffLoading(false);
      return;
    }
    setDiffLoading(true);
    invoke<FileDiff>("read_file_diff", {
      id: repoId,
      token: state.token,
      path: selected.path,
      area: selected.area,
    })
      .then((next) => {
        if (token === diffRequest.current) setDiff(next);
      })
      .catch((e) => {
        if (token === diffRequest.current) setDiffError(message(e));
      })
      .finally(() => {
        if (token === diffRequest.current) setDiffLoading(false);
      });
    return () => {
      diffRequest.current++;
    };
  }, [repoId, active, loading, state?.token, selected?.path, selected?.area]);
  async function execute(
    action: () => Promise<void>,
    failure?: Omit<OperationReport, "status" | "message">,
  ) {
    if (inflight.current) return;
    inflight.current = true;
    setWriting(true);
    onLock(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      const text = message(e);
      await reload();
      setError(text);
      if (failure)
        emitOperation({ ...failure, status: "error", message: text });
    } finally {
      inflight.current = false;
      setWriting(false);
      onLock(false);
    }
  }
  async function authorize() {
    const id = nextOperationId();
    await execute(
      async () => {
        accept(
          await invoke<ChangesState>("authorize_repository", { id: repoId }),
        );
        emitOperation({
          id,
          repoId,
          operation: "trust",
          status: "confirmed",
          title: "Repositorio autorizado",
          destination: "Confianza local",
          message:
            "Las operaciones locales quedaron habilitadas para esta ruta.",
        });
      },
      {
        id,
        repoId,
        operation: "trust",
        title: "Autorización no completada",
        destination: "Confianza local",
      },
    );
  }
  async function revokeAuthorization() {
    const id = nextOperationId();
    await execute(
      async () => {
        accept(
          await invoke<ChangesState>("revoke_repository_authorization", {
            id: repoId,
          }),
        );
        emitOperation({
          id,
          repoId,
          operation: "trust",
          status: "confirmed",
          title: "Autorización revocada",
          destination: "Confianza local",
          message:
            "Las operaciones de escritura quedaron bloqueadas para esta ruta.",
        });
      },
      {
        id,
        repoId,
        operation: "trust",
        title: "Revocación no completada",
        destination: "Confianza local",
      },
    );
  }
  async function apply(hunkIndex: number | null) {
    if (!state || !selected || !canWrite) return;
    const token = state.token,
      selection = selected;
    const id = nextOperationId();
    const operation = selection.area === "unstaged" ? "stage" : "unstage";
    const title =
      selection.area === "unstaged"
        ? "Preparando cambios"
        : "Quitando de preparados";
    emitOperation({
      id,
      repoId,
      operation,
      status: "progress",
      title,
      destination: hunkIndex === null ? "Archivo" : "Bloque",
      message: "Aplicando la revisión al índice…",
    });
    await execute(
      async () => {
        const result = await invoke<MutationResult>("change_file", {
          id: repoId,
          token,
          path: selection.path,
          area: selection.area,
          hunkIndex,
          previewToken: hunkIndex === null ? null : diff?.previewToken,
        });
        accept(result.changes);
        const text =
          result.warning ??
          (selection.area === "unstaged"
            ? "Cambios preparados. Tu archivo de trabajo se conserva."
            : "Cambios retirados de preparados. Tu archivo de trabajo se conserva.");
        setNotice(text);
        emitOperation({
          id,
          repoId,
          operation,
          status: result.warning ? "warning" : "confirmed",
          title:
            selection.area === "unstaged"
              ? "Cambios preparados"
              : "Cambios retirados de preparados",
          destination: hunkIndex === null ? "Archivo" : "Bloque",
          message: text,
          warning: result.warning ?? undefined,
        });
      },
      {
        id,
        repoId,
        operation,
        title: "No se modificó el índice",
        destination: hunkIndex === null ? "Archivo" : "Bloque",
      },
    );
  }
  async function prepareFiles(paths: string[]) {
    if (!state || !canWrite) return;
    const requested = new Set(paths);
    const reviewed = eligibleUnstaged
      .filter((entry) => requested.has(entry.path))
      .map((entry) => entry.path);
    if (!reviewed.length || reviewed.length !== requested.size) return;
    bulkOrigin.current = document.activeElement;
    const token = state.token;
    const id = nextOperationId();
    emitOperation({
      id,
      repoId,
      operation: "stage",
      status: "progress",
      title: "Preparando selección",
      destination: `${reviewed.length} archivos`,
      message: "Actualizando el índice en una sola operación…",
    });
    await execute(
      async () => {
        const result = await invoke<MutationResult>("change_files", {
          id: repoId,
          token,
          paths: reviewed,
        });
        accept(result.changes);
        const text =
          result.warning ??
          `${reviewed.length} ${reviewed.length === 1 ? "archivo preparado" : "archivos preparados"}. Tu árbol de trabajo se conserva.`;
        setNotice(text);
        emitOperation({
          id,
          repoId,
          operation: "stage",
          status: result.warning ? "warning" : "confirmed",
          title: "Selección preparada",
          destination: `${reviewed.length} archivos`,
          message: text,
          warning: result.warning ?? undefined,
        });
      },
      {
        id,
        repoId,
        operation: "stage",
        title: "No se preparó la selección",
        destination: `${reviewed.length} archivos`,
      },
    );
  }
  async function createCommit() {
    if (
      !state ||
      !canWrite ||
      !state.author ||
      !state.branch ||
      !staged.length ||
      !summary.trim()
    )
      return;
    const token = state.token;
    const branch = state.branch;
    const commitMessage =
      summary.trim() + (description.trim() ? `\n\n${description.trim()}` : "");
    const id = nextOperationId();
    emitOperation({
      id,
      repoId,
      operation: "commit",
      status: "progress",
      title: "Creando commit",
      destination: branch,
      message: "Ejecutando hooks y guardando el contenido preparado…",
    });
    await execute(
      async () => {
        const result = await invoke<MutationResult>("create_commit", {
          id: repoId,
          token,
          message: commitMessage,
        });
        accept(result.changes);
        if (result.commitHash) {
          setSummary("");
          setDescription("");
          let warning = result.warning ?? "";
          setNotice(
            `Commit creado: ${result.commitHash.slice(0, 8)}.${warning ? " " + warning : ""}`,
          );
          if ((await onCommitted()) === false) {
            warning = [
              warning,
              "El historial no pudo actualizarse; actualiza la vista sin repetir el commit.",
            ]
              .filter(Boolean)
              .join(" ");
            setNotice(
              (previous) =>
                `${previous} El historial no pudo actualizarse; revisa el aviso global.`,
            );
          }
          emitOperation({
            id,
            repoId,
            operation: "commit",
            status: warning ? "warning" : "confirmed",
            title: "Commit creado",
            destination: branch,
            message: `Commit ${result.commitHash.slice(0, 8)} confirmado localmente.`,
            warning: warning || undefined,
          });
        } else {
          const text =
            result.warning ?? "Actualiza el estado antes de continuar.";
          setNotice(text);
          emitOperation({
            id,
            repoId,
            operation: "commit",
            status: "uncertain",
            title: "Commit sin confirmar",
            destination: branch,
            message: text,
            warning: "Comprueba HEAD antes de repetir.",
          });
        }
      },
      {
        id,
        repoId,
        operation: "commit",
        title: "Commit no creado",
        destination: branch,
      },
    );
  }
  const selectedEntry = state?.entries.find((e) => e.path === selected?.path);
  return (
    <>
      {amendOpen && active && (
        <AmendDialog
          key={repoId}
          repoId={repoId}
          onClose={() => setAmendOpen(false)}
          onLock={(busy) => {
            inflight.current = busy;
            setWriting(busy);
            onLock(busy);
          }}
          onAmended={async (result) => {
            accept(result.changes);
            setNotice(
              `Último commit reemplazado: ${result.commitHash?.slice(0, 8) ?? "comprueba HEAD"}.`,
            );
            if ((await onCommitted()) === false)
              setNotice(
                (previous) =>
                  `${previous} No se pudo actualizar el historial; no repitas amend.`,
              );
          }}
        />
      )}
      {active && conflictPath && state?.trusted && (
        <ConflictDialog
          key={repoId + conflictPath}
          repoId={repoId}
          token={state.token}
          path={conflictPath}
          onClose={() => {
            setConflictPath(null);
            void reload();
          }}
          onLock={(busy) => {
            inflight.current = busy;
            setWriting(busy);
            onLock(busy);
          }}
        />
      )}
      <section
        id="changes-content"
        tabIndex={-1}
        hidden={!active}
        className="history-panel changes-panel"
        aria-label="Cambios locales"
      >
        <div className="panel-heading">
          <div>
            <div className="eyebrow">REPOSITORIO / CAMBIOS</div>
            <h1>Cambios</h1>
          </div>
          <button
            className="button"
            onClick={reload}
            disabled={writing || loading}
          >
            <ReloadIcon />
            Actualizar cambios
          </button>
        </div>
        {error && (
          <div
            className="banner error"
            role="alert"
            ref={failure}
            tabIndex={-1}
          >
            <ExclamationTriangleIcon />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div
            className="banner notice"
            role="status"
            ref={feedback}
            tabIndex={-1}
          >
            <span>{notice}</span>
            {lastRestored && (
              <button
                className="button"
                style={{ marginLeft: "1rem" }}
                onClick={() =>
                  setRestoreTarget({ path: lastRestored, isRedo: true })
                }
              >
                Rehacer cambios
              </button>
            )}
          </div>
        )}
        {blocked && (
          <div className="banner warning">
            Operación Git o conflictos en curso
            {state?.operation ? `: ${state.operation}` : ""}. Se permite
            inspección;{" "}
            {state?.operation === "MERGE_HEAD"
              ? "gestiona las resoluciones, la continuación o el aborto del merge desde Ramas."
              : state?.operation === "rebase-merge"
                ? "gestiona las resoluciones, la continuación o el aborto del rebase desde Ramas."
                : "termina esa operación desde Git antes de preparar o crear commits."}
            {onBranches &&
              (state?.operation === "MERGE_HEAD" ||
                state?.operation === "rebase-merge") && (
                <button
                  className="button"
                  onClick={onBranches}
                  disabled={writing}
                >
                  Ir a Ramas
                </button>
              )}
          </div>
        )}
        {state && !state.trusted && (
          <section
            className="trust-panel"
            aria-label="Habilitar operaciones locales"
          >
            <LockClosedIcon />
            <div>
              <h2>Habilitar operaciones en este repositorio</h2>
              <p>
                Inspeccionar cambios puede ejecutar filtros configurados en Git.
                Preparar cambia el index; crear un commit modifica el historial
                local. Git puede ejecutar los filtros, hooks y herramientas de
                firma configurados en este repositorio.
              </p>
              <button
                className="button"
                onClick={authorize}
                disabled={writing || loading}
              >
                Habilitar operaciones locales
              </button>
              <small>
                Se recordará para este repositorio en este equipo. Puedes
                revocar la autorización desde Cambios. No configura remotos ni
                publica cambios.
              </small>
            </div>
          </section>
        )}
        {state?.trusted && (
          <details className="authorization-details">
            <summary>Repositorio autorizado · Gestionar autorización</summary>
            <p>La autorización se recuerda sólo en este equipo.</p>
            <button
              className="button"
              onClick={revokeAuthorization}
              disabled={writing || loading}
            >
              Revocar autorización
            </button>
          </details>
        )}
        <div className="change-lists" aria-busy={loading}>
          {loading && !state ? (
            <div className="skeleton-list" aria-label="Leyendo cambios">
              <div className="skeleton-row" />
              <div className="skeleton-row" />
            </div>
          ) : !state?.trusted ? (
            <p className="change-empty">
              La inspección de archivos está pendiente de autorización. No se ha
              comprobado si el árbol está limpio.
            </p>
          ) : (
            [
              {
                area: "unstaged" as const,
                title: "Sin preparar",
                entries: unstaged,
              },
              { area: "staged" as const, title: "Preparados", entries: staged },
            ].map((group) => (
              <section
                className="change-group"
                key={group.area}
                aria-label={group.title}
              >
                <h2>
                  {group.area === "staged" ? <CheckIcon /> : <FileTextIcon />}
                  {group.title}
                  <span>{group.entries.length}</span>
                </h2>
                {group.area === "unstaged" && group.entries.length > 0 && (
                  <div
                    className="change-bulk-actions"
                    role="group"
                    aria-label="Preparación múltiple"
                  >
                    <label>
                      <input
                        ref={selectAll}
                        type="checkbox"
                        aria-label="Seleccionar todos los cambios sin preparar"
                        checked={
                          eligibleUnstaged.length > 0 &&
                          selectedCount === eligibleUnstaged.length
                        }
                        disabled={!canWrite || !eligibleUnstaged.length}
                        onChange={(event) =>
                          setSelectedPaths(
                            event.currentTarget.checked
                              ? new Set(
                                  eligibleUnstaged.map((entry) => entry.path),
                                )
                              : new Set(),
                          )
                        }
                      />
                      <span>Seleccionar todos</span>
                    </label>
                    <span
                      className="change-selection-count"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      {selectedCount} seleccionados
                    </span>
                    <div>
                      <button
                        type="button"
                        className="button"
                        disabled={!canWrite || selectedCount === 0}
                        onClick={() => void prepareFiles([...selectedPaths])}
                      >
                        <PlusIcon />
                        Preparar seleccionados
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={!canWrite || !eligibleUnstaged.length}
                        onClick={() =>
                          void prepareFiles(
                            eligibleUnstaged.map((entry) => entry.path),
                          )
                        }
                      >
                        <CheckIcon />
                        Preparar todos
                      </button>
                    </div>
                  </div>
                )}
                {group.entries.length ? (
                  group.entries.map((e) => {
                    const current =
                      selected?.path === e.path && selected.area === group.area;
                    return (
                      <div
                        className={`change-file-row ${current ? "selected" : ""}`}
                        key={`${group.area}:${e.path}`}
                      >
                        {group.area === "unstaged" && (
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar ${e.path}`}
                            checked={selectedPaths.has(e.path)}
                            disabled={!canWrite || e.conflict || e.submodule}
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              setSelectedPaths((paths) => {
                                const next = new Set(paths);
                                if (checked) next.add(e.path);
                                else next.delete(e.path);
                                return next;
                              });
                            }}
                          />
                        )}
                        <button
                          disabled={writing}
                          className="change-file"
                          aria-pressed={current}
                          onClick={() =>
                            setSelected({ path: e.path, area: group.area })
                          }
                          title={e.path}
                        >
                          <span
                            className={`file-status ${e.conflict ? "conflict" : ""}`}
                          >
                            {e.conflict
                              ? "!"
                              : e.untracked
                                ? "?"
                                : group.area === "staged"
                                  ? e.indexStatus
                                  : e.worktreeStatus}
                          </span>
                          <span className="change-path">{e.path}</span>
                          {e.submodule && <small>submódulo</small>}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="change-empty">
                    {group.area === "staged"
                      ? "Prepara archivos o bloques para incluirlos en el commit."
                      : state?.entries.length
                        ? "No hay cambios sin preparar."
                        : "Árbol de trabajo limpio."}
                  </p>
                )}
              </section>
            ))
          )}
        </div>
        <form
          className="commit-form"
          onSubmit={(e) => {
            e.preventDefault();
            void createCommit();
          }}
        >
          <div className="commit-form-title">
            <CommitLabel count={state?.trusted ? staged.length : null} />
            <span>
              {!state?.trusted
                ? "Rama pendiente de inspección"
                : (state.branch ?? "Sin rama activa")}
            </span>
          </div>
          <label htmlFor="commit-summary">Resumen del commit</label>
          <input
            id="commit-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Describe el cambio que vas a guardar"
            maxLength={500}
            disabled={writing}
          />
          <label htmlFor="commit-description">
            Descripción <span>(opcional)</span>
          </label>
          <textarea
            id="commit-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Contexto y motivo del cambio"
            maxLength={60000}
            rows={3}
            disabled={writing}
          />
          <div className="commit-author">
            <span>Autor configurado en Git</span>
            <strong>
              {!state?.trusted
                ? "Pendiente de inspección autorizada"
                : (state.author ?? "Falta configurar user.name / user.email")}
            </strong>
          </div>
          <p className="commit-scope">
            Sólo se incluirán los archivos y bloques de «Preparados». Los hooks
            de Git pueden validar o modificar el contenido.
          </p>
          <button
            type="submit"
            className="button primary"
            disabled={
              !canWrite ||
              !state?.author ||
              !state.branch ||
              !staged.length ||
              !summary.trim()
            }
          >
            <CheckIcon />
            {writing ? "Procesando…" : "Crear commit"}
          </button>
          <button
            type="button"
            className="button"
            disabled={
              !canWrite || !state?.head || !state.branch || !state.author
            }
            onClick={() => setAmendOpen(true)}
          >
            Reemplazar último commit…
          </button>
        </form>
      </section>
      <aside
        hidden={!active}
        className="inspector change-inspector"
        aria-label="Diff de cambios locales"
      >
        <div className="inspector-heading">
          <FileTextIcon />
          <h2>
            {selected?.area === "staged"
              ? "Preparados · HEAD → index"
              : "Sin preparar · index → archivo"}
          </h2>
        </div>
        {selected ? (
          <>
            <div className="change-diff-header">
              <code>{selected.path}</code>
              {selectedEntry?.conflict && (
                <button
                  className="button"
                  disabled={writing || loading || !state?.trusted}
                  onClick={() => setConflictPath(selected.path)}
                >
                  Consultar conflicto…
                </button>
              )}
              <button
                className="button"
                disabled={
                  !canWrite ||
                  !!selectedEntry?.conflict ||
                  !!selectedEntry?.submodule
                }
                onClick={() => apply(null)}
              >
                {selected.area === "staged" ? <MinusIcon /> : <PlusIcon />}
                {selected.area === "staged"
                  ? "Quitar archivo de preparados"
                  : "Preparar archivo"}
              </button>
              {selected.area === "unstaged" &&
                !selectedEntry?.conflict &&
                !selectedEntry?.submodule &&
                !selectedEntry?.untracked && (
                  <>
                    <button
                      className="button"
                      disabled={!canWrite}
                      onClick={() =>
                        setRestoreTarget({ path: selected.path, isRedo: false })
                      }
                    >
                      Restaurar archivo…
                    </button>
                    <button
                      className="button"
                      disabled={!canWrite}
                      onClick={() =>
                        setRestoreTarget({ path: selected.path, isRedo: true })
                      }
                    >
                      Rehacer…
                    </button>
                  </>
                )}
            </div>
            <div className="diff-body" aria-busy={diffLoading}>
              {diffLoading ? (
                <div
                  className="skeleton-list"
                  aria-label="Leyendo diff de cambios"
                >
                  <div className="skeleton-row" />
                  <div className="skeleton-row" />
                </div>
              ) : diffError ? (
                <div className="banner error" role="alert">
                  {diffError}
                </div>
              ) : diff ? (
                <>
                  <DiffModeControl
                    mode={effectiveDiffMode}
                    onChange={setDiffMode}
                    available={splitAvailable}
                  />
                  {diff.partialReason && (
                    <p className="partial-note">{diff.partialReason}</p>
                  )}
                  {diff.partialAllowed ? (
                    diff.hunks.map((hunk) => (
                      <section
                        className="diff-hunk"
                        key={hunk.index}
                        aria-label={`Bloque ${hunk.index + 1}`}
                      >
                        <div className="hunk-action">
                          <span>Bloque {hunk.index + 1}</span>
                          <button
                            className="button"
                            disabled={!canWrite}
                            onClick={() => apply(hunk.index)}
                          >
                            {selected.area === "staged"
                              ? "Quitar bloque de preparados"
                              : "Preparar bloque"}
                          </button>
                        </div>
                        <DiffContent
                          text={hunk.text}
                          mode={effectiveDiffMode}
                        />
                      </section>
                    ))
                  ) : (
                    <DiffContent
                      mode={effectiveDiffMode}
                      text={diff.text || "Sin diferencias de contenido."}
                    />
                  )}
                </>
              ) : null}
            </div>
          </>
        ) : (
          <div className="inspector-empty">
            <CheckIcon width="24" height="24" />
            <h3>Tu siguiente cambio empieza aquí.</h3>
            <p>
              Selecciona un archivo para inspeccionar lo preparado y lo que
              sigue fuera del commit.
            </p>
          </div>
        )}
      </aside>
      {restoreTarget && (
        <RestoreDialog
          repoId={repoId}
          path={restoreTarget.path}
          isRedo={restoreTarget.isRedo}
          onClose={() => setRestoreTarget(null)}
          onLock={onLock}
          onRestored={async (result) => {
            accept(result.changes);
            setNotice(
              restoreTarget.isRedo
                ? "Cambios rehechos exitosamente desde el respaldo."
                : "Archivo restaurado con éxito. Se guardó una copia de seguridad para rehacer."
            );
            setLastRestored(restoreTarget.isRedo ? null : restoreTarget.path);
            await reload();
          }}
        />
      )}
    </>
  );
}
function CommitLabel({ count }: { count: number | null }) {
  return (
    <h2>
      Nuevo commit{" "}
      <small>
        {count === null
          ? "Inspección pendiente"
          : `${count} ${count === 1 ? "archivo preparado" : "archivos preparados"}`}
      </small>
    </h2>
  );
}

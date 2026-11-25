import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AddWorktreeRequest,
  WorktreeItem,
  WorktreeOutcome,
  WorktreesState,
} from "./types";

export interface WorktreeDialogProps {
  repoId: string;
  repoPath: string;
  repoName: string;
  openTabPaths: string[];
  onClose: () => void;
  onLock: (busy: boolean) => void;
  onUpdated: () => Promise<unknown>;
  onOpenInTab: (path: string) => Promise<unknown>;
  onAuthorize?: () => void;
}

type AddMode = "newBranch" | "existingBranch" | "detached";

const messageOf = (err: unknown) =>
  typeof err === "object" && err && "message" in err
    ? String((err as { message: unknown }).message)
    : String(err);

function parentDirectory(path: string): string {
  const clean = path.replace(/[\\/]+$/, "");
  const sepIndex = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
  return sepIndex > 0 ? clean.slice(0, sepIndex) : clean;
}

function joinPath(parent: string, child: string): string {
  if (!parent) return child;
  const sep = parent.includes("\\") ? "\\" : "/";
  const trimmed = parent.replace(/[\\/]+$/, "");
  return `${trimmed}${sep}${child}`;
}

function slugifySegment(value: string): string {
  return value
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function WorktreeDialog({
  repoId,
  repoPath,
  repoName,
  openTabPaths,
  onClose,
  onLock,
  onUpdated,
  onOpenInTab,
  onAuthorize,
}: WorktreeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const flightRef = useRef(false);
  const requestRef = useRef(0);

  const [state, setState] = useState<WorktreesState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [lockTarget, setLockTarget] = useState<string | null>(null);
  const [lockReason, setLockReason] = useState("");
  const [removeTarget, setRemoveTarget] = useState<WorktreeItem | null>(null);
  const [forceRemove, setForceRemove] = useState(false);

  const [mode, setMode] = useState<AddMode>("newBranch");
  const [newBranch, setNewBranch] = useState("");
  const [baseRef, setBaseRef] = useState("");
  const [existingBranch, setExistingBranch] = useState("");
  const [startPoint, setStartPoint] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [pathEdited, setPathEdited] = useState(false);
  const [openAfterCreate, setOpenAfterCreate] = useState(true);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) {
      el.showModal?.();
    }
  }, []);

  async function reload() {
    const token = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const next = await invoke<WorktreesState>("read_worktrees", {
        id: repoId,
      });
      if (token !== requestRef.current) return;
      setState(next);
    } catch (reason) {
      if (token === requestRef.current) setError(messageOf(reason));
    } finally {
      if (token === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [repoId]);

  const checkedOutBranches = useMemo(() => {
    const set = new Set<string>();
    for (const wt of state?.worktrees ?? []) {
      if (wt.branch) set.add(wt.branch);
    }
    return set;
  }, [state]);

  const availableBranches = useMemo(
    () => (state?.branches ?? []).filter((b) => !checkedOutBranches.has(b)),
    [state, checkedOutBranches],
  );

  useEffect(() => {
    if (
      mode === "existingBranch" &&
      availableBranches.length > 0 &&
      !availableBranches.includes(existingBranch)
    ) {
      setExistingBranch(availableBranches[0]);
    }
  }, [mode, availableBranches, existingBranch]);

  useEffect(() => {
    if (pathEdited) return;
    const parent = parentDirectory(repoPath);
    const slug =
      mode === "newBranch"
        ? slugifySegment(newBranch)
        : mode === "existingBranch"
          ? slugifySegment(existingBranch)
          : "detached";
    setTargetPath(slug ? joinPath(parent, `${repoName}-${slug}`) : "");
  }, [mode, newBranch, existingBranch, pathEdited, repoPath, repoName]);

  const hasPrunable = useMemo(
    () => (state?.worktrees ?? []).some((wt) => wt.prunable),
    [state],
  );

  async function runMutation<T>(fn: () => Promise<T>): Promise<T | null> {
    if (flightRef.current) return null;
    flightRef.current = true;
    setBusy(true);
    onLock(true);
    setError("");
    setNotice("");
    try {
      return await fn();
    } catch (reason) {
      setError(messageOf(reason));
      return null;
    } finally {
      flightRef.current = false;
      setBusy(false);
      onLock(false);
    }
  }

  async function handlePickFolder() {
    if (busy) return;
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Elegir carpeta para worktree",
    });
    if (picked) {
      setTargetPath(picked);
      setPathEdited(true);
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!state?.trusted) return;
    let payload: AddWorktreeRequest;
    if (mode === "newBranch") {
      payload = {
        mode: "newBranch",
        path: targetPath.trim(),
        branch: newBranch.trim(),
        baseRef: baseRef.trim() || null,
      };
    } else if (mode === "existingBranch") {
      payload = {
        mode: "existingBranch",
        path: targetPath.trim(),
        branch: existingBranch,
      };
    } else {
      payload = {
        mode: "detached",
        path: targetPath.trim(),
        startPoint: startPoint.trim() || null,
      };
    }

    const outcome = await runMutation(() =>
      invoke<WorktreeOutcome>("add_worktree", {
        id: repoId,
        request: payload,
      }),
    );
    if (!outcome) return;
    setState(outcome.state);
    setNotice(outcome.message);
    setNewBranch("");
    setBaseRef("");
    setStartPoint("");
    setPathEdited(false);
    await onUpdated();
    if (openAfterCreate && outcome.createdPath) {
      await onOpenInTab(outcome.createdPath);
      onClose();
    }
  }

  async function handleLock(path: string) {
    const outcome = await runMutation(() =>
      invoke<WorktreeOutcome>("lock_worktree", {
        id: repoId,
        path,
        reason: lockReason.trim() || null,
      }),
    );
    if (!outcome) return;
    setState(outcome.state);
    setNotice(outcome.message);
    setLockTarget(null);
    setLockReason("");
    await onUpdated();
  }

  async function handleUnlock(path: string) {
    const outcome = await runMutation(() =>
      invoke<WorktreeOutcome>("unlock_worktree", {
        id: repoId,
        path,
      }),
    );
    if (!outcome) return;
    setState(outcome.state);
    setNotice(outcome.message);
    await onUpdated();
  }

  async function handleRemove() {
    if (!removeTarget) return;
    const outcome = await runMutation(() =>
      invoke<WorktreeOutcome>("remove_worktree", {
        id: repoId,
        path: removeTarget.path,
        force: forceRemove,
      }),
    );
    if (!outcome) return;
    setState(outcome.state);
    setNotice(outcome.message);
    setRemoveTarget(null);
    setForceRemove(false);
    await onUpdated();
  }

  async function handlePrune() {
    const outcome = await runMutation(() =>
      invoke<WorktreeOutcome>("prune_worktrees", { id: repoId }),
    );
    if (!outcome) return;
    setState(outcome.state);
    setNotice(outcome.message);
    await onUpdated();
  }

  async function handleOpenExternal(
    path: string,
    kind: "editor" | "terminal" | "explorer",
  ) {
    setError("");
    try {
      const outcome = await invoke<{ message: string }>(
        "open_worktree_external",
        {
          id: repoId,
          path,
          kind,
        },
      );
      setNotice(outcome.message);
    } catch (reason) {
      setError(messageOf(reason));
    }
  }

  const createDisabled =
    busy ||
    !state?.trusted ||
    !targetPath.trim() ||
    (mode === "newBranch" && !newBranch.trim()) ||
    (mode === "existingBranch" && !existingBranch);

  return (
    <dialog
      ref={dialogRef}
      className="operation-dialog worktree-dialog"
      aria-labelledby="worktree-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <h2 id="worktree-dialog-title">Worktrees de {repoName}</h2>
          <p className="worktree-dialog-sub">
            Trabaja en múltiples ramas en paralelo sin stashear cambios.
          </p>
        </div>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          disabled={busy}
          aria-label="Cerrar diálogo de worktrees"
        >
          ×
        </button>
      </header>

      <div className="worktree-dialog-body">
        {state && !state.trusted && (
          <div className="banner notice" role="status">
            <span>
              Este repositorio está en modo de solo lectura. Autorízalo para
              crear, bloquear o eliminar worktrees.
            </span>
            {onAuthorize && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  onAuthorize();
                  onClose();
                }}
              >
                Autorizar repositorio…
              </button>
            )}
          </div>
        )}

        {state?.restriction && (
          <div className="banner notice" role="status">
            <span>{state.restriction}</span>
          </div>
        )}

        {error && (
          <div className="banner error" role="alert">
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="banner notice" role="status">
            <span>{notice}</span>
          </div>
        )}

        <section
          className="worktree-section"
          aria-label="Worktrees activos del repositorio"
        >
          <div className="worktree-section-head">
            <h3>Worktrees activos ({state?.worktrees.length ?? 0})</h3>
            <div className="worktree-head-actions">
              <button
                type="button"
                className={`button ${hasPrunable ? "accent-outline" : ""}`}
                onClick={() => void handlePrune()}
                disabled={busy || !state?.trusted}
              >
                Limpiar obsoletos (Prune)
              </button>
            </div>
          </div>

          {loading ? (
            <p className="worktree-muted">Leyendo worktrees locales…</p>
          ) : (
            <ul className="worktree-list">
              {(state?.worktrees ?? []).map((wt) => {
                const branchLabel = wt.bare
                  ? "Repositorio bare"
                  : wt.branch
                    ? wt.branch
                    : wt.detached
                      ? "HEAD separado"
                      : "Sin rama";
                const isAlreadyOpen = openTabPaths.includes(wt.path);
                return (
                  <li key={wt.path} className="worktree-card">
                    <div className="worktree-card-info">
                      <div className="worktree-card-title">
                        <strong>{wt.name}</strong>
                        <span className="worktree-branch-pill">
                          {branchLabel}
                        </span>
                        {wt.main && (
                          <span className="worktree-badge main">Principal</span>
                        )}
                        {wt.current && (
                          <span className="worktree-badge current">Actual</span>
                        )}
                        {wt.locked && (
                          <span className="worktree-badge locked">
                            Bloqueado
                          </span>
                        )}
                        {wt.prunable && (
                          <span className="worktree-badge prunable">
                            Obsoleto
                          </span>
                        )}
                      </div>
                      <div className="worktree-card-path" title={wt.path}>
                        {wt.path}
                      </div>
                      {wt.lockReason && (
                        <div className="worktree-card-note">
                          Motivo de bloqueo: {wt.lockReason}
                        </div>
                      )}
                      {wt.prunableReason && (
                        <div className="worktree-card-note">
                          Estado obsoleto: {wt.prunableReason}
                        </div>
                      )}
                    </div>

                    <div className="worktree-card-actions">
                      <button
                        type="button"
                        className="button"
                        disabled={busy || wt.current || wt.prunable}
                        onClick={() => {
                          void onOpenInTab(wt.path).then(() => onClose());
                        }}
                      >
                        {isAlreadyOpen ? "Abierto" : "Abrir pestaña"}
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={busy || wt.prunable}
                        onClick={() =>
                          void handleOpenExternal(wt.path, "editor")
                        }
                      >
                        Editor
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={busy || wt.prunable}
                        onClick={() =>
                          void handleOpenExternal(wt.path, "terminal")
                        }
                      >
                        Terminal
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={busy || wt.prunable}
                        onClick={() =>
                          void handleOpenExternal(wt.path, "explorer")
                        }
                      >
                        Carpeta
                      </button>
                      {!wt.main && !wt.prunable && (
                        <>
                          {wt.locked ? (
                            <button
                              type="button"
                              className="button"
                              disabled={busy || !state?.trusted}
                              onClick={() => void handleUnlock(wt.path)}
                            >
                              Desbloquear
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="button"
                              disabled={busy || !state?.trusted}
                              onClick={() => {
                                setRemoveTarget(null);
                                setLockTarget(
                                  lockTarget === wt.path ? null : wt.path,
                                );
                                setLockReason("");
                              }}
                            >
                              Bloquear
                            </button>
                          )}
                          <button
                            type="button"
                            className="button danger"
                            disabled={
                              busy || !state?.trusted || wt.current || wt.locked
                            }
                            onClick={() => {
                              setLockTarget(null);
                              setForceRemove(false);
                              setRemoveTarget(wt);
                            }}
                          >
                            Eliminar…
                          </button>
                        </>
                      )}
                    </div>

                    {lockTarget === wt.path && (
                      <div className="worktree-inline-box">
                        <label>
                          Motivo del bloqueo (opcional)
                          <input
                            type="text"
                            value={lockReason}
                            onChange={(e) => setLockReason(e.target.value)}
                            placeholder="Ej. Disco externo o revisión en curso"
                          />
                        </label>
                        <div className="worktree-inline-actions">
                          <button
                            type="button"
                            className="button primary"
                            disabled={busy}
                            onClick={() => void handleLock(wt.path)}
                          >
                            Confirmar bloqueo
                          </button>
                          <button
                            type="button"
                            className="button"
                            disabled={busy}
                            onClick={() => setLockTarget(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {removeTarget && (
            <div
              className="worktree-confirm-remove"
              role="region"
              aria-label="Confirmar eliminación de worktree"
            >
              <strong>Eliminar worktree {removeTarget.name}</strong>
              <p>
                Se eliminará la carpeta <code>{removeTarget.path}</code> (
                {removeTarget.branch ?? "HEAD separado"}).
              </p>
              <label className="worktree-checkbox">
                <input
                  type="checkbox"
                  checked={forceRemove}
                  onChange={(e) => setForceRemove(e.target.checked)}
                />
                Forzar eliminación si hay cambios locales sin guardar
              </label>
              <div className="worktree-inline-actions">
                <button
                  type="button"
                  className="button danger"
                  disabled={busy}
                  onClick={() => void handleRemove()}
                >
                  Confirmar eliminación
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    setRemoveTarget(null);
                    setForceRemove(false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="worktree-section" aria-label="Crear nuevo worktree">
          <h3>Crear nuevo worktree</h3>
          <form
            className="worktree-form"
            onSubmit={(e) => void handleCreate(e)}
          >
            <div
              className="worktree-mode-switch"
              role="radiogroup"
              aria-label="Modo de origen del worktree"
            >
              {(
                [
                  ["newBranch", "Nueva rama"],
                  ["existingBranch", "Rama existente"],
                  ["detached", "HEAD separado"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  className={`button ${mode === value ? "active" : ""}`}
                  disabled={busy}
                  onClick={() => setMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "newBranch" && (
              <div className="worktree-form-row">
                <label>
                  Nombre de la nueva rama
                  <input
                    type="text"
                    value={newBranch}
                    onChange={(e) => setNewBranch(e.target.value)}
                    placeholder="feat/mi-rama"
                    disabled={busy || !state?.trusted}
                  />
                </label>
                <label>
                  Referencia base (opcional)
                  <input
                    type="text"
                    value={baseRef}
                    onChange={(e) => setBaseRef(e.target.value)}
                    placeholder="HEAD o rama base"
                    disabled={busy || !state?.trusted}
                  />
                </label>
              </div>
            )}

            {mode === "existingBranch" && (
              <label>
                Rama existente disponible
                <select
                  value={existingBranch}
                  onChange={(e) => setExistingBranch(e.target.value)}
                  disabled={
                    busy || !state?.trusted || availableBranches.length === 0
                  }
                >
                  {availableBranches.length === 0 ? (
                    <option value="">
                      Todas las ramas locales ya están abiertas en worktrees
                    </option>
                  ) : (
                    availableBranches.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))
                  )}
                </select>
              </label>
            )}

            {mode === "detached" && (
              <label>
                Commit o referencia inicial (opcional)
                <input
                  type="text"
                  value={startPoint}
                  onChange={(e) => setStartPoint(e.target.value)}
                  placeholder="HEAD"
                  disabled={busy || !state?.trusted}
                />
              </label>
            )}

            <div className="worktree-path-row">
              <label>
                Carpeta de destino
                <input
                  type="text"
                  value={targetPath}
                  onChange={(e) => {
                    setTargetPath(e.target.value);
                    setPathEdited(true);
                  }}
                  placeholder={joinPath(
                    parentDirectory(repoPath),
                    `${repoName}-worktree`,
                  )}
                  disabled={busy || !state?.trusted}
                />
              </label>
              <button
                type="button"
                className="button"
                disabled={busy || !state?.trusted}
                onClick={() => void handlePickFolder()}
              >
                Elegir carpeta…
              </button>
            </div>

            <label className="worktree-checkbox">
              <input
                type="checkbox"
                checked={openAfterCreate}
                onChange={(e) => setOpenAfterCreate(e.target.checked)}
                disabled={busy}
              />
              Abrir en nueva pestaña al crear
            </label>

            <div className="worktree-form-footer">
              <button
                type="submit"
                className="button primary"
                disabled={createDisabled}
              >
                Crear worktree
              </button>
            </div>
          </form>
        </section>
      </div>
    </dialog>
  );
}

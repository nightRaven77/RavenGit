import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MergeEdit, MergeState } from "./types";

type Props = {
  repoId: string;
  busy: boolean;
  onEdit: (token: string, edit: MergeEdit) => Promise<void>;
};

export default function MergeRecovery({ repoId, busy, onEdit }: Props) {
  const [state, setState] = useState<MergeState | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Integrar ramas");
  const [confirmAbort, setConfirmAbort] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setState(null);
    setError("");
    setConfirmAbort(false);
    void invoke<MergeState | null>("read_merge", { id: repoId }).then(
      (next) => {
        if (!current) return;
        setState(next);
        if (!next)
          setError("El merge ya no está en curso. Actualiza las ramas.");
      },
      (error: unknown) => {
        if (current)
          setError(
            typeof error === "object" && error && "message" in error
              ? String(error.message)
              : String(error),
          );
      },
    );
    return () => {
      current = false;
    };
  }, [repoId, revision]);
  const allowed = !!state && !state.restriction && !busy;
  return (
    <section className="remote-form" aria-label="Merge en curso">
      <h2>Merge en curso</h2>
      <p>La operación se conserva en Git, incluso al cerrar RavenGit.</p>
      <button
        className="button"
        disabled={busy}
        onClick={() => setRevision((previous) => previous + 1)}
      >
        Actualizar merge
      </button>
      {error && <p role="alert">{error}</p>}
      {!state && !error && <p role="status">Leyendo el merge…</p>}
      {state && (
        <>
          <p>
            Destino: <strong>{state.branch ?? "HEAD separado"}</strong> ·
            Origen: <code>{state.sourceHash.slice(0, 8)}</code>
          </p>
          {state.restriction && <p role="alert">{state.restriction}</p>}
          <p>
            Edita los archivos en tu editor externo, elimina los marcadores y
            guarda la resolución. Después pulsa Actualizar merge y marca cada
            archivo como resuelto. Una eliminación se prepara como tal. No se
            elige una versión automáticamente.
          </p>
          <ul className="branch-list" aria-label="Archivos en conflicto">
            {state.conflicts.map((path) => (
              <li key={path} className="remote-item branch-list-item">
                <code>{path}</code>
                <button
                  className="button"
                  disabled={!allowed}
                  onClick={() =>
                    void onEdit(state.token, { kind: "resolve", path })
                  }
                >
                  Marcar resuelto: {path}
                </button>
              </li>
            ))}
          </ul>
          {!state.conflicts.length && (
            <p>No quedan archivos sin resolver en el índice.</p>
          )}
          <p>
            Continuar crea un commit con todos los cambios preparados del merge.
            No se permiten cambios sin preparar ni archivos nuevos sin
            seguimiento; revisa los diffs en la vista Cambios antes de
            confirmar.
          </p>
          <ul aria-label="Archivos preparados para el merge">
            {state.staged.map((path) => (
              <li key={path}>
                <code>{path}</code>
              </li>
            ))}
          </ul>
          <label>
            Mensaje del commit de merge
            <input
              value={message}
              maxLength={65536}
              disabled={busy}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <button
            className="button primary"
            disabled={!allowed || !state.canContinue || !message.trim()}
            onClick={() =>
              void onEdit(state.token, { kind: "continue", message })
            }
          >
            Continuar merge
          </button>
          <label className="push-checkbox">
            <input
              type="checkbox"
              checked={confirmAbort}
              disabled={busy}
              onChange={(event) => setConfirmAbort(event.target.checked)}
            />{" "}
            Entiendo que abortar descarta las resoluciones y puede perder
            ediciones realizadas durante este merge. He guardado aparte lo que
            necesito conservar.
          </label>
          <button
            className="button"
            disabled={!allowed || !confirmAbort}
            onClick={() => void onEdit(state.token, { kind: "abort" })}
          >
            Abortar merge
          </button>
        </>
      )}
    </section>
  );
}

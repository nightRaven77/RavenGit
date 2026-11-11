import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RebaseEdit, RebaseState } from "./types";

export default function RebaseRecovery({
  repoId,
  busy,
  onEdit,
}: {
  repoId: string;
  busy: boolean;
  onEdit: (token: string, edit: RebaseEdit) => Promise<void>;
}) {
  const [state, setState] = useState<RebaseState | null>(null);
  const [error, setError] = useState("");
  const [abort, setAbort] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setState(null);
    setError("");
    setAbort(false);
    void invoke<RebaseState | null>("read_rebase", { id: repoId }).then(
      (next) => {
        if (current) {
          setState(next);
          if (!next) setError("No hay rebase activo. Actualiza las ramas.");
        }
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
  if (state && !state.active)
    return (
      <section
        className="remote-form"
        aria-label="Inicio de rebase no completado"
      >
        <h2>Inicio de rebase no completado</h2>
        <p>
          Git no tiene un rebase activo. La rama <strong>{state.branch}</strong>{" "}
          sigue en <code>{state.original}</code> y su árbol está limpio.
        </p>
        {state.backup ? (
          <p>
            Respaldo confirmado: <code>{state.backup}</code>. Retirar el registro
            permite revisar otro intento; no vuelve a ejecutar Git ni elimina el
            respaldo.
          </p>
        ) : (
          <p>
            No se confirmó un respaldo. Retirar el registro sólo es posible
            porque la rama original sigue intacta y no hay una operación activa.
          </p>
        )}
        <button
          className="button"
          disabled={busy}
          onClick={() => setRevision((v) => v + 1)}
        >
          Actualizar rebase
        </button>
        <label>
          <input
            type="checkbox"
            checked={abort}
            disabled={busy}
            onChange={(event) => setAbort(event.target.checked)}
          />{" "}
          He revisado el inicio rechazado y quiero retirar sólo su registro de
          RavenGit.
        </label>
        <button
          className="button"
          disabled={busy || !abort}
          onClick={() => void onEdit(state.token, { kind: "clearRecord" })}
        >
          Retirar registro de inicio rechazado
        </button>
      </section>
    );
  return (
    <section className="remote-form" aria-label="Rebase en curso">
      <h2>Rebase en curso</h2>
      <button
        className="button"
        disabled={busy}
        onClick={() => setRevision((v) => v + 1)}
      >
        Actualizar rebase
      </button>
      {error && <p role="alert">{error}</p>}
      {!state && !error && <p role="status">Leyendo el rebase…</p>}
      {state && (
        <>
          <p>
            Rama: <strong>{state.branch}</strong> · Original:{" "}
            <code>{state.original}</code> · Base: <code>{state.base}</code>
          </p>
          <p>
            Respaldo: <code>{state.backup}</code>. El estado de Git permite
            recuperar esta operación tras reiniciar RavenGit.
          </p>
          <p>
            Edita los archivos en tu editor, elimina los marcadores, guarda y
            pulsa Actualizar rebase antes de marcar cada resolución. Revisa los
            diffs en Cambios. No se elige ninguna versión automáticamente.
          </p>
          <ul aria-label="Conflictos de rebase">
            {state.conflicts.map((path) => (
              <li key={path}>
                <code>{path}</code>{" "}
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void onEdit(state.token, { kind: "resolve", path })
                  }
                >
                  Marcar resuelto: {path}
                </button>
              </li>
            ))}
          </ul>
          <p>
            Continuar reproduce los siguientes commits y puede detenerse otra
            vez. Los commits que se vuelven vacíos requieren revisión desde Git
            o abortar; no se omiten automáticamente.
          </p>
          <button
            className="button primary"
            disabled={busy || !state.canContinue}
            onClick={() => void onEdit(state.token, { kind: "continue" })}
          >
            Continuar rebase
          </button>
          <label>
            <input
              type="checkbox"
              checked={abort}
              disabled={busy}
              onChange={(e) => setAbort(e.target.checked)}
            />{" "}
            He guardado aparte mis ediciones: abortar puede descartar
            resoluciones y cambios hechos durante el rebase.
          </label>
          <button
            className="button"
            disabled={busy || !abort}
            onClick={() => void onEdit(state.token, { kind: "abort" })}
          >
            Abortar rebase
          </button>
        </>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { OperationKey } from "./operations";

type Status = "confirmed" | "unchanged" | "warning" | "uncertain" | "error";
type Entry = {
  id: string;
  occurredAt: number;
  operation: OperationKey;
  status: Status;
  repository: string | null;
};
type Activity = { token: string; events: Entry[] };

const operations: Record<OperationKey, string> = {
  initialize: "Inicializar repositorio",
  clone: "Clonar repositorio",
  stage: "Preparar cambios",
  unstage: "Quitar de preparados",
  commit: "Crear commit",
  amend: "Reemplazar commit",
  branch: "Gestionar rama",
  remote: "Gestionar remoto",
  fetch: "Fetch",
  pull: "Pull",
  push: "Push",
  tag: "Crear etiqueta",
  publishTag: "Publicar etiqueta",
  stash: "Stash",
  merge: "Merge",
  rebase: "Rebase",
  replay: "Cherry-pick/Revert",
  conflict: "Resolver conflicto",
  restoreConflict: "Recuperar respaldo",
  trust: "Autorizar repositorio",
  sshAccounts: "Perfiles SSH",
};

const statuses: Record<Status, string> = {
  confirmed: "Completada",
  unchanged: "Sin cambios",
  warning: "Completada con advertencia",
  uncertain: "Resultado incierto",
  error: "No completada",
};

function message(error: unknown) {
  return typeof error === "object" && error && "message" in error
    ? String(error.message)
    : "No se pudo completar la operación de actividad.";
}

function localDate() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function ActivityDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  async function load() {
    setBusy(true);
    setError("");
    try {
      setActivity(await invoke<Activity>("read_activity"));
    } catch (reason) {
      setActivity(null);
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    void load();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);

  function close() {
    if (busy) return;
    dialog.current?.close();
    onClose();
  }

  async function exportDiagnostic() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const destination = await save({
        title: "Exportar diagnóstico de RavenGit",
        defaultPath: `ravengit-diagnostico-${localDate()}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!destination) return;
      const outcome = await invoke<{ message: string; eventCount: number }>(
        "export_diagnostics",
        { destination },
      );
      setNotice(`${outcome.message} ${outcome.eventCount} eventos incluidos.`);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!activity || !confirmed) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setActivity(
        await invoke<Activity>("clear_activity", {
          token: activity.token,
          confirmed: true,
        }),
      );
      setConfirmed(false);
      setNotice("Actividad local borrada. No se modificó ningún repositorio.");
    } catch (reason) {
      setError(message(reason));
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="operation-dialog activity-dialog"
      aria-labelledby="activity-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <div>
          <h2 id="activity-title">Actividad y diagnóstico</h2>
          <p>Resultados locales recientes, sin salida Git ni contenido.</p>
        </div>
        <button className="button" disabled={busy} onClick={close}>
          Cerrar
        </button>
      </header>
      <p>
        Se guardan como máximo 500 resultados: fecha, operación, estado y nombre
        de carpeta. No se guardan rutas, URLs, credenciales, ramas, mensajes,
        diffs ni stderr. La exportación reemplaza los nombres por
        identificadores neutros.
      </p>
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="banner notice" role="status">
          {notice}
        </div>
      )}
      <div className="library-entry-actions">
        <button className="button" disabled={busy} onClick={() => void load()}>
          Actualizar
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void exportDiagnostic()}
        >
          Exportar diagnóstico…
        </button>
      </div>
      <section aria-label="Actividad reciente" aria-busy={busy}>
        <h3>Actividad reciente · {activity?.events.length ?? 0}</h3>
        {!activity && busy ? (
          <p role="status">Leyendo actividad…</p>
        ) : activity?.events.length ? (
          <ol className="activity-list">
            {activity.events.map((entry) => (
              <li key={entry.id}>
                <div>
                  <strong>{operations[entry.operation]}</strong>
                  <span className={`activity-status ${entry.status}`}>
                    {statuses[entry.status]}
                  </span>
                </div>
                <p>
                  {entry.repository ?? "Sin repositorio asociado"} ·{" "}
                  <time dateTime={new Date(entry.occurredAt).toISOString()}>
                    {new Date(entry.occurredAt).toLocaleString("es-MX")}
                  </time>
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p>No hay resultados registrados todavía.</p>
        )}
      </section>
      {!!activity?.events.length && (
        <section className="activity-clear" aria-label="Borrar actividad">
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />{" "}
            Entiendo que se borrará sólo este registro local; los repositorios y
            respaldos se conservan.
          </label>
          <button
            className="button danger"
            disabled={busy || !confirmed}
            onClick={() => void clear()}
          >
            Borrar actividad local
          </button>
        </section>
      )}
    </dialog>
  );
}

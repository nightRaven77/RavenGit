import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitOperation, nextOperationId } from "./operations";
type Entry = {
  id: string;
  path: string | null;
  restriction: string | null;
  kind?: "saved" | "recovery" | "invalid";
};
type Review = {
  token: string;
  id: string;
  path: string;
  original: string;
  current: string;
  currentChanged: boolean;
  head: string;
};
const message = (e: unknown) =>
  typeof e === "object" && e && "message" in e
    ? String(e.message)
    : "No se pudo consultar el respaldo. Actualiza antes de continuar.";
function backupDate(id: string) {
  const match = /^ravengit-conflict-\d+-(\d{1,25})-\d+$/.exec(id);
  if (!match) return "Fecha no disponible";
  const date = new Date(Number(BigInt(match[1]) / 1_000_000n));
  if (!Number.isFinite(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(date);
}
function navigateContent(event: KeyboardEvent<HTMLPreElement>) {
  if (event.altKey || event.shiftKey) return;
  const start =
    event.key === "Home" || (event.metaKey && event.key === "ArrowUp");
  const end =
    event.key === "End" || (event.metaKey && event.key === "ArrowDown");
  if (!start && !end) return;
  event.preventDefault();
  event.currentTarget.scrollTop = start ? 0 : event.currentTarget.scrollHeight;
}
export default function ConflictRestoreDialog({
  repoId,
  onClose,
  onLock,
  onUpdated,
}: {
  repoId: string;
  onClose: () => void;
  onLock: (value: boolean) => void;
  onUpdated: () => Promise<boolean>;
}) {
  const element = useRef<HTMLDialogElement>(null),
    request = useRef(0),
    flight = useRef(false);
  const [entries, setEntries] = useState<Entry[]>([]),
    [selected, setSelected] = useState("");
  const [review, setReview] = useState<Review | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [trusted, setTrusted] = useState<boolean | null>(null);
  function invalidate() {
    setReview(null);
    setConfirmed(false);
  }
  async function load() {
    const seq = ++request.current;
    setLoading(true);
    setTrusted(null);
    invalidate();
    try {
      const response = await invoke<{ trusted: boolean; entries: Entry[] }>(
        "read_conflict_backups",
        {
          id: repoId,
        },
      );
      if (seq === request.current) {
        const next = response.entries;
        setTrusted(response.trusted);
        setEntries(next);
        setSelected((old) =>
          next.some((e) => e.id === old)
            ? old
            : (next.find((e) => !e.restriction)?.id ?? next[0]?.id ?? ""),
        );
      }
    } catch (e) {
      if (seq === request.current) {
        setEntries([]);
        setError(message(e));
      }
    } finally {
      if (seq === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    const dialog = element.current,
      previous = document.activeElement;
    dialog?.showModal();
    void load();
    return () => {
      request.current++;
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [repoId]);
  function close() {
    if (flight.current) return;
    request.current++;
    element.current?.close();
    onClose();
  }
  async function run(kind: "refresh" | "review" | "restore" | "authorize") {
    if (flight.current || loading) return;
    flight.current = true;
    setBusy(true);
    onLock(true);
    setError("");
    setNotice("");
    const token = review?.token;
    const operationId =
      kind === "restore" || kind === "authorize" ? nextOperationId() : "";
    if (kind === "restore" || kind === "authorize")
      emitOperation({
        id: operationId,
        operation: kind === "restore" ? "restoreConflict" : "trust",
        status: "progress",
        title:
          kind === "restore"
            ? "Restaurando respaldo…"
            : "Autorizando repositorio…",
        message: "RavenGit espera la confirmación local.",
        repoId,
      });
    invalidate();
    try {
      if (kind === "authorize") {
        await invoke("authorize_repository", { id: repoId });
        emitOperation({
          id: operationId,
          operation: "trust",
          status: "confirmed",
          title: "Repositorio autorizado",
          message: "La confianza local quedó confirmada.",
          repoId,
        });
        await load();
      } else if (kind === "refresh") await load();
      else if (kind === "review")
        setReview(
          await invoke<Review>("preview_conflict_restore", {
            id: repoId,
            backup: selected,
          }),
        );
      else {
        const result = await invoke<{ message: string; backup: string }>(
          "restore_conflict_backup",
          { id: repoId, token },
        );
        setNotice(
          `${result.message} Copia del archivo anterior: ${result.backup}`,
        );
        emitOperation({
          id: operationId,
          operation: "restoreConflict",
          status: "confirmed",
          title: "Respaldo restaurado",
          message: result.message,
          repoId,
        });
        try {
          if (!(await onUpdated())) throw new Error();
        } catch {
          setNotice(
            (previous) =>
              `${previous} No se pudo refrescar la vista; no repitas la restauración para actualizarla.`,
          );
        }
        await load();
      }
    } catch (e) {
      const detail = message(e);
      setError(detail);
      if (kind === "restore" || kind === "authorize")
        emitOperation({
          id: operationId,
          operation: kind === "restore" ? "restoreConflict" : "trust",
          status: "error",
          title:
            kind === "restore"
              ? "Restauración no confirmada"
              : "Autorización no confirmada",
          message: detail,
          repoId,
        });
      if (kind === "restore") {
        try {
          await onUpdated();
        } catch {
          /* Keep the mutation error visible. */
        }
        await load();
      }
    } finally {
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }
  const entry = entries.find((e) => e.id === selected),
    disabled = loading || busy;
  return (
    <dialog
      ref={element}
      className="operation-dialog restore-dialog"
      aria-labelledby="restore-title"
      aria-busy={busy || loading}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="restore-title">Recuperar respaldo de conflicto</h2>
        <button className="button" disabled={busy} onClick={close}>
          Cerrar
        </button>
      </header>
      <p>
        Restaura un archivo de trabajo durante el mismo merge pendiente. El
        índice se conserva, incluso si ya preparaste la resolución.
      </p>
      {error && (
        <p role="alert" className="banner error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">Leyendo respaldos…</p>}
      {!loading && trusted === true && entries.length === 0 && (
        <p>No hay respaldos disponibles para consultar en este repositorio.</p>
      )}
      {!loading && trusted === false && (
        <button
          className="button"
          disabled={busy}
          onClick={() => void run("authorize")}
        >
          Autorizar y consultar
        </button>
      )}
      {entries.length > 0 && (
        <label>
          Respaldo guardado
          <select
            value={selected}
            disabled={disabled}
            onChange={(event) => {
              setSelected(event.target.value);
              invalidate();
            }}
          >
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.path ?? "Respaldo no disponible"} ·{" "}
                {e.kind === "invalid"
                  ? "Registro no válido"
                  : e.kind === "recovery"
                    ? "Copia previa a restauración"
                    : "Guardado de resolución"}{" "}
                · {backupDate(e.id)}
              </option>
            ))}
          </select>
        </label>
      )}
      {entry && (
        <p>
          Identificador: <code>{entry.id}</code>
        </p>
      )}
      {entry?.restriction && <p role="alert">{entry.restriction}</p>}
      <div className="commit-actions">
        <button
          className="button"
          disabled={disabled}
          onClick={() => void run("refresh")}
        >
          Actualizar
        </button>
        <button
          className="button"
          disabled={disabled || !selected || !!entry?.restriction}
          onClick={() => void run("review")}
        >
          Revisar restauración
        </button>
      </div>
      {review && (
        <section aria-label="Revisión de restauración">
          <h3>{review.path}</h3>
          <p>
            HEAD <code>{review.head}</code>
          </p>
          {review.currentChanged && (
            <p className="banner warning" role="alert">
              El archivo cambió después del guardado original. Su contenido
              actual se conservará en un respaldo nuevo antes del reemplazo.
            </p>
          )}
          <p id="restore-reading-help">
            Con el contenido enfocado, Inicio y Fin llevan al principio y al
            final del contenido.
          </p>
          <div className="conflict-versions">
            <section>
              <h3>Archivo actual</h3>
              <pre
                tabIndex={0}
                aria-label="Archivo actual"
                aria-describedby="restore-reading-help"
                onKeyDown={navigateContent}
              >
                {review.current || "(Archivo vacío)"}
              </pre>
            </section>
            <section>
              <h3>Contenido que se restaurará</h3>
              <pre
                tabIndex={0}
                aria-label="Contenido que se restaurará"
                aria-describedby="restore-reading-help"
                onKeyDown={navigateContent}
              >
                {review.original || "(Archivo vacío)"}
              </pre>
            </section>
          </div>
          <p>
            Se reemplazará sólo este archivo. Puede volver a contener marcadores
            de conflicto. No se quitará del índice lo que ya estaba preparado,
            no se creará un commit ni se abortará el merge.
          </p>
          <label>
            <input
              type="checkbox"
              disabled={disabled}
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />{" "}
            Revisé ambos contenidos y autorizo restaurar el archivo, conservando
            el índice y una copia del contenido actual.
          </label>
          <button
            className="button primary"
            disabled={disabled || !confirmed}
            onClick={() => void run("restore")}
          >
            Restaurar archivo con respaldo
          </button>
        </section>
      )}
      {busy && (
        <p role="status">
          Comprobando el respaldo y el estado del repositorio…
        </p>
      )}
    </dialog>
  );
}

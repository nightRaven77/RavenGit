import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import SshAccounts from "./SshAccountsPanel";
import { withSshHost } from "./sshAccounts";
import type { RemoteInfo, RemotesState, RemoteOperationResult } from "./types";
import { emitOperation, nextOperationId } from "./operations";

type Props = {
  active: boolean;
  repoId: string;
  onLock: (value: boolean) => void;
  onUpdated: () => Promise<boolean>;
};
type Draft = {
  kind: "add" | "update";
  name: string;
  url: string;
  pushUrl: string;
  token: string;
};
const message = (e: unknown) =>
  typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
export default function RemotesPanel({
  active,
  repoId,
  onLock,
  onUpdated,
}: Props) {
  const [state, setState] = useState<RemotesState | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<"fetch" | "remove" | "save" | null>(
    null,
  );
  const [fetched, setFetched] = useState<
    Record<string, { url: string; time: number }>
  >({});
  const flight = useRef(false),
    request = useRef(0);
  const remote =
    state?.remotes.find((r) => r.name === selected) ?? state?.remotes[0];
  const allowed = !!state?.trusted && !busy && !loading;
  function accept(next: RemotesState | null) {
    setState(next);
    setSelected((current) =>
      next?.remotes.some((r) => r.name === current)
        ? current
        : (next?.remotes[0]?.name ?? ""),
    );
  }
  async function reload() {
    const seq = ++request.current;
    setLoading(true);
    try {
      const next = await invoke<RemotesState>("read_remotes", { id: repoId });
      if (seq === request.current) accept(next);
    } catch (e) {
      if (seq === request.current) {
        setState(null);
        setError(message(e));
      }
    } finally {
      if (seq === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (active) void reload();
    return () => {
      request.current++;
    };
  }, [repoId, active]);
  async function perform(
    command: string,
    args: Record<string, unknown>,
    fetchName?: string,
  ) {
    if (flight.current) return;
    flight.current = true;
    const operationId = nextOperationId();
    const operation =
      command === "authorize_remote_operations"
        ? "trust"
        : fetchName
          ? "fetch"
          : "remote";
    const destination = fetchName ?? remote?.name ?? draft?.name ?? "Remotos";
    const checkingAccess = command === "contact_remote" && !fetchName;
    setBusy(true);
    onLock(true);
    setError("");
    setNotice("");
    emitOperation({
      id: operationId,
      repoId,
      operation,
      status: "progress",
      title: checkingAccess
        ? "Comprobando acceso de lectura"
        : operation === "fetch"
          ? "Fetch en curso"
          : operation === "remote"
            ? "Actualizando remoto"
            : "Autorizando repositorio",
      destination,
      message: checkingAccess
        ? "Consultando el destino revisado sin actualizar referencias…"
        : operation === "fetch"
          ? "Contactando el destino explícito…"
          : "Aplicando la operación revisada…",
    });
    try {
      if (command === "authorize_remote_operations") {
        accept(await invoke<RemotesState>(command, { id: repoId }));
        emitOperation({
          id: operationId,
          repoId,
          operation,
          status: "confirmed",
          title: "Repositorio autorizado",
          destination,
          message:
            "Las operaciones de red quedaron habilitadas para esta ruta.",
        });
        return;
      }
      const result = await invoke<RemoteOperationResult>(command, {
        id: repoId,
        ...args,
      });
      accept(result.state);
      setNotice([result.message, result.warning].filter(Boolean).join(" "));
      if (command === "edit_remote") {
        setFetched({});
        setDraft(null);
      }
      if (fetchName && result.completedAt && remote)
        setFetched((current) => ({
          ...current,
          [fetchName]: {
            url: remote.fetchUrls.join("\n"),
            time: result.completedAt!,
          },
        }));
      let refreshWarning = "";
      if (
        (command === "edit_remote" || fetchName) &&
        (await onUpdated()) === false
      ) {
        refreshWarning =
          "El historial no pudo actualizarse; actualiza la vista sin repetir la operación.";
        setNotice(
          (previous) =>
            `${previous} El historial no pudo actualizarse; revisa el aviso global.`,
        );
      }
      const warning = [result.warning, refreshWarning]
        .filter(Boolean)
        .join(" ");
      emitOperation({
        id: operationId,
        repoId,
        operation,
        status: warning ? "warning" : "confirmed",
        title: checkingAccess
          ? "Acceso de lectura comprobado"
          : operation === "fetch"
            ? "Fetch completado"
            : "Remoto actualizado",
        destination,
        message: result.message,
        warning: warning || undefined,
      });
    } catch (e) {
      const text = message(e);
      setError(text);
      emitOperation({
        id: operationId,
        repoId,
        operation,
        status: "error",
        title: checkingAccess
          ? "Acceso de lectura no comprobado"
          : operation === "fetch"
            ? "Fetch no completado"
            : operation === "remote"
              ? "Remoto no actualizado"
              : "Autorización no completada",
        destination,
        message: text,
      });
      await reload();
    } finally {
      setConfirm(null);
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }
  function startEdit(r?: RemoteInfo) {
    setConfirm(null);
    setDraft({
      kind: r ? "update" : "add",
      name: r?.name ?? "",
      url: r?.editUrl ?? "",
      pushUrl: r?.editPushUrl ?? "",
      token: state!.token,
    });
  }
  const stale = !!draft && draft.token !== state?.token;
  return (
    <>
      <section
        id="remotes-content"
        tabIndex={-1}
        hidden={!active}
        className="history-panel remote-panel"
        aria-label="Remotos del repositorio"
      >
        <div className="panel-heading">
          <div>
            <h1>Remotos</h1>
            <p>Destinos Git independientes de tus cuentas</p>
          </div>
          <button
            className="button"
            disabled={busy || loading}
            onClick={() => {
              setError("");
              void reload();
            }}
          >
            Actualizar
          </button>
        </div>
        <div className="remote-body">
          {error && (
            <p className="banner" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="banner" role="status">
              {notice}
            </p>
          )}
          {loading && <p role="status">Leyendo configuración local…</p>}
          {state && !state.trusted && (
            <div className="trust-panel">
              <h2>Autorizar este repositorio</h2>
              <p>
                La autorización también habilita la inspección de cambios y sus
                filtros/hooks. Las conexiones usan Git, sus ayudantes de
                credenciales y tu agente SSH. Autoriza sólo repositorios y
                configuración de confianza. Se recordará para este repositorio
                en este equipo. Puedes revocarla desde Cambios.
              </p>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void perform("authorize_remote_operations", {})}
              >
                Autorizar operaciones
              </button>
            </div>
          )}
          <button
            className="button primary"
            disabled={!allowed}
            onClick={() => startEdit()}
          >
            Añadir remoto
          </button>
          {state && !state.remotes.length && (
            <div className="empty-state">
              <h2>Este repositorio no tiene remotos</h2>
              <p>
                Añade un destino cuando lo necesites. El historial y los cambios
                locales funcionan sin conexión.
              </p>
            </div>
          )}
          <div className="remote-list">
            {state?.remotes.map((r) => (
              <button
                className={`remote-item ${remote?.name === r.name ? "selected" : ""}`}
                key={r.name}
                disabled={busy}
                onClick={() => {
                  setSelected(r.name);
                  setConfirm(null);
                  setDraft(null);
                }}
              >
                <strong>{r.name}</strong>
                <span>{r.provider}</span>
                <code>{r.fetchUrls.join(" · ")}</code>
                <small>
                  {r.trackingCount} referencias · {r.upstreamBranches.length}{" "}
                  ramas con seguimiento
                </small>
              </button>
            ))}
          </div>
          {draft && (
            <form
              className="remote-form"
              onSubmit={(e) => {
                e.preventDefault();
                setConfirm("save");
              }}
            >
              <h2>
                {draft.kind === "add"
                  ? "Añadir remoto"
                  : `Editar ${draft.name}`}
              </h2>
              <label>
                Nombre
                <input
                  required
                  disabled={busy || draft.kind === "update"}
                  value={draft.name}
                  placeholder="origin"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                URL de descarga
                <input
                  required
                  disabled={busy}
                  value={draft.url}
                  placeholder="git@gitea.example:equipo/proyecto.git"
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                />
              </label>
              <label>
                URL de publicación (opcional)
                <input
                  disabled={busy}
                  value={draft.pushUrl}
                  placeholder="Vacía: utilizar la URL de descarga"
                  onChange={(e) =>
                    setDraft({ ...draft, pushUrl: e.target.value })
                  }
                />
              </label>
              <p>
                No incluyas tokens ni contraseñas en las URLs. Guardar modifica
                la configuración local; no contacta con el servidor.
              </p>
              {stale && (
                <p role="alert">
                  La configuración cambió. Cierra y vuelve a abrir el formulario
                  para revisar los valores actuales.
                </p>
              )}
              <div className="remote-actions">
                <button className="button primary" disabled={!allowed || stale}>
                  Revisar configuración
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    setDraft(null);
                    setConfirm(null);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
      <aside
        hidden={!active}
        className="inspector remote-panel"
        aria-label="Detalle del remoto"
      >
        <div className="remote-body">
          {remote ? (
            <>
              <p className="eyebrow">DESTINO SELECCIONADO</p>
              <h2>{remote.name}</h2>
              <h3>Descarga</h3>
              {remote.fetchUrls.map((u, i) => (
                <code className="remote-url" key={i}>
                  {u}
                </code>
              ))}
              <h3>Publicación configurada</h3>
              {remote.pushUrls.map((u, i) => (
                <code className="remote-url" key={i}>
                  {u}
                </code>
              ))}
              <p>Para publicar commits, abre la vista Publicar.</p>
              <p>
                {fetched[remote.name]?.url === remote.fetchUrls.join("\n")
                  ? `Último fetch en esta apertura: ${new Date(fetched[remote.name].time * 1000).toLocaleString("es")}`
                  : "Sin fetch confirmado en esta apertura."}
              </p>
              <p>
                Ramas locales con seguimiento:{" "}
                {remote.upstreamBranches.join(", ") || "ninguna"}.
              </p>
              {remote.restriction && (
                <p className="banner">{remote.restriction}</p>
              )}
              <SshAccounts
                key={repoId}
                repoId={repoId}
                trusted={!!state?.trusted}
                disabled={busy || loading || !!draft || !remote.editable}
                fetchUrl={remote.editUrl ?? ""}
                pushUrl={remote.editPushUrl ?? ""}
                onLock={(value) => {
                  setBusy(value);
                  onLock(value);
                }}
                onApply={(profile, destination) => {
                  if (!allowed || !remote.editable || !remote.editUrl) return;
                  try {
                    const oldPush = remote.editPushUrl || remote.editUrl;
                    setDraft({
                      kind: "update",
                      name: remote.name,
                      token: state!.token,
                      url:
                        destination === "push"
                          ? remote.editUrl
                          : withSshHost(remote.editUrl, profile.host),
                      pushUrl:
                        destination === "fetch"
                          ? oldPush
                          : withSshHost(oldPush, profile.host),
                    });
                    setConfirm(null);
                    setNotice(
                      `Revisa el destino de ${remote.name} para ${profile.label}. La cuenta aún no se ha verificado; no se inició ninguna conexión.`,
                    );
                  } catch (e) {
                    setError(message(e));
                  }
                }}
              />
              <div className="remote-actions">
                <button
                  className="button"
                  disabled={!allowed || !remote.fetchAllowed || !!draft}
                  onClick={() =>
                    void perform("contact_remote", {
                      token: state!.token,
                      name: remote.name,
                      fetch: false,
                    })
                  }
                >
                  Comprobar acceso
                </button>
                <button
                  className="button primary"
                  disabled={!allowed || !remote.fetchAllowed || !!draft}
                  onClick={() => setConfirm("fetch")}
                >
                  Fetch…
                </button>
                <button
                  className="button"
                  disabled={!allowed || !remote.editable}
                  onClick={() => startEdit(remote)}
                >
                  Editar
                </button>
                <button
                  className="button"
                  disabled={!allowed || !remote.editable || !!draft}
                  onClick={() => setConfirm("remove")}
                >
                  Quitar…
                </button>
              </div>
            </>
          ) : (
            <p>
              Selecciona o añade un remoto para ver sus destinos y operaciones.
            </p>
          )}
          {confirm && (
            <section
              className="trust-panel remote-confirmation"
              aria-label="Confirmación de operación"
            >
              <h2>
                {confirm === "fetch"
                  ? `Fetch de ${remote?.name}`
                  : confirm === "remove"
                    ? `Quitar ${remote?.name}`
                    : "Guardar configuración"}
              </h2>
              {confirm === "save" && draft ? (
                <>
                  <p>
                    {draft.kind === "add" ? "Crear" : "Actualizar"} {draft.name}
                  </p>
                  <code className="remote-url">{draft.url}</code>
                  <p>
                    Publicación: {draft.pushUrl || "misma URL de descarga"}. No
                    se iniciará ninguna conexión.
                  </p>
                </>
              ) : confirm === "fetch" ? (
                <>
                  <code className="remote-url">
                    {remote?.fetchUrls.join(" · ")}
                  </code>
                  <p>
                    Descargar objetos y actualizar referencias remotas de ramas.
                    No fusiona, no publica, no descarga etiquetas ni elimina
                    referencias obsoletas.
                  </p>
                </>
              ) : (
                <p>
                  Se quitarán la configuración de {remote?.name}, sus{" "}
                  {remote?.trackingCount} referencias remotas y el seguimiento
                  asociado de {remote?.upstreamBranches.length} ramas. Tus ramas
                  locales, archivos y el servidor se conservan.
                </p>
              )}
              <div className="remote-actions">
                <button
                  className="button primary"
                  disabled={!allowed || (confirm === "save" && stale)}
                  onClick={() => {
                    if (confirm === "save" && draft)
                      void perform("edit_remote", {
                        token: draft.token,
                        edit: {
                          kind: draft.kind,
                          name: draft.name,
                          url: draft.url,
                          pushUrl: draft.pushUrl || null,
                        },
                      });
                    else if (remote)
                      void perform(
                        confirm === "remove" ? "edit_remote" : "contact_remote",
                        confirm === "remove"
                          ? {
                              token: state!.token,
                              edit: { kind: "remove", name: remote.name },
                            }
                          : {
                              token: state!.token,
                              name: remote.name,
                              fetch: true,
                            },
                        confirm === "fetch" ? remote.name : undefined,
                      );
                  }}
                >
                  Confirmar
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  Cancelar operación
                </button>
              </div>
            </section>
          )}
          {busy && <p role="status">Ejecutando operación Git…</p>}
        </div>
      </aside>
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { suggestedRepositoryName } from "./repositoryName";
import { sshHost, withSshHost, type SshAccounts } from "./sshAccounts";
import { emitOperation, nextOperationId } from "./operations";

const message = (reason: unknown) =>
  typeof reason === "object" && reason && "message" in reason
    ? String(reason.message)
    : "No se pudo completar la creación. Comprueba el destino antes de repetir.";
type Initialized = {
  path: string;
  branch: string | null;
  warning?: string | null;
};
export default function InitializeDialog({
  onClose,
  onLock,
  onOpen,
  mode = "initialize",
}: {
  onClose: () => void;
  onLock: (busy: boolean) => void;
  onOpen: (path: string) => Promise<boolean>;
  mode?: "initialize" | "clone";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const flight = useRef(false);
  const manualParent = useRef(false);
  const manualName = useRef(false);
  const [parent, setParent] = useState("");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("main");
  const [url, setUrl] = useState("");
  const [accounts, setAccounts] = useState<SshAccounts | null>(null);
  const cloning = mode === "clone";
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Initialized | null>(null);
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    let active = true;
    invoke<string>("get_default_repository_directory")
      .then((value) => {
        if (active && !manualParent.current && typeof value === "string") {
          setParent(value);
          setConfirmed(false);
        }
      })
      .catch(() => {
        if (active && !manualParent.current)
          setError(
            "No se pudo preparar la carpeta predeterminada en Documentos. Elige otra ubicación.",
          );
      });
    return () => {
      active = false;
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  function close() {
    if (flight.current) return;
    dialog.current?.close();
    onClose();
  }
  async function act(operation: () => Promise<void>) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    onLock(true);
    setError("");
    try {
      await operation();
    } catch (reason) {
      setError(message(reason));
    } finally {
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }
  async function openCreated(value: Initialized) {
    if (await onOpen(value.path)) {
      if (value.warning) return;
      dialog.current?.close();
      onClose();
    } else {
      setError(
        cloning
          ? "El repositorio fue clonado, pero no se pudo abrir. Reintenta sólo la apertura o abre su carpeta manualmente; no repitas el clonado."
          : "El repositorio fue creado, pero no se pudo abrir. Puedes reintentar sólo la apertura o abrir su carpeta manualmente; no repitas la creación.",
      );
    }
  }
  return (
    <dialog
      ref={dialog}
      className="operation-dialog"
      aria-labelledby="initialize-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="initialize-title">
          {cloning ? "Clonar repositorio" : "Nuevo repositorio"}
        </h2>
        <button className="button" disabled={busy} onClick={close}>
          Cerrar
        </button>
      </header>
      <p>
        {cloning
          ? "Descarga un repositorio a una carpeta nueva. No sobrescribe destinos existentes ni publica cambios."
          : "Crea una carpeta nueva y un repositorio vacío. No sobrescribe destinos existentes, no hace commits ni contacta servidores."}
      </p>
      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}
      {created ? (
        <>
          <p role="status">
            {cloning ? "Clonado completado en " : "Repositorio creado en "}
            <code>{created.path}</code>, rama{" "}
            <strong>{created.branch ?? "sin rama activa"}</strong>.{" "}
            {cloning
              ? "Se conserva el origen como origin."
              : "No tiene commits ni remotos."}
          </p>
          {created.warning && (
            <p className="banner" role="status">
              {created.warning} Cierra este diálogo para revisar las referencias
              del repositorio abierto.
            </p>
          )}
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void act(() => openCreated(created))}
          >
            {cloning ? "Abrir repositorio clonado" : "Abrir repositorio creado"}
          </button>
        </>
      ) : (
        <>
          {cloning && (
            <>
              <label>
                URL o ruta local del origen
                <input
                  autoFocus
                  value={url}
                  maxLength={4096}
                  disabled={busy}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    if (!manualName.current)
                      setName(suggestedRepositoryName(event.target.value));
                    setConfirmed(false);
                    setAttempted(false);
                  }}
                />
              </label>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() =>
                  void act(async () =>
                    setAccounts(await invoke<SshAccounts>("read_ssh_accounts")),
                  )
                }
              >
                Cargar perfiles SSH
              </button>
              {accounts && (
                <label>
                  Perfil SSH para el origen
                  <select
                    disabled={busy || !sshHost(url)}
                    value=""
                    onChange={(event) => {
                      if (!event.target.value) return;
                      try {
                        setUrl(withSshHost(url, event.target.value));
                        setConfirmed(false);
                        setAttempted(false);
                      } catch (reason) {
                        setError(message(reason));
                      }
                    }}
                  >
                    <option value="">Seleccionar perfil guardado…</option>
                    {accounts.profiles.map((p) => (
                      <option key={p.host} value={p.host}>
                        {p.label} · {p.provider} · {p.host}
                      </option>
                    ))}
                  </select>
                  Introduce primero una URL SSH. Elegir perfil sólo cambia su
                  host; revisa el origen antes de confirmar el clonado.
                </label>
              )}
            </>
          )}
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const path = await open({
                  directory: true,
                  multiple: false,
                  title: "Elegir carpeta contenedora",
                  defaultPath: parent || undefined,
                });
                if (path) {
                  manualParent.current = true;
                  setParent(path);
                  setConfirmed(false);
                  setAttempted(false);
                }
              })
            }
          >
            Elegir carpeta contenedora…
          </button>
          <p>
            Ubicación contenedora: <code>{parent || "Sin seleccionar"}</code>
          </p>
          <label>
            Nombre de la carpeta nueva
            <input
              autoFocus={!cloning}
              value={name}
              maxLength={100}
              disabled={busy}
              onChange={(event) => {
                setName(event.target.value);
                manualName.current = !!event.target.value;
                setConfirmed(false);
                setAttempted(false);
              }}
            />
          </label>
          {!cloning && (
            <label>
              Rama inicial
              <input
                value={branch}
                maxLength={255}
                disabled={busy}
                onChange={(event) => {
                  setBranch(event.target.value);
                  setConfirmed(false);
                  setAttempted(false);
                }}
              />
            </label>
          )}
          <p>
            Destino:{" "}
            <code>
              {parent
                ? `${parent.replace(/[\\/]$/, "")}/${name || "…"}`
                : "Elige una carpeta contenedora"}
            </code>
          </p>
          <p>
            {cloning
              ? "Admite HTTPS sin tokens/contraseñas en URL, SSH y rutas locales absolutas. Usa las credenciales de Git/sistema y la verificación normal de TLS/host SSH; no abre login web ni acepta claves desconocidas."
              : "Usa una ubicación fuera de otros repositorios. No copia plantillas ni hooks; la autorización para operaciones posteriores se solicita por separado."}
          </p>
          {cloning && (
            <p>
              No clona submódulos ni descarga LFS. Los filtros Git configurados
              pueden ejecutar herramientas externas durante el checkout.
              Operación acotada a 60 s, sin porcentaje ni reintento automático;
              revisa el destino tras un error.
            </p>
          )}
          {cloning && busy && attempted && (
            <p role="status">
              Clonando con Git… Espera a que termine. No se publica ningún
              cambio.
            </p>
          )}
          {attempted && (
            <p role="status">
              {cloning
                ? "Si el clonado no termina correctamente, el destino puede contener datos parciales. "
                : "La creación no se confirmó. "}
              Revisa el destino antes de repetir. Para otro intento, vuelve a
              elegir la ubicación o cambia el nombre.
            </p>
          )}
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || attempted}
              onChange={(event) => setConfirmed(event.target.checked)}
            />{" "}
            {cloning
              ? "Confío en el origen, mi configuración y mis filtros Git; confirmo descargar y crear el destino indicado."
              : "Confirmo la ubicación, la carpeta nueva y la rama inicial."}
          </label>
          <button
            className="button primary"
            disabled={
              busy ||
              attempted ||
              !confirmed ||
              !parent ||
              !name.trim() ||
              !(cloning ? url.trim() : branch.trim())
            }
            onClick={() =>
              void act(async () => {
                const operationId = nextOperationId();
                const operation = cloning ? "clone" : "initialize";
                setConfirmed(false);
                setAttempted(true);
                emitOperation({
                  id: operationId,
                  operation,
                  status: "progress",
                  title: cloning
                    ? "Clonando repositorio…"
                    : "Creando repositorio…",
                  message: "RavenGit espera la confirmación de Git.",
                });
                try {
                  const value = await invoke<Initialized>(
                    cloning ? "clone_repository" : "initialize_repository",
                    cloning ? { parent, name, url } : { parent, name, branch },
                  );
                  emitOperation({
                    id: operationId,
                    operation,
                    status: value.warning ? "warning" : "confirmed",
                    title: cloning
                      ? "Clonado confirmado"
                      : "Repositorio creado",
                    message:
                      value.warning ??
                      (cloning
                        ? "Git confirmó el clonado."
                        : "Git confirmó la inicialización."),
                  });
                  setCreated(value);
                  await openCreated(value);
                } catch (reason) {
                  emitOperation({
                    id: operationId,
                    operation,
                    status: "error",
                    title: cloning
                      ? "Clonado no confirmado"
                      : "Creación no confirmada",
                    message: message(reason),
                  });
                  throw reason;
                }
              })
            }
          >
            {cloning
              ? busy && attempted
                ? "Clonando repositorio…"
                : "Confirmar clonado"
              : "Crear repositorio"}
          </button>
        </>
      )}
    </dialog>
  );
}

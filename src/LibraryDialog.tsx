import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  RepositoryLibrary,
  LibraryEntry,
  CollectionEdit,
} from "./library";
import CollectionManager from "./CollectionManager";
const message = (error: unknown) =>
  typeof error === "object" && error && "message" in error
    ? String(error.message)
    : "No se pudo actualizar la biblioteca local.";
export default function LibraryDialog({
  onOpen,
  onClose,
  onForgot,
  currentPath,
  onDeleted,
  onLock,
}: {
  onOpen: (path?: string) => Promise<boolean>;
  onClose: () => void;
  onForgot: (path: string) => void;
  currentPath?: string;
  onDeleted?: (path: string) => void;
  onLock?: (busy: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const pinButtons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<{
    path: string | null;
    origin: Element | null;
  } | null>(null);
  const flight = useRef(false);
  const [library, setLibrary] = useState<RepositoryLibrary | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState("all");
  const [forget, setForget] = useState<string | null>(null);
  const [deleteFolder, setDeleteFolder] = useState(false);
  const [deletion, setDeletion] = useState<{
    token: string;
    path: string;
    name: string;
  } | null>(null);
  const [deleteName, setDeleteName] = useState("");
  useEffect(() => {
    setDeleteFolder(false);
    setDeletion(null);
    setDeleteName("");
  }, [forget]);
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const collections = library?.collections ?? [];
  useEffect(() => {
    if (
      library &&
      collection !== "all" &&
      collection !== "none" &&
      !library.collections.some((item) => item.id === collection)
    )
      setCollection("all");
  }, [library, collection]);
  useEffect(() => {
    if (busy || !pendingFocus.current) return;
    const { path, origin } = pendingFocus.current;
    pendingFocus.current = null;
    if (
      document.activeElement === origin ||
      document.activeElement === document.body
    ) {
      (path ? pinButtons.current.get(path) : search.current)?.focus();
    }
  }, [busy, library, forget]);
  function restoreFocus(path: string | null = null) {
    pendingFocus.current = { path, origin: document.activeElement };
  }
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    let active = true;
    invoke<RepositoryLibrary>("read_repository_library")
      .then((value) => {
        if (active) setLibrary(value);
      })
      .catch((reason) => {
        if (active) setError(message(reason));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);
  async function act(operation: () => Promise<void>) {
    if (flight.current) return;
    flight.current = true;
    onLock?.(true);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (reason) {
      setError(message(reason));
    } finally {
      flight.current = false;
      onLock?.(false);
      setBusy(false);
    }
  }
  async function openEntry(path?: string) {
    await act(async () => {
      if (await onOpen(path)) onClose();
      else if (path) {
        setFailedPath(path);
        setError(
          "No se pudo abrir esta ubicación. Comprueba que esté disponible o usa Localizar carpeta para actualizarla.",
        );
      }
    });
  }
  async function relocate(entry: LibraryEntry) {
    await act(async () => {
      const path = await open({
        directory: true,
        multiple: false,
        title: "Localizar repositorio",
      });
      if (!path) return;
      restoreFocus();
      const value = await invoke<RepositoryLibrary>("relocate_repository", {
        oldPath: entry.path,
        path,
      });
      setLibrary(value);
      onForgot(entry.path);
      setFailedPath(null);
    });
  }
  async function editCollection(edit: CollectionEdit) {
    let saved = false;
    await act(async () => {
      restoreFocus();
      setLibrary(
        await invoke<RepositoryLibrary>("edit_repository_library", { edit }),
      );
      setForget(null);
      setNotice(
        "Colecciones actualizadas. Los archivos y preferencias se conservan.",
      );
      saved = true;
    });
    return saved;
  }
  const entries = (library?.repositories ?? [])
    .filter(
      (entry) =>
        collection === "all" ||
        (collection === "none"
          ? !entry.collectionId
          : entry.collectionId === collection),
    )
    .filter((entry) =>
      `${entry.name} ${entry.path}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    )
    .sort((a, b) => b.lastOpened - a.lastOpened);
  return (
    <dialog
      ref={dialog}
      className="library-dialog"
      aria-labelledby="library-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!flight.current) onClose();
      }}
    >
      <header className="library-heading">
        <div>
          <h2 id="library-title">Repositorios</h2>
          <p>Tu espacio local</p>
        </div>
        <button
          className="button"
          onClick={onClose}
          disabled={flight.current}
          aria-label="Cerrar repositorios"
        >
          Cerrar
        </button>
      </header>
      {error && (
        <div className="banner error">
          <p role="alert">{error}</p>
          {!library && (
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  restoreFocus();
                  setLibrary(
                    await invoke<RepositoryLibrary>("read_repository_library"),
                  );
                })
              }
            >
              Reintentar lectura
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="banner" role="status">
          {notice}
        </p>
      )}
      <label className="library-search">
        Buscar repositorio
        <input
          ref={search}
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nombre o ubicación"
        />
      </label>
      {library && (
        <div className="library-collection-tools">
          <label>
            Mostrar colección
            <select
              value={collection}
              disabled={busy}
              onChange={(event) => {
                setCollection(event.target.value);
                setForget(null);
              }}
            >
              <option value="all">Todos los repositorios</option>
              <option value="none">Sin colección</option>
              {collections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <CollectionManager
            collections={collections}
            busy={busy}
            onEdit={editCollection}
          />
        </div>
      )}
      <div className="library-list" aria-busy={busy}>
        {busy && !library && <p role="status">Leyendo biblioteca local…</p>}
        {library && !library.repositories.length && (
          <p>
            Aún no hay repositorios guardados. Abre una carpeta para empezar.
          </p>
        )}
        {library && library.repositories.length > 0 && !entries.length && (
          <p>
            No hay coincidencias. Prueba otro nombre, ubicación o colección.
          </p>
        )}
        {[
          { label: "Fijados", pinned: true },
          { label: "Recientes", pinned: false },
        ].map((group) => {
          const items = entries.filter(
            (entry) => entry.pinned === group.pinned,
          );
          return (
            items.length > 0 && (
              <section key={group.label} aria-label={group.label}>
                <h3>{group.label}</h3>
                {items.map((entry) => (
                  <article
                    key={entry.path}
                    className={`library-entry ${failedPath === entry.path ? "library-entry-missing" : ""}`}
                  >
                    <button
                      className="library-open"
                      title={entry.path}
                      disabled={busy}
                      onClick={() => void openEntry(entry.path)}
                    >
                      <strong>
                        {entry.name}
                        {entry.path === currentPath && <small>Abierto</small>}
                      </strong>
                      <span>{entry.path}</span>
                    </button>
                    <div className="library-entry-actions">
                      <button
                        ref={(element) => {
                          if (element)
                            pinButtons.current.set(entry.path, element);
                          else pinButtons.current.delete(entry.path);
                        }}
                        className="button"
                        disabled={busy}
                        aria-label={`${entry.pinned ? "Desfijar" : "Fijar"} ${entry.name}`}
                        onClick={() =>
                          void act(async () => {
                            restoreFocus(entry.path);
                            setLibrary(
                              await invoke<RepositoryLibrary>(
                                "edit_repository_library",
                                {
                                  edit: {
                                    kind: "pin",
                                    path: entry.path,
                                    pinned: !entry.pinned,
                                  },
                                },
                              ),
                            );
                          })
                        }
                      >
                        {entry.pinned ? "Desfijar" : "Fijar"}
                      </button>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => void relocate(entry)}
                        aria-label={`Localizar carpeta de ${entry.name}`}
                      >
                        Localizar carpeta
                      </button>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => setForget(entry.path)}
                        aria-label={`Quitar ${entry.name} de la lista`}
                      >
                        Quitar de la lista
                      </button>
                    </div>
                    <label className="library-membership">
                      Colección de {entry.name}
                      <select
                        value={entry.collectionId ?? ""}
                        disabled={busy}
                        onChange={(event) =>
                          void editCollection({
                            kind: "assignCollection",
                            path: entry.path,
                            collectionId: event.target.value || null,
                          })
                        }
                      >
                        <option value="">Sin colección</option>
                        {collections.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {forget === entry.path && (
                      <div className="library-forget">
                        <p>
                          {deleteFolder
                            ? "Se moverá la carpeta completa a la Papelera, incluidos archivos sin commit y commits no publicados. No se borrará el remoto; recuperarla depende de la Papelera del sistema."
                            : "Se quitará de la biblioteca junto con sus preferencias. Los archivos y commits se conservan."}
                        </p>
                        <label>
                          <input
                            type="checkbox"
                            checked={deleteFolder}
                            disabled={busy}
                            onChange={(event) => {
                              setDeleteFolder(event.target.checked);
                              setDeletion(null);
                              setDeleteName("");
                            }}
                          />{" "}
                          También mover la carpeta a la Papelera
                        </label>
                        {deleteFolder && (
                          <>
                            <p>
                              Carpeta seleccionada: <code>{entry.path}</code>
                            </p>
                            {!deletion && (
                              <button
                                className="button"
                                disabled={busy}
                                onClick={() =>
                                  void act(async () => {
                                    setDeletion(
                                      await invoke(
                                        "preview_repository_delete",
                                        { path: entry.path },
                                      ),
                                    );
                                  })
                                }
                              >
                                Revisar eliminación de carpeta
                              </button>
                            )}
                            {deletion && (
                              <>
                                <p>
                                  Ruta revisada: <code>{deletion.path}</code>
                                </p>
                                <label>
                                  Escribe {deletion.name} para confirmar
                                  <input
                                    value={deleteName}
                                    disabled={busy}
                                    autoComplete="off"
                                    onChange={(event) =>
                                      setDeleteName(event.target.value)
                                    }
                                  />
                                </label>
                                <button
                                  className="button"
                                  disabled={
                                    busy || deleteName !== deletion.name
                                  }
                                  onClick={() =>
                                    void act(async () => {
                                      const review = deletion;
                                      setDeletion(null);
                                      setDeleteName("");
                                      restoreFocus();
                                      const result = await invoke<{
                                        library: RepositoryLibrary;
                                        warning: string | null;
                                      }>("trash_repository", {
                                        path: entry.path,
                                        token: review.token,
                                        confirmation: deleteName,
                                      });
                                      setLibrary(result.library);
                                      onForgot(entry.path);
                                      onDeleted?.(entry.path);
                                      setForget(null);
                                      setNotice(
                                        result.warning ??
                                          "La carpeta se movió a la Papelera. Puedes recuperarla desde el sistema y volver a abrirla.",
                                      );
                                    })
                                  }
                                >
                                  Mover carpeta a la Papelera
                                </button>
                              </>
                            )}
                          </>
                        )}
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() => {
                            restoreFocus();
                            setForget(null);
                          }}
                        >
                          Cancelar
                        </button>
                        {!deleteFolder && (
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() =>
                              void act(async () => {
                                restoreFocus();
                                setLibrary(
                                  await invoke<RepositoryLibrary>(
                                    "edit_repository_library",
                                    {
                                      edit: {
                                        kind: "forget",
                                        path: entry.path,
                                      },
                                    },
                                  ),
                                );
                                onForgot(entry.path);
                                setForget(null);
                              })
                            }
                          >
                            Confirmar quitar de la lista
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </section>
            )
          );
        })}
      </div>
      <footer className="library-footer">
        <span>
          Guardado en este equipo. No sincroniza ni copia repositorios.
        </span>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void openEntry()}
        >
          Abrir carpeta…
        </button>
      </footer>
    </dialog>
  );
}

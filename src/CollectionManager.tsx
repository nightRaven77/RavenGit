import { useRef, useState } from "react";
import type { CollectionEdit, RepositoryCollection } from "./library";

export default function CollectionManager({
  collections,
  busy,
  onEdit,
}: {
  collections: RepositoryCollection[];
  busy: boolean;
  onEdit: (edit: CollectionEdit) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [rename, setRename] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const summary = useRef<HTMLElement>(null);
  return (
    <details className="library-collections">
      <summary ref={summary}>Gestionar colecciones</summary>
      <p>Agrupa repositorios sin mover sus archivos. Hasta 30 colecciones.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (await onEdit({ kind: "createCollection", name })) setName("");
        }}
      >
        <label>
          Nueva colección
          <input
            value={name}
            maxLength={80}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          className="button"
          disabled={busy || !name.trim() || collections.length >= 30}
        >
          Crear colección
        </button>
      </form>
      <ol>
        {collections.map((collection, index) => (
          <li key={collection.id}>
            <strong>{collection.name}</strong>
            <div className="library-entry-actions">
              <button
                className="button"
                disabled={busy || index === 0}
                aria-label={`Subir ${collection.name}`}
                onClick={() =>
                  void onEdit({
                    kind: "moveCollection",
                    id: collection.id,
                    direction: "up",
                  })
                }
              >
                Subir
              </button>
              <button
                className="button"
                disabled={busy || index === collections.length - 1}
                aria-label={`Bajar ${collection.name}`}
                onClick={() =>
                  void onEdit({
                    kind: "moveCollection",
                    id: collection.id,
                    direction: "down",
                  })
                }
              >
                Bajar
              </button>
              <button
                className="button"
                disabled={busy}
                aria-label={`Renombrar ${collection.name}`}
                onClick={() => {
                  setRenaming(collection.id);
                  setRename(collection.name);
                  setRemoving(null);
                }}
              >
                Renombrar
              </button>
              <button
                className="button"
                disabled={busy}
                aria-label={`Quitar colección ${collection.name}`}
                onClick={() => {
                  setRemoving(collection.id);
                  setRenaming(null);
                }}
              >
                Quitar colección
              </button>
            </div>
            {renaming === collection.id && (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (
                    await onEdit({
                      kind: "renameCollection",
                      id: collection.id,
                      name: rename,
                    })
                  )
                    setRenaming(null);
                }}
              >
                <label>
                  Nombre de {collection.name}
                  <input
                    autoFocus
                    value={rename}
                    disabled={busy}
                    maxLength={80}
                    onChange={(event) => setRename(event.target.value)}
                  />
                </label>
                <button className="button" disabled={busy || !rename.trim()}>
                  Guardar nombre
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    setRenaming(null);
                    summary.current?.focus();
                  }}
                >
                  Cancelar renombrado
                </button>
              </form>
            )}
            {removing === collection.id && (
              <div className="library-forget">
                <p>
                  Se quitará sólo la colección. Sus repositorios pasarán a Sin
                  colección; conservarán fijación, preferencias, archivos y
                  commits.
                </p>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    setRemoving(null);
                    summary.current?.focus();
                  }}
                >
                  Cancelar quitar colección
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await onEdit({
                        kind: "removeCollection",
                        id: collection.id,
                      })
                    )
                      setRemoving(null);
                  }}
                >
                  Confirmar quitar colección
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

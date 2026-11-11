import { useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import LibraryDialog from "../src/LibraryDialog";
import type { RepositoryLibrary, HistoryPreferences } from "../src/library";
import "../src/App.css";
import "../src/workspace.css";

const preferences: HistoryPreferences = {
  inspectorOpen: true,
  inspectorSize: 38,
  authorWidth: 160,
  showDate: true,
  showHash: false,
  scope: "all",
  query: "",
  selectedCommit: null,
};
let library: RepositoryLibrary = {
  version: 2,
  collections: [
    { id: "personal", name: "Personal" },
    { id: "trabajo", name: "Trabajo" },
  ],
  repositories: Array.from({ length: 8 }, (_, index) => ({
    path: `/fixture/${index === 0 ? "ubicación-movida" : `equipo-${index}`}/Proyecto con nombre largo y caracteres ü`,
    name: "Proyecto",
    pinned: index < 2,
    lastOpened: index,
    preferences: { ...preferences },
    collectionId: index % 2 ? "trabajo" : null,
  })),
};
let failRead = new URLSearchParams(location.search).has("read-error");
let failSave = new URLSearchParams(location.search).has("save-error");
mockIPC((command, args) => {
  if (command === "read_repository_library") {
    if (failRead) {
      failRead = false;
      return Promise.reject({
        message: "Fixture: lectura fallida; puedes reintentar.",
      });
    }
    return structuredClone(library);
  }
  if (command === "edit_repository_library") {
    if (failSave) {
      failSave = false;
      return Promise.reject({
        message: "Fixture: guardado fallido; no se modificaron metadatos.",
      });
    }
    const { edit } = args as {
      edit: {
        kind: string;
        path: string;
        pinned: boolean;
        name: string;
        id: string;
        direction: string;
        collectionId: string | null;
      };
    };
    if (edit.kind === "pin") {
      library = {
        ...library,
        repositories: library.repositories.map((entry) =>
          entry.path === edit.path ? { ...entry, pinned: edit.pinned } : entry,
        ),
      };
    } else if (edit.kind === "forget") {
      library = {
        ...library,
        repositories: library.repositories.filter(
          (entry) => entry.path !== edit.path,
        ),
      };
    } else if (edit.kind === "createCollection") {
      const name = edit.name.trim();
      if (
        !name ||
        library.collections.some(
          (item) => item.name.toLowerCase() === name.toLowerCase(),
        )
      )
        return Promise.reject({
          message: "Nombre no válido o duplicado en la fixture.",
        });
      library = {
        ...library,
        collections: [
          ...library.collections,
          { id: `fixture-${Date.now()}`, name },
        ],
      };
    } else if (edit.kind === "renameCollection") {
      library = {
        ...library,
        collections: library.collections.map((item) =>
          item.id === edit.id ? { ...item, name: edit.name.trim() } : item,
        ),
      };
    } else if (edit.kind === "assignCollection") {
      library = {
        ...library,
        repositories: library.repositories.map((entry) =>
          entry.path === edit.path
            ? { ...entry, collectionId: edit.collectionId }
            : entry,
        ),
      };
    } else if (edit.kind === "removeCollection") {
      library = {
        ...library,
        collections: library.collections.filter((item) => item.id !== edit.id),
        repositories: library.repositories.map((entry) =>
          entry.collectionId === edit.id
            ? { ...entry, collectionId: null }
            : entry,
        ),
      };
    } else if (edit.kind === "moveCollection") {
      const collections = [...library.collections];
      const index = collections.findIndex((item) => item.id === edit.id);
      const next = index + (edit.direction === "up" ? -1 : 1);
      if (index < 0 || next < 0 || next >= collections.length)
        return Promise.reject({ message: "Orden no válido." });
      [collections[index], collections[next]] = [
        collections[next],
        collections[index],
      ];
      library = { ...library, collections };
    } else
      return Promise.reject({ message: "Operación de fixture no admitida." });
    return structuredClone(library);
  }
  return Promise.reject({
    message: "Fixture: Git, selectores y almacenamiento real deshabilitados.",
  });
});
function Fixture() {
  const [visible, setVisible] = useState(false);
  const [notice, setNotice] = useState(
    "Datos sintéticos en memoria. Sin Git, disco ni red.",
  );
  return (
    <main>
      <h1>Biblioteca · Fixture de consolidación</h1>
      <p role="status">{notice}</p>
      <button className="button" onClick={() => setVisible(true)}>
        Repositorios
      </button>
      {visible && (
        <LibraryDialog
          onClose={() => setVisible(false)}
          onForgot={() =>
            setNotice("Sólo se actualizaron datos sintéticos en memoria.")
          }
          onOpen={async (path) => {
            if (!path || path.includes("ubicación-movida")) return false;
            setNotice(`Apertura simulada: ${path}`);
            return true;
          }}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);

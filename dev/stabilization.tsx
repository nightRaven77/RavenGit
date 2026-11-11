// Isolated visual fixture. All IPC is simulated: no filesystem, Git, credentials or network.
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import App from "../src/App";
Object.defineProperty(window, "isTauri", { value: true, configurable: true });
const hash = "a".repeat(40);
let opened = false,
  trusted = false;
const repo = {
  id: "visual-only",
  name: "Fixture visual · RavenGit",
  path: "/fixture/no-real-repository",
  head: hash,
  branch: "main",
  shallow: false,
  refs: [{ name: "refs/heads/main", hash, kind: "branch" }],
  page: {
    commits: [
      {
        hash,
        parents: [],
        author: "Fixture de desarrollo",
        date: "2026-10-20",
        subject: "Datos sintéticos: ninguna operación Git real",
      },
    ],
    nextOffset: null,
    generation: "visual",
  },
};
mockIPC((command) => {
  if (command === "plugin:dialog|open") return "/fixture/no-real-repository";
  if (command === "open_repository") {
    if (opened)
      return Promise.reject({
        message:
          "Fixture: carpeta inválida. Este aviso global debe verse desde cualquier vista.",
      });
    opened = true;
    return repo;
  }
  if (command === "refresh_repository")
    return Promise.reject({
      message: "Fixture: fallo de actualización local. No se ha ejecutado Git.",
    });
  if (command === "read_commit_diff")
    return {
      hash,
      text: "Vista sintética sin contenido de un repositorio real.",
      parent: null,
      parentCount: 0,
    };
  if (
    command === "authorize_repository" ||
    command === "authorize_remote_operations"
  )
    trusted = true;
  if (command === "read_changes" || command === "authorize_repository")
    return {
      trusted,
      token: trusted ? "visual" : "",
      entries: [],
      head: trusted ? hash : null,
      branch: trusted ? "main" : null,
      author: trusted ? "Fixture <fixture@example.invalid>" : null,
      operation: null,
    };
  if (command === "read_remotes" || command === "authorize_remote_operations")
    return { token: "visual", trusted, remotes: [] };
  if (command === "read_push_options")
    return { branches: ["main"], current: "main" };
  return Promise.reject({
    message: "Fixture: operaciones Git y conexiones deshabilitadas.",
  });
});
createRoot(document.getElementById("root")!).render(<App />);

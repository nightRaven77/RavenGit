// Visual-only fixture. This entry is not part of the application build and cannot write to Git.
import React from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import ChangesPanel from "../src/ChangesPanel";
import "../src/App.css";
const text =
  "@@ -1,5 +1,6 @@\n :root {\n   --obsidian: #0b0f17;\n   --azure: #52b7ff;\n+  --crimson: #ff667d;\n }\n";
const state = {
  token: "visual-fixture",
  head: "a".repeat(40),
  branch: "feature/local-changes",
  author: "RavenGit Fixture <fixture@example.invalid>",
  trusted: false,
  operation: null,
  entries: [
    {
      path: "src/theme/tokens.css",
      indexStatus: " ",
      worktreeStatus: "M",
      untracked: false,
      conflict: false,
      submodule: false,
    },
    {
      path: "docs/alcance.md",
      indexStatus: "A",
      worktreeStatus: " ",
      untracked: false,
      conflict: false,
      submodule: false,
    },
  ],
};
mockIPC((command) => {
  if (command === "read_changes") return state;
  if (command === "read_file_diff")
    return {
      token: state.token,
      previewToken: "visual-preview",
      path: state.entries[0].path,
      area: "unstaged",
      text,
      hunks: [{ index: 0, header: "@@ -1,5 +1,6 @@", text }],
      partialAllowed: true,
      partialReason: null,
    };
  return Promise.reject({
    message: "Fixture visual: las operaciones Git están deshabilitadas.",
  });
});
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            R<span>/</span>
          </span>
          <strong>RavenGit</strong>
          <span className="prototype">0.2</span>
        </div>
        <div className="breadcrumb">Fixture visual / Cambios locales</div>
        <span className="read-only">
          Sin conexión con Git · Escrituras deshabilitadas
        </span>
      </header>
      <aside className="sidebar">
        <div className="section-label">VISTA DE DESARROLLO</div>
        <div className="workspace-name">RavenGit / fixture</div>
        <nav className="repo-navigation">
          <button className="nav-active" disabled>
            Cambios
          </button>
          <button className="nav-button" disabled>
            Historial
          </button>
        </nav>
        <div className="sidebar-foot">
          Datos sintéticos para revisar el diseño.
        </div>
      </aside>
      <ChangesPanel
        active
        repoId="visual-only"
        onLock={() => {}}
        onCommitted={async () => true}
      />
      <footer className="statusbar">
        <span>Fixture visual · No ejecuta operaciones Git</span>
        <span>Validación nativa pendiente</span>
      </footer>
    </main>
  </React.StrictMode>,
);

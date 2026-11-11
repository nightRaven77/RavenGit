// Visual fixture only: all mutations and connections are rejected.
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import RemotesPanel from "../src/RemotesPanel";
import "../src/App.css";
const state = {
  token: "visual",
  trusted: true,
  remotes: [
    {
      name: "origin",
      fetchUrls: ["git@gitea.example:erick/ravengit.git"],
      pushUrls: ["git@gitea.example:erick/ravengit.git"],
      editUrl: "git@gitea.example:erick/ravengit.git",
      editPushUrl: null,
      provider: "Servidor Git",
      editable: true,
      fetchAllowed: true,
      restriction: null,
      trackingCount: 4,
      upstreamBranches: ["main", "feature/graph"],
    },
    {
      name: "upstream",
      fetchUrls: ["https://github.com/example/ravengit.git"],
      pushUrls: ["https://github.com/example/ravengit.git"],
      editUrl: "https://github.com/example/ravengit.git",
      editPushUrl: null,
      provider: "GitHub",
      editable: true,
      fetchAllowed: true,
      restriction: null,
      trackingCount: 2,
      upstreamBranches: [],
    },
  ],
};
mockIPC((command) =>
  command === "read_remotes"
    ? state
    : Promise.reject({
        message: "Fixture visual: operaciones y conexiones deshabilitadas.",
      }),
);
createRoot(document.getElementById("root")!).render(
  <main className="app-shell">
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          R<span>/</span>
        </span>
        <strong>RavenGit</strong>
        <span className="prototype">0.3</span>
      </div>
      <div className="breadcrumb">Fixture visual / Datos sintéticos</div>
      <span className="read-only">Sin conexión con Git</span>
    </header>
    <aside className="sidebar">
      <div className="section-label">VISTA DE DESARROLLO</div>
      <div className="workspace-name">RavenGit / fixture</div>
      <nav className="repo-navigation">
        <button className="nav-button" disabled>
          Cambios
        </button>
        <button className="nav-button" disabled>
          Historial
        </button>
        <button className="nav-active" disabled>
          Remotos
        </button>
      </nav>
    </aside>
    <RemotesPanel
      active
      repoId="visual-only"
      onLock={() => {}}
      onUpdated={async () => true}
    />
    <footer className="statusbar">
      Datos sintéticos · Ningún proveedor validado en esta vista
    </footer>
  </main>,
);

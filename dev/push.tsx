// Visual fixture: simulated IPC only. Publishing and Git operations are disabled.
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import PushPanel from "../src/PushPanel";
import "../src/App.css";
const url = "git@gitea.example:erick/ravengit.git";
mockIPC((command) => {
  if (command === "read_remotes")
    return {
      token: "fixture",
      trusted: true,
      remotes: [
        {
          name: "origin",
          fetchUrls: [url],
          pushUrls: [url],
          editUrl: url,
          editPushUrl: null,
          provider: "Servidor Git",
          editable: true,
          fetchAllowed: true,
          pushAllowed: true,
          restriction: null,
          trackingCount: 3,
          upstreamBranches: ["main"],
        },
      ],
    };
  if (command === "read_push_options")
    return {
      branches: ["main", "feature/push-review"],
      current: "feature/push-review",
    };
  if (command === "preview_push")
    return {
      token: "fixture-review",
      remote: "origin",
      url,
      sourceBranch: "feature/push-review",
      sourceHash: "ad5e76ab".repeat(5),
      targetBranch: "feature/push-review",
      targetHash: "bc1ef209".repeat(5),
      ahead: 3,
      behind: 0,
      relation: "ahead",
      canPush: true,
      setUpstream: false,
      commits: [
        {
          hash: "ad5e76ab".repeat(5),
          subject: "Revisar destino y commits antes de publicar",
        },
        {
          hash: "95ade231".repeat(5),
          subject: "Detectar divergencia entre ramas",
        },
        {
          hash: "6287bace".repeat(5),
          subject: "Conservar el borrador al cambiar de vista",
        },
      ],
    };
  return Promise.reject({
    message: "Fixture visual: publicar y ejecutar Git están deshabilitados.",
  });
});
createRoot(document.getElementById("root")!).render(
  <main className="app-shell">
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          R<span>/</span>
        </span>
        <strong>RavenGit</strong>
        <span className="prototype">0.4</span>
      </div>
      <div className="breadcrumb">Fixture visual / Datos sintéticos</div>
      <span className="read-only">
        Sin conexión con Git · Publicación deshabilitada
      </span>
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
        <button className="nav-button" disabled>
          Remotos
        </button>
        <button className="nav-active" disabled>
          Publicar
        </button>
      </nav>
    </aside>
    <PushPanel
      active
      repoId="visual-only"
      onLock={() => {}}
      onUpdated={async () => true}
    />
    <footer className="statusbar">
      Datos sintéticos · No constituye validación de un proveedor real
    </footer>
  </main>,
);

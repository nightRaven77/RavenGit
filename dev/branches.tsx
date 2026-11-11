import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import BranchesPanel from "../src/BranchesPanel";
import "../src/App.css";

mockIPC((command) => {
  if (command === "read_branches")
    return {
      token: "fixture",
      operation: new URLSearchParams(location.search).has("merge")
        ? "MERGE_HEAD"
        : null,
      trusted: true,
      current: "main",
      head: "a".repeat(40),
      branches: [
        { name: "main", hash: "a".repeat(40) },
        { name: "feature/gestion-de-ramas", hash: "b".repeat(40) },
      ],
      restriction: new URLSearchParams(location.search).has("merge")
        ? "Termina el merge antes de gestionar ramas."
        : new URLSearchParams(location.search).has("dirty")
          ? "Guarda tus cambios en un commit antes de gestionar ramas. Incluye los archivos sin seguimiento."
          : null,
    };
  if (command === "read_merge")
    return {
      token: "merge-fixture",
      branch: "main",
      head: "a".repeat(40),
      sourceHash: "b".repeat(40),
      conflicts: ["src/archivo ü.txt"],
      staged: ["src/cambio-automático.ts"],
      canContinue: false,
      restriction: null,
    };
  if (command === "preview_merge")
    return {
      token: "fixture",
      source: "feature/gestion-de-ramas",
      destination: "main",
      sourceHash: "b".repeat(40),
      destinationHash: "a".repeat(40),
      relation: "diverged",
      incoming: 1,
      local: 1,
      commits: [
        { hash: "b".repeat(40), subject: "Preparar integración de ramas" },
      ],
      truncated: false,
      shallow: false,
    };
  if (command === "preview_rebase")
    return {
      token: "fixture",
      branch: "main",
      base: "feature/gestion-de-ramas",
      headHash: "a".repeat(40),
      baseHash: "b".repeat(40),
      relation: "diverged",
      candidates: 1,
      commits: [
        { hash: "a".repeat(40), subject: "Cambio exclusivo de la rama activa" },
      ],
      truncated: false,
      containsMerges: false,
    };
  return Promise.reject({
    message: "Fixture visual: las operaciones Git están deshabilitadas.",
  });
});
createRoot(document.getElementById("root")!).render(
  <main className="app-shell">
    <header className="topbar">
      <strong>RavenGit</strong>
      <span>Ramas locales · Datos sintéticos · Sin operaciones Git</span>
    </header>
    <aside className="sidebar">
      <div className="workspace-name">RavenGit / fixture</div>
      <nav className="repo-navigation">
        <button className="nav-active" disabled>
          Ramas
        </button>
      </nav>
    </aside>
    <BranchesPanel
      active
      repoId="fixture"
      onLock={() => {}}
      onUpdated={async () => true}
    />
    <footer className="statusbar">
      Fixture de desarrollo · No modifica repositorios
    </footer>
  </main>,
);

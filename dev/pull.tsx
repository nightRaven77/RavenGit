import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import PullPanel from "../src/PullPanel";
import "../src/App.css";

mockIPC((command) => {
  if (command === "read_pull_options")
    return {
      token: "fixture",
      trusted: true,
      branch: "main",
      remote: "equipo",
      remoteBranch: "main",
      url: "https://example.invalid/equipo/ravengit.git",
      restriction: new URLSearchParams(location.search).has("missing")
        ? "Configura un único upstream remoto. Pull no elige origin por ti."
        : null,
    };
  if (command === "preview_pull")
    return {
      token: "review",
      remote: "equipo",
      remoteBranch: "main",
      url: "https://example.invalid/equipo/ravengit.git",
      fetchedAt: 1792590000,
      merge: {
        token: "merge",
        source: "refs/remotes/equipo/main",
        destination: "main",
        sourceHash: "b".repeat(40),
        destinationHash: "a".repeat(40),
        relation: "diverged",
        incoming: 1,
        local: 1,
        commits: [
          { hash: "b".repeat(40), subject: "Preparar integración revisada" },
        ],
        truncated: false,
        shallow: false,
      },
    };
  return Promise.reject({
    message: "Fixture sintética: la integración real está deshabilitada.",
  });
});
createRoot(document.getElementById("root")!).render(
  <main className="app-shell">
    <header className="topbar">
      <strong>RavenGit</strong>
      <span>Pull · Datos sintéticos · Sin Git ni red</span>
    </header>
    <aside className="sidebar">
      <div className="workspace-name">RavenGit / fixture</div>
    </aside>
    <PullPanel
      active
      repoId="fixture"
      onLock={() => {}}
      onUpdated={async () => true}
      onBranches={() => {}}
    />
    <footer className="statusbar">
      Fixture de desarrollo · No modifica repositorios
    </footer>
  </main>,
);

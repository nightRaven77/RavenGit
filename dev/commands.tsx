// Visual-only fixture: callbacks never invoke Git, a terminal or the network.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import CommandBar from "../src/CommandBar";
import "../src/App.css";
import "./commands.css";
function Fixture() {
  const [notice, setNotice] = useState(
    "Datos sintéticos · Operaciones Git deshabilitadas",
  );
  const action = (name: string) => () =>
    setNotice(`Fixture visual: ${name}. No se ha ejecutado Git.`);
  return (
    <main className="app-shell">
      <CommandBar
        repo={{
          name: "RavenGit",
          path: "/fixture/RavenGit",
          branch: "main",
          head: "a".repeat(40),
        }}
        locked={false}
        onOpen={action("abrir repositorio")}
        onRefresh={action("actualizar referencias locales")}
        onChanges={action("abrir Cambios")}
        onFetch={action("abrir Remotos para elegir y confirmar Fetch")}
        onPush={action("abrir Publicar para revisar el push")}
        onPull={action("abrir Pull para confirmar Fetch y revisar el merge")}
        onBranches={action("gestionar ramas locales")}
        onSearch={action("buscar en el historial cargado")}
      />
      <aside className="sidebar">
        <div className="section-label">VISTA DE DESARROLLO</div>
        <div className="workspace-name">RavenGit / fixture</div>
        <nav className="repo-navigation">
          <button className="nav-button" disabled>
            Cambios
          </button>
          <button className="nav-active" disabled>
            Historial
          </button>
          <button className="nav-button" disabled>
            Remotos
          </button>
          <button className="nav-button" disabled>
            Publicar
          </button>
        </nav>
        <div className="sidebar-foot">
          Datos sintéticos para revisar la barra.
        </div>
      </aside>
      <section className="history-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">REPOSITORIO / HISTORIAL</p>
            <h1>main</h1>
            <p>Referencia visual de desarrollo</p>
          </div>
        </div>
        <div className="remote-body">
          <p className="banner" role="status">
            {notice}
          </p>
          {[
            "Publicar ramas con revisión de destino y commits",
            "Gestionar remotos y fetch explícito por destino",
            "Añadir cambios locales, staging y commits",
          ].map((label, index) => (
            <div key={label} className="fixture-history-row">
              <span className="fixture-graph-node" />
              <code>{["ad5e76ab", "95ade231", "6287bace"][index]}</code>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>
      <aside className="inspector">
        <div className="remote-body">
          <p className="eyebrow">REVISIÓN VISUAL</p>
          <h2>Comandos a mano</h2>
          <p>
            La barra conserva el contexto del repositorio y permite entrar a los
            flujos de revisión.
          </p>
          <p>Esta muestra no publica código ni ejecuta comandos Git.</p>
        </div>
      </aside>
      <footer className="statusbar">
        Fixture visual · Sin conexión con Git
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);

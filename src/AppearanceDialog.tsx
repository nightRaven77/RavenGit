import { useEffect, useMemo, useRef } from "react";
import GraphCell from "./GraphCell";
import { layoutGraph, graphPixelWidth } from "./graph";
import {
  GRAPH_PALETTES,
  GRAPH_STYLES,
  THEMES,
  resolveGraphColors,
  type GraphPaletteId,
  type GraphStyleId,
  type ThemeId,
} from "./themes";
import type { Commit } from "./types";

interface Props {
  theme: ThemeId;
  graphPalette: GraphPaletteId;
  graphStyle?: GraphStyleId;
  onChange: (theme: ThemeId, graphPalette: GraphPaletteId) => void;
  onChangeGraphStyle?: (style: GraphStyleId) => void;
  onClose: () => void;
}

const PREVIEW_COMMITS: Commit[] = [
  {
    hash: "merge1",
    parents: ["main2", "feat1"],
    author: "Rosa Bell",
    date: "2026-11-22",
    subject: "Merge rama feat/temas en main",
  },
  {
    hash: "feat1",
    parents: ["base1"],
    author: "Tomas Park",
    date: "2026-11-22",
    subject: "Explorar paletas de color y grafo",
  },
  {
    hash: "main2",
    parents: ["base1"],
    author: "Erick M",
    date: "2026-11-21",
    subject: "Integrar lanzador externo",
  },
  {
    hash: "base1",
    parents: [],
    author: "Rosa Bell",
    date: "2026-11-20",
    subject: "Commit inicial",
  },
];

export default function AppearanceDialog({
  theme,
  graphPalette,
  graphStyle = "tributary",
  onChange,
  onChangeGraphStyle,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  const previewRows = useMemo(() => layoutGraph(PREVIEW_COMMITS), []);
  const previewWidth = useMemo(
    () =>
      graphStyle === "tributary"
        ? Math.min(110, graphPixelWidth(previewRows, "tributary"))
        : Math.min(88, graphPixelWidth(previewRows, "compact")),
    [previewRows, graphStyle],
  );
  const colors = useMemo(
    () => resolveGraphColors(graphPalette, theme),
    [graphPalette, theme],
  );
  const activeScheme =
    THEMES.find((item) => item.id === theme)?.scheme ?? "dark";

  return (
    <dialog
      ref={dialog}
      className="operation-dialog appearance-dialog"
      aria-labelledby="appearance-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2 id="appearance-title">Apariencia y colores</h2>
          <p>
            Explora temas de superficie y paletas para el grafo de commits con
            vista previa en vivo.
          </p>
        </div>
        <button
          type="button"
          className="button"
          aria-label="Cerrar diálogo de apariencia"
          onClick={onClose}
          autoFocus
        >
          ×
        </button>
      </header>

      <section className="appearance-section" aria-label="Vista previa en vivo">
        <h3>Vista previa</h3>
        <div className="appearance-preview">
          {PREVIEW_COMMITS.map((commit, index) => {
            const row = previewRows[index];
            const rowColor = colors[row.color % colors.length] ?? "#52b7ff";
            const previewPills = (
              <>
                {index === 0 && (
                  <>
                    <span className="ref head">HEAD</span>
                    <span
                      className="ref branch ref-current"
                      style={
                        { "--pill-color": rowColor } as React.CSSProperties
                      }
                    >
                      main
                    </span>
                    <span className="ref remote">origin/main</span>
                  </>
                )}
                {index === 1 && (
                  <>
                    <span
                      className="ref branch"
                      style={
                        { "--pill-color": rowColor } as React.CSSProperties
                      }
                    >
                      feat/temas
                    </span>
                    <span className="ref tag">v1.0.6</span>
                  </>
                )}
              </>
            );
            return (
              <div
                key={commit.hash}
                className={`appearance-preview-row${graphStyle === "tributary" ? " tributary" : ""}`}
              >
                {graphStyle === "tributary" && (
                  <div className="appearance-preview-refs">{previewPills}</div>
                )}
                <GraphCell
                  row={row}
                  width={previewWidth}
                  rowHeight={graphStyle === "tributary" ? 50 : 42}
                  colors={colors}
                  isHead={index === 0}
                  hasRefs={index <= 1}
                  style={graphStyle}
                  authorName={commit.author}
                  refSide={graphStyle === "tributary" ? "left" : "right"}
                />
                {graphStyle !== "tributary" && previewPills}
                <span className="truncate">{commit.subject}</span>
              </div>
            );
          })}
          <div className="appearance-preview-diff" aria-hidden="true">
            <span className="diff-line hunk">@@ -12,3 +12,4 @@</span>
            <span className="diff-line deletion">
              - const surface = &quot;#0b0f17&quot;;
            </span>
            <span className="diff-line addition">
              + const surface = &quot;var(--bg-canvas)&quot;;
            </span>
          </div>
        </div>
      </section>

      <section className="appearance-section" aria-label="Temas de interfaz">
        <h3>Tema de la interfaz</h3>
        <div className="theme-grid">
          {THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="theme-card"
              aria-pressed={theme === item.id}
              onClick={() => onChange(item.id, graphPalette)}
            >
              <div className="palette-dots" aria-hidden="true">
                {item.swatches.map((hex) => (
                  <span
                    key={hex}
                    className="palette-dot"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
              <div className="theme-card-head">
                <strong>{item.name}</strong>
                <span className="theme-card-badge">{item.badge}</span>
              </div>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
      </section>

      <section
        className="appearance-section"
        aria-label="Paletas del mapa de commits"
      >
        <h3>Paleta del grafo de commits</h3>
        <div className="palette-grid">
          {GRAPH_PALETTES.map((item) => {
            const dots =
              activeScheme === "light" ? item.lightColors : item.darkColors;
            return (
              <button
                key={item.id}
                type="button"
                className="palette-card"
                aria-pressed={graphPalette === item.id}
                onClick={() => onChange(theme, item.id)}
              >
                <strong>{item.name}</strong>
                <div className="palette-dots" aria-hidden="true">
                  {dots.map((hex) => (
                    <span
                      key={hex}
                      className="palette-dot"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
                <small>{item.description}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section
        className="appearance-section"
        aria-label="Estilos del grafo de commits"
      >
        <h3>Estilo del grafo</h3>
        <div className="graph-style-grid">
          {GRAPH_STYLES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="palette-card"
              aria-pressed={graphStyle === item.id}
              onClick={() => onChangeGraphStyle?.(item.id)}
            >
              <strong>{item.name}</strong>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
      </section>

      <footer className="appearance-footer">
        <button
          type="button"
          className="button"
          onClick={() => onChange("obsidian", "identity")}
        >
          Restaurar identidad oficial
        </button>
        <button type="button" className="button primary" onClick={onClose}>
          Cerrar
        </button>
      </footer>
    </dialog>
  );
}

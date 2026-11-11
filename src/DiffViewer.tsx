import { memo, useMemo, useState } from "react";
import { splitDiff, type DiffCell } from "./splitDiff";

export type DiffMode = "unified" | "split";
export function DiffModeControl({
  mode,
  onChange,
  available,
}: {
  mode: DiffMode;
  onChange: (mode: DiffMode) => void;
  available: boolean;
}) {
  return (
    <div className="diff-mode" role="group" aria-label="Formato del diff">
      <button
        className="button"
        aria-pressed={mode === "unified"}
        onClick={() => onChange("unified")}
      >
        Unificado
      </button>
      <button
        className="button"
        aria-pressed={mode === "split"}
        disabled={!available}
        onClick={() => onChange("split")}
      >
        Dividido
      </button>
      {!available && (
        <small>
          Vista dividida disponible para parches de texto compatibles.
        </small>
      )}
    </div>
  );
}
function Cell({ cell, side }: { cell?: DiffCell; side: string }) {
  return (
    <td className={`split-cell ${cell?.kind ?? "empty"}`}>
      {cell && (
        <>
          <span
            className="split-number"
            aria-label={`${side}, línea ${cell.number}`}
          >
            {cell.number}
          </span>
          <code>
            <span className="split-sign" aria-hidden="true">
              {cell.kind === "addition"
                ? "+"
                : cell.kind === "deletion"
                  ? "−"
                  : " "}
            </span>
            {cell.text || " "}
          </code>
        </>
      )}
    </td>
  );
}
export const DiffContent = memo(function DiffContent({
  text,
  mode = "unified",
}: {
  text: string;
  mode?: DiffMode;
}) {
  const rows = useMemo(
    () => (mode === "split" ? splitDiff(text) : null),
    [text, mode],
  );
  if (mode === "split" && rows)
    return (
      <div
        className="split-scroll"
        role="region"
        aria-label="Contenido del diff dividido"
        tabIndex={0}
      >
        <table className="split-diff">
          <caption className="sr-only">
            Comparación de líneas antes y después. Las filas alinean cambios
            contiguos, sin equivalencia semántica.
          </caption>
          <thead>
            <tr>
              <th scope="col">Antes</th>
              <th scope="col">Después</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) =>
              row.kind === "meta" ? (
                <tr key={index}>
                  <td className="split-meta" colSpan={2}>
                    <code>{row.text}</code>
                  </td>
                </tr>
              ) : (
                <tr key={index}>
                  <Cell cell={row.before} side="Antes" />
                  <Cell cell={row.after} side="Después" />
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    );
  return (
    <>
      {mode === "split" && !rows && (
        <p className="partial-note">
          Este contenido se muestra en formato unificado porque no admite
          comparación dividida.
        </p>
      )}
      <pre aria-label="Contenido del diff">
        {text.split("\n").map((line, i) => (
          <span
            key={i}
            className={`diff-line ${line.startsWith("+++") || line.startsWith("---") ? "file-header" : line.startsWith("+") ? "addition" : line.startsWith("-") ? "deletion" : line.startsWith("@@") ? "hunk" : line.startsWith("diff --git") ? "file-header" : ""}`}
          >
            {line || " "}
          </span>
        ))}
      </pre>
    </>
  );
});
export default function DiffViewer({ text }: { text: string }) {
  const [mode, setMode] = useState<DiffMode>("unified");
  const available = useMemo(() => splitDiff(text) !== null, [text]);
  const effective = available ? mode : "unified";
  return (
    <>
      <DiffModeControl
        mode={effective}
        onChange={setMode}
        available={available}
      />
      <DiffContent text={text} mode={effective} />
    </>
  );
}

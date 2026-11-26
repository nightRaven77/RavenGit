import {
  Fragment,
  memo,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { splitDiff, type DiffCell, type SplitRow } from "./splitDiff";
import {
  detectLanguage,
  tokenizeLine,
  type SyntaxLanguage,
} from "./syntaxHighlight";
import {
  diffInline,
  mergeHighlights,
  type InlineSegment,
} from "./intraLineDiff";

export type DiffMode = "unified" | "split";

export function DiffModeControl({
  mode,
  onChange,
  available,
  ignoreWhitespace = false,
  onIgnoreWhitespaceChange,
  contextLines = 3,
  onContextLinesChange,
  wrapLines = true,
  onWrapLinesChange,
}: {
  mode: DiffMode;
  onChange: (mode: DiffMode) => void;
  available: boolean;
  ignoreWhitespace?: boolean;
  onIgnoreWhitespaceChange?: (value: boolean) => void;
  contextLines?: number;
  onContextLinesChange?: (value: number) => void;
  wrapLines?: boolean;
  onWrapLinesChange?: (value: boolean) => void;
}) {
  return (
    <div className="diff-mode" role="group" aria-label="Formato del diff">
      <button
        type="button"
        className="button"
        aria-pressed={mode === "unified"}
        onClick={() => onChange("unified")}
      >
        Unificado
      </button>
      <button
        type="button"
        className="button"
        aria-pressed={mode === "split"}
        disabled={!available}
        onClick={() => onChange("split")}
      >
        Dividido
      </button>
      {onWrapLinesChange && (
        <button
          type="button"
          className="button"
          aria-pressed={wrapLines}
          onClick={() => onWrapLinesChange(!wrapLines)}
          title="Ajustar líneas largas al ancho del panel sin desplazamiento horizontal"
        >
          Ajustar líneas
        </button>
      )}
      {onIgnoreWhitespaceChange && (
        <button
          type="button"
          className="button"
          aria-pressed={ignoreWhitespace}
          onClick={() => onIgnoreWhitespaceChange(!ignoreWhitespace)}
          title="Ignorar cambios de espacios en blanco (-w)"
        >
          Ignorar espacios
        </button>
      )}
      {onContextLinesChange && (
        <label className="diff-context-control">
          <span>Contexto</span>
          <select
            aria-label="Líneas de contexto"
            value={contextLines}
            onChange={(event) =>
              onContextLinesChange(Number(event.target.value))
            }
          >
            <option value={3}>3 líneas</option>
            <option value={6}>6 líneas</option>
            <option value={12}>12 líneas</option>
          </select>
        </label>
      )}
      {!available && (
        <small>
          Vista dividida disponible para parches de texto compatibles.
        </small>
      )}
    </div>
  );
}

function parseFileHeaderPath(line: string): string | null {
  if (line.startsWith("+++ b/")) return line.slice(6).trim();
  if (line.startsWith("+++ ") && line !== "+++ /dev/null") {
    return line.slice(4).trim();
  }
  if (line.startsWith("diff --git ")) {
    const match = /\sb\/(.+)$/.exec(line);
    return match?.[1] ?? null;
  }
  return null;
}

function renderCodeSpans(
  text: string,
  lang: SyntaxLanguage,
  inline: InlineSegment[] | undefined,
  markClass: "diff-inline-add" | "diff-inline-del" | null,
) {
  if (!text) return " ";
  const spans = inline
    ? mergeHighlights(text, lang, inline)
    : tokenizeLine(text, lang).map((token) => ({
        text: token.text,
        syntax: token.type,
        changed: false,
      }));
  if (spans.length === 0) return text;
  return spans.map((span, idx) => {
    const cls = span.syntax !== "plain" ? `syn-${span.syntax}` : undefined;
    if (span.changed && markClass) {
      return (
        <mark key={idx} className={cls ? `${markClass} ${cls}` : markClass}>
          {span.text}
        </mark>
      );
    }
    if (cls) {
      return (
        <span key={idx} className={cls}>
          {span.text}
        </span>
      );
    }
    return <Fragment key={idx}>{span.text}</Fragment>;
  });
}

function Cell({
  cell,
  side,
  lang,
  inline,
}: {
  cell?: DiffCell;
  side: string;
  lang: SyntaxLanguage;
  inline?: InlineSegment[];
}) {
  const markClass =
    cell?.kind === "addition"
      ? "diff-inline-add"
      : cell?.kind === "deletion"
        ? "diff-inline-del"
        : null;
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
            {cell.text
              ? renderCodeSpans(cell.text, lang, inline, markClass)
              : " "}
          </code>
        </>
      )}
    </td>
  );
}

interface UnifiedParsedLine {
  raw: string;
  kind: "hunk" | "file-header" | "addition" | "deletion" | "context";
  bodyIndex: number | null;
  lang: SyntaxLanguage;
}

function analyzeUnified(
  text: string,
  basePath?: string | null,
): {
  parsed: UnifiedParsedLine[];
  inlineMap: Map<number, InlineSegment[]>;
} {
  const rawLines = text.split("\n");
  let currentLang = detectLanguage(basePath);
  let hunkHeaderLine = -1;
  const parsed: UnifiedParsedLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const headerPath = parseFileHeaderPath(line);
    if (headerPath) {
      currentLang = detectLanguage(headerPath);
      hunkHeaderLine = -1;
    }

    let kind: UnifiedParsedLine["kind"] = "context";
    if (
      line.startsWith("+++") ||
      line.startsWith("---") ||
      line.startsWith("diff --git")
    ) {
      kind = "file-header";
    } else if (line.startsWith("@@")) {
      kind = "hunk";
      hunkHeaderLine = i;
    } else if (line.startsWith("+")) {
      kind = "addition";
    } else if (line.startsWith("-")) {
      kind = "deletion";
    }

    const bodyIndex =
      hunkHeaderLine >= 0 &&
      i > hunkHeaderLine &&
      !(i === rawLines.length - 1 && line === "")
        ? i - hunkHeaderLine - 1
        : null;

    parsed.push({ raw: line, kind, bodyIndex, lang: currentLang });
  }

  const inlineMap = new Map<number, InlineSegment[]>();
  let idx = 0;
  while (idx < parsed.length) {
    if (parsed[idx].kind !== "deletion") {
      idx++;
      continue;
    }
    const delStart = idx;
    while (idx < parsed.length && parsed[idx].kind === "deletion") idx++;
    const addStart = idx;
    while (idx < parsed.length && parsed[idx].kind === "addition") idx++;
    const delCount = addStart - delStart;
    const addCount = idx - addStart;
    const pairs = Math.min(delCount, addCount);
    for (let k = 0; k < pairs; k++) {
      const beforeBody = parsed[delStart + k].raw.slice(1);
      const afterBody = parsed[addStart + k].raw.slice(1);
      const result = diffInline(beforeBody, afterBody);
      if (result.before.some((s) => s.changed)) {
        inlineMap.set(delStart + k, result.before);
      }
      if (result.after.some((s) => s.changed)) {
        inlineMap.set(addStart + k, result.after);
      }
    }
  }

  return { parsed, inlineMap };
}

function analyzeSplitRows(
  rows: SplitRow[] | null,
  basePath?: string | null,
): {
  langs: SyntaxLanguage[];
  beforeInline: Map<number, InlineSegment[]>;
  afterInline: Map<number, InlineSegment[]>;
} | null {
  if (!rows) return null;
  let currentLang = detectLanguage(basePath);
  const langs: SyntaxLanguage[] = [];
  const beforeInline = new Map<number, InlineSegment[]>();
  const afterInline = new Map<number, InlineSegment[]>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.kind === "meta") {
      const headerPath = parseFileHeaderPath(row.text);
      if (headerPath) currentLang = detectLanguage(headerPath);
      langs.push(currentLang);
      continue;
    }
    langs.push(currentLang);
    if (row.before?.kind === "deletion" && row.after?.kind === "addition") {
      const result = diffInline(row.before.text, row.after.text);
      if (result.before.some((s) => s.changed)) {
        beforeInline.set(i, result.before);
      }
      if (result.after.some((s) => s.changed)) {
        afterInline.set(i, result.after);
      }
    }
  }

  return { langs, beforeInline, afterInline };
}

type MinimapMark = {
  ratio: number;
  kind: "add" | "del" | "hunk";
};

function DiffMinimap({
  marks,
  onSeek,
}: {
  marks: MinimapMark[];
  onSeek: (ratio: number) => void;
}) {
  if (marks.length === 0) return null;
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.height <= 0) return;
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientY - rect.top) / rect.height),
    );
    onSeek(ratio);
  };
  return (
    <div
      className="diff-minimap"
      aria-hidden="true"
      onClick={handleClick}
      title="Navegación rápida de cambios en el diff"
    >
      {marks.map((mark, idx) => (
        <span
          key={idx}
          className={`diff-minimap-mark ${mark.kind}`}
          style={{ top: `${(mark.ratio * 100).toFixed(2)}%` }}
        />
      ))}
    </div>
  );
}

export const DiffContent = memo(function DiffContent({
  text,
  mode = "unified",
  filePath,
  selectable = false,
  selectedLines,
  onLineClick,
  showMinimap = true,
  wrapLines = true,
}: {
  text: string;
  mode?: DiffMode;
  filePath?: string | null;
  selectable?: boolean;
  selectedLines?: ReadonlySet<number>;
  onLineClick?: (bodyLineIndex: number, shiftKey: boolean) => void;
  showMinimap?: boolean;
  wrapLines?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const splitScrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(
    () => (mode === "split" ? splitDiff(text) : null),
    [text, mode],
  );
  const splitMeta = useMemo(
    () => analyzeSplitRows(rows, filePath),
    [rows, filePath],
  );
  const unified = useMemo(
    () => (mode === "split" && rows ? null : analyzeUnified(text, filePath)),
    [text, mode, rows, filePath],
  );

  const minimapMarks = useMemo<MinimapMark[]>(() => {
    if (!showMinimap) return [];
    if (mode === "split" && rows) {
      if (rows.length <= 20) return [];
      const marks: MinimapMark[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const ratio = i / Math.max(1, rows.length - 1);
        if (r.kind === "meta") {
          if (r.text.startsWith("@@")) marks.push({ ratio, kind: "hunk" });
        } else if (r.after?.kind === "addition") {
          marks.push({ ratio, kind: "add" });
        } else if (r.before?.kind === "deletion") {
          marks.push({ ratio, kind: "del" });
        }
      }
      return marks;
    }
    if (!unified || unified.parsed.length <= 20) return [];
    const total = unified.parsed.length;
    const marks: MinimapMark[] = [];
    for (let i = 0; i < total; i++) {
      const entry = unified.parsed[i];
      const ratio = i / Math.max(1, total - 1);
      if (entry.kind === "hunk") marks.push({ ratio, kind: "hunk" });
      else if (entry.kind === "addition") marks.push({ ratio, kind: "add" });
      else if (entry.kind === "deletion") marks.push({ ratio, kind: "del" });
    }
    return marks;
  }, [showMinimap, mode, rows, unified]);

  const seekScroll = (ratio: number) => {
    const splitEl = splitScrollRef.current;
    if (splitEl && splitEl.scrollHeight > splitEl.clientHeight) {
      splitEl.scrollTop = ratio * (splitEl.scrollHeight - splitEl.clientHeight);
      return;
    }
    const scroller = wrapRef.current?.closest(".diff-body");
    if (scroller && scroller.scrollHeight > scroller.clientHeight) {
      scroller.scrollTop =
        ratio * (scroller.scrollHeight - scroller.clientHeight);
    }
  };

  if (mode === "split" && rows && splitMeta) {
    return (
      <div
        ref={wrapRef}
        className={`diff-content-wrap ${wrapLines ? "wrap-lines" : "no-wrap"}`}
      >
        <div
          ref={splitScrollRef}
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
                    <Cell
                      cell={row.before}
                      side="Antes"
                      lang={splitMeta.langs[index]}
                      inline={splitMeta.beforeInline.get(index)}
                    />
                    <Cell
                      cell={row.after}
                      side="Después"
                      lang={splitMeta.langs[index]}
                      inline={splitMeta.afterInline.get(index)}
                    />
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <DiffMinimap marks={minimapMarks} onSeek={seekScroll} />
      </div>
    );
  }

  const lines = unified?.parsed ?? [];
  const inlineMap = unified?.inlineMap;

  return (
    <>
      {mode === "split" && !rows && (
        <p className="partial-note">
          Este contenido se muestra en formato unificado porque no admite
          comparación dividida.
        </p>
      )}
      <div
        ref={wrapRef}
        className={`diff-content-wrap ${wrapLines ? "wrap-lines" : "no-wrap"}`}
      >
        <pre aria-label="Contenido del diff">
          {lines.map((entry, i) => {
            const line = entry.raw;
            const kindClass =
              entry.kind === "file-header"
                ? "file-header"
                : entry.kind === "addition"
                  ? "addition"
                  : entry.kind === "deletion"
                    ? "deletion"
                    : entry.kind === "hunk"
                      ? "hunk"
                      : "";
            const isChange =
              entry.kind === "addition" || entry.kind === "deletion";
            const canSelectLine =
              selectable &&
              isChange &&
              entry.bodyIndex !== null &&
              !!onLineClick;
            const isSelected =
              canSelectLine &&
              entry.bodyIndex !== null &&
              !!selectedLines?.has(entry.bodyIndex);
            const inline = inlineMap?.get(i);
            const renderedContent = isChange ? (
              <>
                {line[0]}
                {renderCodeSpans(
                  line.slice(1),
                  entry.lang,
                  inline,
                  entry.kind === "addition"
                    ? "diff-inline-add"
                    : "diff-inline-del",
                )}
              </>
            ) : entry.kind === "context" ? (
              renderCodeSpans(line, entry.lang, undefined, null)
            ) : (
              line || " "
            );

            return (
              <span
                key={i}
                className={`diff-line ${kindClass}${canSelectLine ? " selectable" : ""}${isSelected ? " selected" : ""}`}
                onClick={
                  canSelectLine
                    ? (event) => {
                        if (
                          event.shiftKey &&
                          !(event.target as HTMLElement).closest(
                            ".diff-line-select",
                          )
                        ) {
                          event.preventDefault();
                          onLineClick!(entry.bodyIndex!, true);
                        }
                      }
                    : undefined
                }
              >
                {canSelectLine && (
                  <button
                    type="button"
                    className="diff-line-select"
                    aria-pressed={isSelected}
                    aria-label={`Seleccionar línea ${line[0]}${entry.bodyIndex! + 1}: ${line.slice(1).trim().slice(0, 40) || "vacía"}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onLineClick!(entry.bodyIndex!, event.shiftKey);
                    }}
                  >
                    {isSelected ? "✓" : line[0]}
                  </button>
                )}
                {renderedContent}
              </span>
            );
          })}
        </pre>
        <DiffMinimap marks={minimapMarks} onSeek={seekScroll} />
      </div>
    </>
  );
});

export default function DiffViewer({
  text,
  filePath,
  ignoreWhitespace,
  onIgnoreWhitespaceChange,
  contextLines,
  onContextLinesChange,
}: {
  text: string;
  filePath?: string | null;
  ignoreWhitespace?: boolean;
  onIgnoreWhitespaceChange?: (value: boolean) => void;
  contextLines?: number;
  onContextLinesChange?: (value: number) => void;
}) {
  const [mode, setMode] = useState<DiffMode>("unified");
  const [wrapLines, setWrapLines] = useState(true);
  const available = useMemo(() => splitDiff(text) !== null, [text]);
  const effective = available ? mode : "unified";
  return (
    <>
      <DiffModeControl
        mode={effective}
        onChange={setMode}
        available={available}
        ignoreWhitespace={ignoreWhitespace}
        onIgnoreWhitespaceChange={onIgnoreWhitespaceChange}
        contextLines={contextLines}
        onContextLinesChange={onContextLinesChange}
        wrapLines={wrapLines}
        onWrapLinesChange={setWrapLines}
      />
      <DiffContent
        text={text}
        mode={effective}
        filePath={filePath}
        wrapLines={wrapLines}
      />
    </>
  );
}

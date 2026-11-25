export interface ConflictBlock {
  index: number;
  startLine: number;
  endLine: number;
  rawStart: number;
  rawEnd: number;
  localLabel: string;
  incomingLabel: string;
  baseLabel: string | null;
  localText: string;
  incomingText: string;
  baseText: string | null;
  lineEnding: "\r\n" | "\n";
  hasTrailingNewline: boolean;
}

export type ConflictChoice = "local" | "incoming" | "both";

function splitLinesWithOffsets(text: string): Array<{
  raw: string;
  content: string;
  eol: "\r\n" | "\n" | "";
  start: number;
  end: number;
  lineNumber: number;
}> {
  const result: Array<{
    raw: string;
    content: string;
    eol: "\r\n" | "\n" | "";
    start: number;
    end: number;
    lineNumber: number;
  }> = [];
  let offset = 0;
  let lineNumber = 1;
  while (offset < text.length) {
    const lf = text.indexOf("\n", offset);
    const end = lf === -1 ? text.length : lf + 1;
    const raw = text.slice(offset, end);
    const eol: "\r\n" | "\n" | "" = raw.endsWith("\r\n")
      ? "\r\n"
      : raw.endsWith("\n")
        ? "\n"
        : "";
    const content = eol ? raw.slice(0, raw.length - eol.length) : raw;
    result.push({ raw, content, eol, start: offset, end, lineNumber });
    offset = end;
    lineNumber++;
  }
  return result;
}

export function parseConflictBlocks(text: string): ConflictBlock[] {
  const lines = splitLinesWithOffsets(text);
  const blocks: ConflictBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (/^<{7}(?:\s|$)/.test(line.content)) {
      const localLabel = line.content.slice(7).trim() || "local";
      let baseLine = -1;
      let sepLine = -1;
      let endLine = -1;
      let j = i + 1;
      let nested = false;

      while (j < lines.length) {
        const cur = lines[j].content;
        if (/^<{7}(?:\s|$)/.test(cur)) {
          nested = true;
          break;
        }
        if (/^\|{7}(?:\s|$)/.test(cur) && sepLine === -1 && baseLine === -1) {
          baseLine = j;
        } else if (/^={7}$/.test(cur) && sepLine === -1) {
          sepLine = j;
        } else if (/^>{7}(?:\s|$)/.test(cur) && sepLine !== -1) {
          endLine = j;
          break;
        }
        j++;
      }

      if (!nested && sepLine !== -1 && endLine !== -1) {
        const localSliceEnd = baseLine !== -1 ? baseLine : sepLine;
        const localText = lines
          .slice(i + 1, localSliceEnd)
          .map((item) => item.raw)
          .join("");
        const baseText =
          baseLine !== -1
            ? lines
                .slice(baseLine + 1, sepLine)
                .map((item) => item.raw)
                .join("")
            : null;
        const incomingText = lines
          .slice(sepLine + 1, endLine)
          .map((item) => item.raw)
          .join("");
        const endItem = lines[endLine];
        const eol =
          line.eol === "\r\n" || endItem.eol === "\r\n" ? "\r\n" : "\n";

        blocks.push({
          index: blocks.length,
          startLine: line.lineNumber,
          endLine: endItem.lineNumber,
          rawStart: line.start,
          rawEnd: endItem.end,
          localLabel,
          incomingLabel: endItem.content.slice(7).trim() || "entrante",
          baseLabel:
            baseLine !== -1
              ? lines[baseLine].content.slice(7).trim() || "base"
              : null,
          localText,
          incomingText,
          baseText,
          lineEnding: eol,
          hasTrailingNewline: endItem.eol !== "",
        });
        i = endLine + 1;
        continue;
      }
    }
    i++;
  }

  return blocks;
}

export function resolveConflictBlock(
  text: string,
  blockIndex: number,
  choice: ConflictChoice,
): string {
  const blocks = parseConflictBlocks(text);
  const target = blocks[blockIndex];
  if (!target) return text;

  let replacement =
    choice === "local"
      ? target.localText
      : choice === "incoming"
        ? target.incomingText
        : target.localText + target.incomingText;

  if (!target.hasTrailingNewline) {
    replacement = replacement.replace(/\r?\n$/, "");
  }

  return (
    text.slice(0, target.rawStart) + replacement + text.slice(target.rawEnd)
  );
}

export function hasConflictMarkers(text: string): boolean {
  return /^(?:<{7}(?:\s|$)|\|{7}(?:\s|$)|={7}$|>{7}(?:\s|$))/m.test(text);
}

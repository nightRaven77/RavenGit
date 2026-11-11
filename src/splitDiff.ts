export type DiffCell = {
  number: number;
  text: string;
  kind: "context" | "addition" | "deletion";
};
export type SplitRow =
  | { kind: "meta"; text: string }
  | { kind: "line"; before?: DiffCell; after?: DiffCell };

/** Unified text only; reject unsupported or inconsistent hunks rather than invent line numbers. */
export function splitDiff(text: string): SplitRow[] | null {
  const rows: SplitRow[] = [];
  let oldLine = 0,
    newLine = 0,
    oldLeft = 0,
    newLeft = 0,
    found = false;
  let removed: DiffCell[] = [],
    added: DiffCell[] = [];
  const flush = () => {
    for (let i = 0; i < Math.max(removed.length, added.length); i++)
      rows.push({ kind: "line", before: removed[i], after: added[i] });
    removed = [];
    added = [];
  };
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  for (const line of lines) {
    if (line.startsWith("@@")) {
      if (oldLeft || newLeft) return null;
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(
        line,
      );
      if (!match) return null;
      const numbers = [
        Number(match[1]),
        Number(match[2] ?? 1),
        Number(match[3]),
        Number(match[4] ?? 1),
      ];
      if (!numbers.every(Number.isSafeInteger)) return null;
      if (
        (numbers[0] === 0 && numbers[1] !== 0) ||
        (numbers[2] === 0 && numbers[3] !== 0) ||
        !Number.isSafeInteger(numbers[0] + numbers[1]) ||
        !Number.isSafeInteger(numbers[2] + numbers[3])
      )
        return null;
      flush();
      [oldLine, oldLeft, newLine, newLeft] = numbers;
      found = true;
      rows.push({ kind: "meta", text: line });
      continue;
    }
    if (line === "\\ No newline at end of file") {
      if (!found) return null;
      flush();
      rows.push({ kind: "meta", text: line });
      continue;
    }
    if (oldLeft || newLeft) {
      const prefix = line[0],
        value = line.slice(1);
      if (prefix === "-" && oldLeft > 0) {
        removed.push({ number: oldLine++, text: value, kind: "deletion" });
        oldLeft--;
      } else if (prefix === "+" && newLeft > 0) {
        added.push({ number: newLine++, text: value, kind: "addition" });
        newLeft--;
      } else if (prefix === " " && oldLeft > 0 && newLeft > 0) {
        flush();
        rows.push({
          kind: "line",
          before: { number: oldLine++, text: value, kind: "context" },
          after: { number: newLine++, text: value, kind: "context" },
        });
        oldLeft--;
        newLeft--;
      } else return null;
      continue;
    }
    flush();
    if (
      /^(diff --git |index |--- |\+\+\+ |new file mode |deleted file mode |old mode |new mode |similarity index |dissimilarity index |rename from |rename to |copy from |copy to )/.test(
        line,
      )
    )
      rows.push({ kind: "meta", text: line });
    else return null;
  }
  flush();
  return found && oldLeft === 0 && newLeft === 0 ? rows : null;
}

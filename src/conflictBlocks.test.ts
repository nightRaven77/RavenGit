import { describe, expect, it } from "vitest";
import {
  hasConflictMarkers,
  parseConflictBlocks,
  resolveConflictBlock,
} from "./conflictBlocks";

describe("conflictBlocks", () => {
  it("detecta múltiples bloques estándar y diff3 preservando CRLF", () => {
    const text = [
      "cabecera",
      "<<<<<<< HEAD",
      "local uno",
      "||||||| base",
      "base uno",
      "=======",
      "entrante uno",
      ">>>>>>> branch",
      "intermedio",
      "<<<<<<< local",
      "local dos",
      "=======",
      "entrante dos",
      ">>>>>>> incoming",
      "pie",
      "",
    ].join("\r\n");

    const blocks = parseConflictBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].baseText).toBe("base uno\r\n");
    expect(blocks[0].localText).toBe("local uno\r\n");
    expect(blocks[0].incomingText).toBe("entrante uno\r\n");
    expect(blocks[0].lineEnding).toBe("\r\n");
    expect(blocks[1].baseText).toBeNull();
    expect(blocks[1].startLine).toBe(10);
    expect(blocks[1].endLine).toBe(14);
  });

  it("resuelve un bloque con local, entrante o ambos dejando intactos los demás", () => {
    const sample = [
      "uno",
      "<<<<<<< HEAD",
      "a",
      "=======",
      "b",
      ">>>>>>> feat",
      "dos",
      "<<<<<<< HEAD",
      "c",
      "=======",
      "d",
      ">>>>>>> feat",
      "",
    ].join("\n");

    const step1 = resolveConflictBlock(sample, 0, "both");
    expect(step1).toContain("uno\na\nb\ndos\n<<<<<<< HEAD");
    expect(parseConflictBlocks(step1)).toHaveLength(1);
    expect(hasConflictMarkers(step1)).toBe(true);

    const step2 = resolveConflictBlock(step1, 0, "incoming");
    expect(step2).toBe("uno\na\nb\ndos\nd\n");
    expect(hasConflictMarkers(step2)).toBe(false);
  });

  it("no falla ante marcadores incompletos o sin bloque completo", () => {
    const broken = "<<<<<<< HEAD\nsolo apertura\n";
    expect(parseConflictBlocks(broken)).toEqual([]);
    expect(hasConflictMarkers(broken)).toBe(true);
    expect(resolveConflictBlock(broken, 0, "local")).toBe(broken);
  });
});

import { describe, expect, it } from "vitest";
import type { GraphRow } from "./graph";
import { buildTributaryItems, classifyCommitBucket } from "./historyGroups";
import type { Commit } from "./types";

function makeCommit(hash: string, date: string): Commit {
  return {
    hash,
    parents: [],
    author: "Test Author",
    date,
    subject: `Commit ${hash}`,
  };
}

function makeRow(segments: GraphRow["segments"]): GraphRow {
  return {
    lane: 0,
    color: 0,
    isMerge: false,
    isRoot: false,
    segments,
    width: 2,
  };
}

describe("classifyCommitBucket", () => {
  const now = new Date(2026, 10, 25, 15, 0, 0).getTime();

  it("clasifica fechas de hoy, futuras, de esta semana y anteriores", () => {
    expect(
      classifyCommitBucket(new Date(2026, 10, 25, 0, 5, 0).toISOString(), now),
    ).toBe("today");
    expect(
      classifyCommitBucket(new Date(2026, 10, 26, 10, 0, 0).toISOString(), now),
    ).toBe("today");
    expect(
      classifyCommitBucket(new Date(2026, 10, 23, 12, 0, 0).toISOString(), now),
    ).toBe("week");
    expect(
      classifyCommitBucket(new Date(2026, 10, 19, 0, 0, 0).toISOString(), now),
    ).toBe("week");
    expect(
      classifyCommitBucket(new Date(2026, 10, 15, 12, 0, 0).toISOString(), now),
    ).toBe("earlier");
  });

  it("trata fechas vacías o inválidas como Anterior", () => {
    expect(classifyCommitBucket("", now)).toBe("earlier");
    expect(classifyCommitBucket(undefined, now)).toBe("earlier");
    expect(classifyCommitBucket("no-es-fecha", now)).toBe("earlier");
  });
});

describe("buildTributaryItems", () => {
  const now = new Date(2026, 10, 25, 15, 0, 0).getTime();
  const todayIso = new Date(2026, 10, 25, 12, 0, 0).toISOString();
  const weekIso = new Date(2026, 10, 22, 12, 0, 0).toISOString();
  const earlierIso = new Date(2026, 10, 10, 12, 0, 0).toISOString();

  it("emite separadores Hoy / Esta semana / Anterior y mapea commitToItemIndex", () => {
    const commits = [
      makeCommit("1", todayIso),
      makeCommit("2", weekIso),
      makeCommit("3", earlierIso),
    ];
    const rows = [
      makeRow([]),
      makeRow([{ from: 0, to: 0, kind: "incoming", target: "2", color: 1 }]),
      makeRow([{ from: 0, to: 0, kind: "incoming", target: "3", color: 1 }]),
    ];

    const result = buildTributaryItems(commits, rows, now);
    expect(result.items.map((item) => item.kind)).toEqual([
      "group",
      "commit",
      "group",
      "commit",
      "group",
      "commit",
    ]);
    expect(
      result.items
        .filter((item) => item.kind === "group")
        .map((item) => ({ label: item.label, isFirst: item.isFirst })),
    ).toEqual([
      { label: "Hoy", isFirst: true },
      { label: "Esta semana", isFirst: false },
      { label: "Anterior", isFirst: false },
    ]);
    expect(result.commitToItemIndex).toEqual([1, 3, 5]);
  });

  it("no duplica separadores cuando hay fechas desordenadas por merge o rebase", () => {
    const commits = [
      makeCommit("1", todayIso),
      makeCommit("2", earlierIso),
      makeCommit("3", todayIso),
      makeCommit("4", weekIso),
    ];
    const rows = commits.map(() => makeRow([]));

    const result = buildTributaryItems(commits, rows, now);
    const groupLabels = result.items
      .filter((item) => item.kind === "group")
      .map((item) => item.label);
    expect(groupLabels).toEqual(["Hoy", "Anterior"]);
    expect(result.commitToItemIndex).toEqual([1, 3, 4, 5]);
  });

  it("conserva los carriles incoming y through sin duplicados en el separador", () => {
    const commits = [makeCommit("1", todayIso), makeCommit("2", earlierIso)];
    const rows = [
      makeRow([]),
      makeRow([
        { from: 0, to: 0, kind: "incoming", target: "2", color: 2 },
        { from: 1, to: 1, kind: "through", target: "x", color: 4 },
        { from: 1, to: 2, kind: "through", target: "y", color: 5 },
        { from: 0, to: 1, kind: "parent", target: "p", color: 3 },
      ]),
    ];

    const result = buildTributaryItems(commits, rows, now);
    const secondGroup = result.items[2];
    expect(secondGroup.kind).toBe("group");
    if (secondGroup.kind === "group") {
      expect(secondGroup.isFirst).toBe(false);
      expect(secondGroup.throughLanes).toEqual([
        { lane: 0, color: 2 },
        { lane: 1, color: 4 },
      ]);
    }
  });
});

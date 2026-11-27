import { describe, expect, it } from "vitest";
import { layoutGraph, graphPixelWidth } from "./graph";
import type { Commit } from "./types";
const c = (hash: string, parents: string[]): Commit => ({
  hash,
  parents,
  author: "Fixture",
  date: "2026-10-19",
  subject: hash,
});
describe("topología del grafo", () => {
  it("representa exactamente todos los padres en un merge y los reconecta", () => {
    const commits = [
      c("merge", ["left", "right"]),
      c("left", ["base"]),
      c("right", ["base"]),
      c("base", []),
    ];
    const rows = layoutGraph(commits);
    rows.forEach((row, i) =>
      expect(
        row.segments.filter((s) => s.kind === "parent").map((s) => s.target),
      ).toEqual(commits[i].parents),
    );
    expect(
      rows[0].segments.filter((s) => s.kind === "parent").map((s) => s.to),
    ).toEqual([0, 1]);
    expect(rows[2].lane).toBe(1);
    expect(
      rows[2].segments.some(
        (s) => s.kind === "parent" && s.to === rows[3].lane,
      ),
    ).toBe(true);
    expect(rows.flatMap((r) => r.segments).every((s) => s.to >= 0)).toBe(true);
  });
  it("mantiene el mismo trazado al ampliar una página y conserva padres fuera de carga", () => {
    const commits = [c("a", ["b"]), c("b", ["c"]), c("c", [])];
    expect(layoutGraph(commits.slice(0, 2))).toEqual(
      layoutGraph(commits).slice(0, 2),
    );
    expect(
      layoutGraph(commits.slice(0, 2))[1].segments.slice(-1)[0]?.target,
    ).toBe("c");
  });
  it("conserva tres padres y una raíz desconectada", () => {
    const commits = [
      c("m", ["a", "b", "c"]),
      c("x", []),
      c("a", []),
      c("b", []),
      c("c", []),
    ];
    const rows = layoutGraph(commits);
    expect(rows[0].segments.filter((s) => s.kind === "parent")).toHaveLength(3);
    expect(rows[1].segments.filter((s) => s.kind === "parent")).toHaveLength(0);
    expect(rows.flatMap((r) => r.segments).every((s) => s.to >= 0)).toBe(true);
  });
});

it("calcula el ancho de un millón de filas sin expandir argumentos", () => {
  const rows = Array.from({ length: 1000000 }, (_, i) => ({
    width: i === 999999 ? 9 : 1,
  }));
  expect(graphPixelWidth(rows)).toBe(208);
  expect(graphPixelWidth([])).toBe(92);
  expect(graphPixelWidth(rows, "tributary")).toBe(342);
  expect(graphPixelWidth([], "tributary")).toBe(104);
});

describe("colores y tipos de nodo del grafo", () => {
  it("asigna colores distintos a ramas integradas, identifica merges y raíces, y mantiene color por linaje", () => {
    const commits = [
      c("merge", ["main2", "feat1"]),
      c("feat1", ["base"]),
      c("main2", ["base"]),
      c("base", []),
    ];
    const rows = layoutGraph(commits);
    expect(rows[0].isMerge).toBe(true);
    expect(rows[0].isRoot).toBe(false);
    expect(rows[3].isRoot).toBe(true);
    expect(rows[3].isMerge).toBe(false);
    expect(rows[1].color).not.toBe(rows[0].color);
    expect(rows[2].color).toBe(rows[0].color);
  });

  it("conserva el color de una rama cuando cambia de carril al cerrarse otra rama", () => {
    const commits = [
      c("side_tip", ["side_parent"]),
      c("other_tip", ["other_parent"]),
      c("side_parent", []),
      c("other_parent", []),
    ];
    const rows = layoutGraph(commits);
    expect(rows[0].lane).toBe(0);
    expect(rows[2].lane).toBe(0);
    expect(rows[2].color).toBe(rows[0].color);
    expect(rows[1].lane).toBe(1);
    expect(rows[3].color).toBe(rows[1].color);
    expect(rows[1].color).not.toBe(rows[0].color);
  });
});

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
});

import { describe, expect, it } from "vitest";
import { diffInline, mergeHighlights } from "./intraLineDiff";

describe("intraLineDiff", () => {
  it("resalta únicamente las palabras cambiadas entre dos líneas", () => {
    const res = diffInline(
      'const saludo = "Hola mundo";',
      'const saludo = "Hola RavenGit";',
    );
    expect(res.before.map((s) => s.text).join("")).toBe(
      'const saludo = "Hola mundo";',
    );
    expect(res.after.map((s) => s.text).join("")).toBe(
      'const saludo = "Hola RavenGit";',
    );
    expect(res.before.filter((s) => s.changed).map((s) => s.text)).toEqual([
      "mundo",
    ]);
    expect(res.after.filter((s) => s.changed).map((s) => s.text)).toEqual([
      "RavenGit",
    ]);
  });

  it("omite marcado intra-línea cuando ambas líneas son casi por completo distintas", () => {
    const res = diffInline("aaaaaaaaaaaa", "zzzzzzzzzzzz");
    expect(res.before).toEqual([{ text: "aaaaaaaaaaaa", changed: false }]);
    expect(res.after).toEqual([{ text: "zzzzzzzzzzzz", changed: false }]);
  });

  it("fusiona límites de sintaxis y cambio intra-línea sin perder caracteres", () => {
    const line = "const count = 10 + 2;";
    const inline = diffInline("const count = 5 + 2;", line).after;
    const merged = mergeHighlights(line, "ts", inline);
    expect(merged.map((s) => s.text).join("")).toBe(line);
    expect(merged.some((s) => s.changed && s.text === "10")).toBe(true);
    expect(
      merged.some(
        (s) => !s.changed && s.syntax === "keyword" && s.text === "const",
      ),
    ).toBe(true);
  });
});

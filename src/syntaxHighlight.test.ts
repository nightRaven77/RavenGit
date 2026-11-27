import { describe, expect, it } from "vitest";
import { detectLanguage, tokenizeLine } from "./syntaxHighlight";

describe("syntaxHighlight", () => {
  it("detecta lenguajes por extensión y nombre de archivo", () => {
    expect(detectLanguage("src/App.tsx")).toBe("ts");
    expect(detectLanguage("src-tauri/src/git.rs")).toBe("rust");
    expect(detectLanguage("scripts/build.py")).toBe("python");
    expect(detectLanguage("package.json")).toBe("json");
    expect(detectLanguage("src/themes.css")).toBe("css");
    expect(detectLanguage("Dockerfile")).toBe("shell");
    expect(detectLanguage("README.md")).toBe("markdown");
    expect(detectLanguage("notes.txt")).toBe("plain");
    expect(detectLanguage(null)).toBe("plain");
  });

  it("conserva el texto exacto sin pérdida ni escapes al tokenizar", () => {
    const cases: Array<[string, Parameters<typeof tokenizeLine>[1]]> = [
      [
        'const value: number = foo("hola \\"mundo\\"") + 42; // comentario',
        "ts",
      ],
      [
        "pub fn diff(repo: &Repository) -> Result<()> { /* c */ Ok(()) }",
        "rust",
      ],
      ["def calc(x): # comentario ü\n    return 'abc'", "python"],
      ['{"name": "RavenGit", "version": 1.0}', "json"],
      ["después <script>alert(1)</script>", "html"],
      ["### Título en Markdown", "markdown"],
      ["texto plano sin resaltado <script>", "plain"],
    ];

    for (const [line, lang] of cases) {
      const tokens = tokenizeLine(line, lang);
      expect(tokens.map((t) => t.text).join("")).toBe(line);
    }
  });

  it("identifica palabras clave, cadenas, números, funciones y comentarios", () => {
    const tokens = tokenizeLine(
      'const items = parseList("datos", 12); // fin',
      "ts",
    );
    expect(tokens.find((t) => t.text === "const")?.type).toBe("keyword");
    expect(tokens.find((t) => t.text === "parseList")?.type).toBe("fn");
    expect(tokens.find((t) => t.text === '"datos"')?.type).toBe("string");
    expect(tokens.find((t) => t.text === "12")?.type).toBe("number");
    expect(tokens.find((t) => t.text.startsWith("//"))?.type).toBe("comment");
  });

  it("degrada de forma segura en líneas extremadamente largas", () => {
    const longLine = "const x = " + "a".repeat(2500);
    const tokens = tokenizeLine(longLine, "ts");
    expect(tokens).toEqual([{ text: longLine, type: "plain" }]);
  });
});

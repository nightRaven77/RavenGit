export type SyntaxLanguage =
  | "ts"
  | "js"
  | "rust"
  | "python"
  | "json"
  | "css"
  | "html"
  | "markdown"
  | "shell"
  | "config"
  | "clike"
  | "sql"
  | "plain";

export type SyntaxTokenType =
  | "plain"
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "type"
  | "fn"
  | "punct";

export interface SyntaxToken {
  text: string;
  type: SyntaxTokenType;
}

const EXT_MAP: Record<string, SyntaxLanguage> = {
  ts: "ts",
  tsx: "ts",
  mts: "ts",
  cts: "ts",
  js: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  rs: "rust",
  py: "python",
  pyw: "python",
  json: "json",
  jsonc: "json",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
  htm: "html",
  xml: "html",
  svg: "html",
  md: "markdown",
  mdx: "markdown",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  toml: "config",
  yaml: "config",
  yml: "config",
  ini: "config",
  conf: "config",
  env: "config",
  c: "clike",
  h: "clike",
  cc: "clike",
  cpp: "clike",
  hpp: "clike",
  go: "clike",
  java: "clike",
  kt: "clike",
  kts: "clike",
  swift: "clike",
  cs: "clike",
  sql: "sql",
};

export function detectLanguage(filePath?: string | null): SyntaxLanguage {
  if (!filePath) return "plain";
  const clean = filePath.split(/[?#]/)[0];
  const base = clean.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (base === "makefile" || base === "dockerfile" || base === ".gitignore") {
    return "shell";
  }
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) return "plain";
  const ext = base.slice(dot + 1);
  return EXT_MAP[ext] ?? "plain";
}

const KEYWORDS: Record<Exclude<SyntaxLanguage, "plain">, Set<string>> = {
  ts: new Set([
    "import",
    "export",
    "from",
    "as",
    "default",
    "const",
    "let",
    "var",
    "function",
    "return",
    "if",
    "else",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "break",
    "continue",
    "try",
    "catch",
    "finally",
    "throw",
    "async",
    "await",
    "class",
    "extends",
    "implements",
    "interface",
    "type",
    "enum",
    "readonly",
    "keyof",
    "typeof",
    "new",
    "this",
    "super",
    "in",
    "of",
    "true",
    "false",
    "null",
    "undefined",
    "void",
    "satisfies",
  ]),
  js: new Set([
    "import",
    "export",
    "from",
    "as",
    "default",
    "const",
    "let",
    "var",
    "function",
    "return",
    "if",
    "else",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "break",
    "continue",
    "try",
    "catch",
    "finally",
    "throw",
    "async",
    "await",
    "class",
    "extends",
    "new",
    "this",
    "super",
    "in",
    "of",
    "typeof",
    "instanceof",
    "true",
    "false",
    "null",
    "undefined",
    "void",
    "yield",
  ]),
  rust: new Set([
    "use",
    "mod",
    "pub",
    "crate",
    "super",
    "self",
    "Self",
    "fn",
    "let",
    "mut",
    "const",
    "static",
    "struct",
    "enum",
    "trait",
    "impl",
    "for",
    "in",
    "while",
    "loop",
    "if",
    "else",
    "match",
    "return",
    "break",
    "continue",
    "where",
    "type",
    "async",
    "await",
    "move",
    "ref",
    "unsafe",
    "as",
    "true",
    "false",
  ]),
  python: new Set([
    "import",
    "from",
    "as",
    "def",
    "class",
    "return",
    "yield",
    "if",
    "elif",
    "else",
    "for",
    "in",
    "while",
    "break",
    "continue",
    "pass",
    "try",
    "except",
    "finally",
    "raise",
    "with",
    "lambda",
    "async",
    "await",
    "and",
    "or",
    "not",
    "is",
    "True",
    "False",
    "None",
    "self",
  ]),
  json: new Set(["true", "false", "null"]),
  css: new Set([
    "important",
    "from",
    "to",
    "and",
    "or",
    "not",
    "only",
    "var",
    "calc",
    "min",
    "max",
    "clamp",
  ]),
  html: new Set(["DOCTYPE", "html", "head", "body", "script", "style"]),
  markdown: new Set(),
  shell: new Set([
    "if",
    "then",
    "else",
    "elif",
    "fi",
    "for",
    "in",
    "do",
    "done",
    "case",
    "esac",
    "while",
    "function",
    "return",
    "local",
    "export",
    "readonly",
    "exit",
    "true",
    "false",
  ]),
  config: new Set(["true", "false", "null", "yes", "no", "on", "off"]),
  clike: new Set([
    "package",
    "import",
    "include",
    "func",
    "fun",
    "fn",
    "var",
    "val",
    "const",
    "static",
    "public",
    "private",
    "protected",
    "internal",
    "struct",
    "class",
    "interface",
    "enum",
    "type",
    "return",
    "if",
    "else",
    "for",
    "range",
    "while",
    "switch",
    "case",
    "break",
    "continue",
    "defer",
    "go",
    "select",
    "try",
    "catch",
    "throw",
    "async",
    "await",
    "true",
    "false",
    "null",
    "nil",
    "this",
    "self",
    "new",
    "void",
  ]),
  sql: new Set([
    "SELECT",
    "FROM",
    "WHERE",
    "INSERT",
    "INTO",
    "VALUES",
    "UPDATE",
    "SET",
    "DELETE",
    "CREATE",
    "ALTER",
    "DROP",
    "TABLE",
    "INDEX",
    "JOIN",
    "LEFT",
    "RIGHT",
    "INNER",
    "ON",
    "GROUP",
    "BY",
    "ORDER",
    "ASC",
    "DESC",
    "LIMIT",
    "AND",
    "OR",
    "NOT",
    "NULL",
    "AS",
    "DISTINCT",
    "select",
    "from",
    "where",
    "insert",
    "into",
    "values",
    "update",
    "set",
    "delete",
    "create",
    "alter",
    "drop",
    "table",
    "index",
    "join",
    "left",
    "right",
    "inner",
    "on",
    "group",
    "by",
    "order",
    "asc",
    "desc",
    "limit",
    "and",
    "or",
    "not",
    "null",
    "as",
    "distinct",
  ]),
};

const PRIMITIVE_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "unknown",
  "never",
  "any",
  "usize",
  "isize",
  "u8",
  "u16",
  "u32",
  "u64",
  "i8",
  "i16",
  "i32",
  "i64",
  "f32",
  "f64",
  "bool",
  "str",
  "char",
  "int",
  "float",
  "dict",
  "list",
  "Option",
  "Result",
  "Vec",
  "String",
  "Promise",
  "Record",
  "Partial",
  "ReadonlySet",
  "Set",
  "Map",
  "PathBuf",
  "Path",
]);

function isWordStart(ch: string): boolean {
  return (
    (ch >= "A" && ch <= "Z") ||
    (ch >= "a" && ch <= "z") ||
    ch === "_" ||
    ch === "$"
  );
}

function isWordChar(ch: string): boolean {
  return isWordStart(ch) || (ch >= "0" && ch <= "9");
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isPunct(ch: string): boolean {
  return "{}()[].,:;+-*/=<>!&|?~@#%".includes(ch);
}

function pushToken(
  out: SyntaxToken[],
  text: string,
  type: SyntaxTokenType,
): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === type) {
    last.text += text;
  } else {
    out.push({ text, type });
  }
}

function scanQuoted(text: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length) {
      i += 2;
      continue;
    }
    i++;
    if (ch === quote) break;
  }
  return i;
}

export function tokenizeLine(
  text: string,
  lang: SyntaxLanguage,
): SyntaxToken[] {
  if (!text) return [];
  if (lang === "plain" || text.length > 2000) {
    return [{ text, type: "plain" }];
  }

  const out: SyntaxToken[] = [];
  if (lang === "markdown" && /^\s{0,3}#{1,6}\s/.test(text)) {
    return [{ text, type: "keyword" }];
  }

  const hashComment =
    lang === "python" || lang === "shell" || lang === "config";
  const slashComment =
    lang === "ts" ||
    lang === "js" ||
    lang === "rust" ||
    lang === "clike" ||
    lang === "css" ||
    lang === "json";
  const kwSet = KEYWORDS[lang];

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1] ?? "";

    if (lang === "html" && text.startsWith("<!--", i)) {
      const close = text.indexOf("-->", i + 4);
      const end = close === -1 ? text.length : close + 3;
      pushToken(out, text.slice(i, end), "comment");
      i = end;
      continue;
    }

    if (slashComment && ch === "/" && next === "/") {
      pushToken(out, text.slice(i), "comment");
      break;
    }

    if (slashComment && ch === "/" && next === "*") {
      const close = text.indexOf("*/", i + 2);
      const end = close === -1 ? text.length : close + 2;
      pushToken(out, text.slice(i, end), "comment");
      i = end;
      continue;
    }

    if (lang === "sql" && ch === "-" && next === "-") {
      pushToken(out, text.slice(i), "comment");
      break;
    }

    if (hashComment && ch === "#") {
      const prev = i > 0 ? text[i - 1] : " ";
      if (prev === " " || prev === "\t" || i === 0) {
        pushToken(out, text.slice(i), "comment");
        break;
      }
    }

    if (
      ch === '"' ||
      (ch === "'" && lang !== "rust") ||
      (ch === "`" &&
        (lang === "ts" ||
          lang === "js" ||
          lang === "markdown" ||
          lang === "shell"))
    ) {
      const end = scanQuoted(text, i, ch);
      if (lang === "json") {
        let look = end;
        while (look < text.length && text[look] === " ") look++;
        pushToken(
          out,
          text.slice(i, end),
          text[look] === ":" ? "type" : "string",
        );
      } else {
        pushToken(out, text.slice(i, end), "string");
      }
      i = end;
      continue;
    }

    if (lang === "rust" && ch === "'") {
      // Char literal or lifetime `'a`
      if (next === "\\" || text[i + 2] === "'") {
        const end = scanQuoted(text, i, "'");
        pushToken(out, text.slice(i, end), "string");
        i = end;
        continue;
      }
      if (next && isWordStart(next)) {
        let end = i + 2;
        while (end < text.length && isWordChar(text[end])) end++;
        pushToken(out, text.slice(i, end), "type");
        i = end;
        continue;
      }
    }

    if (lang === "css" && ch === "-" && next === "-") {
      let end = i + 2;
      while (
        end < text.length &&
        (isWordChar(text[end]) || text[end] === "-")
      ) {
        end++;
      }
      pushToken(out, text.slice(i, end), "type");
      i = end;
      continue;
    }

    if (isDigit(ch)) {
      let end = i + 1;
      if (
        ch === "0" &&
        (next === "x" || next === "X" || next === "b" || next === "B")
      ) {
        end++;
        while (end < text.length && /[0-9a-fA-F_]/.test(text[end])) end++;
      } else {
        while (end < text.length && /[0-9._]/.test(text[end])) end++;
      }
      pushToken(out, text.slice(i, end), "number");
      i = end;
      continue;
    }

    if (lang === "css" && ch === "#" && /[0-9a-fA-F]/.test(next)) {
      let end = i + 1;
      while (end < text.length && /[0-9a-fA-F]/.test(text[end])) end++;
      pushToken(out, text.slice(i, end), "number");
      i = end;
      continue;
    }

    if (lang === "css" && ch === "@") {
      let end = i + 1;
      while (
        end < text.length &&
        (isWordChar(text[end]) || text[end] === "-")
      ) {
        end++;
      }
      pushToken(out, text.slice(i, end), "keyword");
      i = end;
      continue;
    }

    if (isWordStart(ch)) {
      let end = i + 1;
      while (end < text.length && isWordChar(text[end])) end++;
      const word = text.slice(i, end);
      let type: SyntaxTokenType = "plain";
      if (kwSet.has(word)) {
        type = "keyword";
      } else if (PRIMITIVE_TYPES.has(word)) {
        type = "type";
      } else if (
        lang === "html" &&
        i > 0 &&
        (text[i - 1] === "<" || (text[i - 1] === "/" && text[i - 2] === "<"))
      ) {
        type = "keyword";
      } else if (text[end] === "(" || (lang === "rust" && text[end] === "!")) {
        type = "fn";
      } else if (
        word.length > 1 &&
        word[0] >= "A" &&
        word[0] <= "Z" &&
        /[a-z]/.test(word)
      ) {
        type = "type";
      }
      pushToken(out, word, type);
      i = end;
      continue;
    }

    if (isPunct(ch)) {
      pushToken(out, ch, "punct");
      i++;
      continue;
    }

    pushToken(out, ch, "plain");
    i++;
  }

  return out;
}

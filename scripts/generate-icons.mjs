import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoot = realpathSync(tmpdir());
const temporary = mkdtempSync(join(temporaryRoot, "ravengit-icons-"));
try {
  const result = spawnSync(
    process.execPath,
    [
      join(root, "node_modules/@tauri-apps/cli/tauri.js"),
      "icon",
      join(root, "public/ravengit.svg"),
      "--output",
      temporary,
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error("No se pudieron generar los iconos de RavenGit.");
  const output = join(root, "src-tauri/icons");
  mkdirSync(output, { recursive: true });
  for (const entry of readdirSync(temporary, { withFileTypes: true })) {
    if (entry.isFile() && /\.(png|ico|icns)$/.test(entry.name)) {
      copyFileSync(join(temporary, entry.name), join(output, entry.name));
    }
  }
} finally {
  if (
    dirname(temporary) !== temporaryRoot ||
    !basename(temporary).startsWith("ravengit-icons-")
  ) {
    throw new Error("No se pudo verificar el directorio temporal de iconos.");
  }
  rmSync(temporary, { recursive: true, force: true });
}

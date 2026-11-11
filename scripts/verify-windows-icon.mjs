import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const icon = readFileSync(resolve(root, "src-tauri/icons/icon.ico"));
const executable = readFileSync(
  resolve(root, process.argv[2] ?? "src-tauri/target/debug/ravengit.exe"),
);
if (
  executable.subarray(0, 2).toString() !== "MZ" ||
  icon.readUInt16LE(2) !== 1
) {
  throw new Error("Se requiere un ejecutable Windows y un ICO válido.");
}
const count = icon.readUInt16LE(4);
if (!count || 6 + count * 16 > icon.length)
  throw new Error("El directorio ICO no es válido.");
for (let index = 0; index < count; index++) {
  const entry = 6 + index * 16;
  const length = icon.readUInt32LE(entry + 8);
  const offset = icon.readUInt32LE(entry + 12);
  const size = icon[entry] || 256;
  if (!length || offset + length > icon.length)
    throw new Error("El contenido ICO no es válido.");
  if (!executable.includes(icon.subarray(offset, offset + length))) {
    throw new Error(
      `El ejecutable no contiene el icono RavenGit de ${size} px. Reconstruye los recursos nativos.`,
    );
  }
  console.log(`RavenGit ${size} px: contenido binario confirmado.`);
}

import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const getPath = (rel) => resolve(root, rel);

function read(rel) {
  return readFileSync(getPath(rel), "utf8");
}

function write(rel, content) {
  writeFileSync(getPath(rel), content, "utf8");
}

function parseSemver(v) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function bump(current, type) {
  const parsed = parseSemver(current);
  assert.ok(parsed, `Versión actual inválida: ${current}`);
  switch (type) {
    case "patch":
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
    case "minor":
      return `${parsed.major}.${parsed.minor + 1}.0`;
    case "major":
      return `${parsed.major + 1}.0.0`;
    default:
      return null;
  }
}

const arg = process.argv[2];
if (!arg) {
  console.error("Uso: node scripts/bump-version.mjs <nueva-version | patch | minor | major>");
  console.error("Ejemplo: npm run version:bump patch");
  console.error("         npm run version:bump 1.0.2");
  process.exit(1);
}

const currentPackage = JSON.parse(read("package.json"));
const currentVersion = currentPackage.version;

let targetVersion = arg;
if (["patch", "minor", "major"].includes(arg.toLowerCase())) {
  targetVersion = bump(currentVersion, arg.toLowerCase());
}

assert.match(
  targetVersion,
  /^\d+\.\d+\.\d+$/,
  `Versión inválida: "${targetVersion}". Debe ser un semver estable X.Y.Z (ej. 1.0.2).`
);

console.log(`Actualizando versión: ${currentVersion} -> ${targetVersion}`);

// 1. package.json
const pkg = JSON.parse(read("package.json"));
pkg.version = targetVersion;
write("package.json", JSON.stringify(pkg, null, 2) + "\n");

// 2. package-lock.json
const lock = JSON.parse(read("package-lock.json"));
lock.version = targetVersion;
if (lock.packages && lock.packages[""]) {
  lock.packages[""].version = targetVersion;
}
write("package-lock.json", JSON.stringify(lock, null, 2) + "\n");

// 3. src-tauri/Cargo.toml
const cargoToml = read("src-tauri/Cargo.toml");
assert.match(
  cargoToml,
  /\[package\][\s\S]*?\r?\nversion\s*=\s*"[^"]+"/,
  "No se encontró el campo version en [package] de Cargo.toml"
);
const updatedCargoToml = cargoToml.replace(
  /(\[package\][\s\S]*?\r?\nversion\s*=\s*")[^"]+(")/,
  `$1${targetVersion}$2`
);
write("src-tauri/Cargo.toml", updatedCargoToml);

// 4. src-tauri/Cargo.lock
const cargoLock = read("src-tauri/Cargo.lock");
assert.match(
  cargoLock,
  /\[\[package\]\]\r?\nname\s*=\s*"ravengit"\r?\nversion\s*=\s*"[^"]+"/,
  "No se encontró el paquete ravengit en Cargo.lock"
);
const updatedCargoLock = cargoLock.replace(
  /(\[\[package\]\]\r?\nname\s*=\s*"ravengit"\r?\nversion\s*=\s*")[^"]+(")/,
  `$1${targetVersion}$2`
);
write("src-tauri/Cargo.lock", updatedCargoLock);

// 5. src-tauri/tauri.conf.json
const tauriConf = JSON.parse(read("src-tauri/tauri.conf.json"));
tauriConf.version = targetVersion;
write("src-tauri/tauri.conf.json", JSON.stringify(tauriConf, null, 2) + "\n");

// 6. docs/releases/<version>.md
const releaseNotesRel = `docs/releases/${targetVersion}.md`;
if (!existsSync(getPath(releaseNotesRel))) {
  const notesTemplate = `# RavenGit ${targetVersion}

Entrega estable para Windows x64 y macOS Apple Silicon.

## Distribución

- Windows: el workflow solicita firma Authenticode para el ejecutable y el instalador mediante SignPath (integración vía API directa / PowerShell).
- macOS: el workflow genera un DMG arm64 con firma ad hoc. La notarización de Apple sigue pendiente de credenciales y configuración de Developer ID.

Los artefactos incluyen licencia, sumas SHA-256 y un manifiesto de entrega. Esta nota no sustituye la validación por plataforma ni publica un release automáticamente.
`;
  write(releaseNotesRel, notesTemplate);
  console.log(`✓ Creada nota de release: ${releaseNotesRel}`);
}

// 7. Validación con check-release.mjs
const check = spawnSync(process.execPath, [getPath("scripts/check-release.mjs")], {
  stdio: "inherit",
});
if (check.status !== 0) {
  console.error("❌ Falló la validación posterior en scripts/check-release.mjs");
  process.exit(check.status ?? 1);
}

console.log(`\n🎉 Versión actualizada con éxito a ${targetVersion} en todos los archivos.`);
console.log(`Para confirmar y etiquetar la versión:`);
console.log(`  git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json docs/releases/${targetVersion}.md`);
console.log(`  git commit -m "chore: bump version a ${targetVersion}"`);
console.log(`  git tag -a v${targetVersion} -m "v${targetVersion}"`);

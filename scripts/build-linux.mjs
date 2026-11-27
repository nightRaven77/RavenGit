import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./check-release.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (path) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));
const base = readJson("src-tauri/tauri.conf.json");
const pkg = readJson("package.json");
const version = pkg.version;

assert.equal(base.bundle.resources["../LICENSE"], "LICENSE");
assert.equal(base.bundle.category, "Development");
assert.ok(base.bundle.linux?.deb, "Se requiere bundle.linux.deb en tauri.conf.json");
assert.ok(
  base.bundle.linux?.appimage,
  "Se requiere bundle.linux.appimage en tauri.conf.json",
);
for (const path of [
  "LICENSE",
  "src-tauri/icons/32x32.png",
  "src-tauri/icons/128x128.png",
  "src-tauri/icons/128x128@2x.png",
]) {
  assert.ok(existsSync(resolve(root, path)), `Falta ${path}`);
}

const args = process.argv.slice(2);
assert.ok(
  args.every((arg) => arg === "--check-config"),
  "Opción no reconocida",
);
if (args.includes("--check-config")) {
  console.log(
    "Configuración Linux (deb/AppImage) comprobada; no es una compilación nativa Linux.",
  );
  process.exit(0);
}

assert.equal(
  process.platform,
  "linux",
  "Ejecuta este comando en Linux (Ubuntu/Debian) con WebKitGTK 4.1.",
);

const env = { ...process.env };
env.CARGO_BUILD_JOBS ??= "2";
env.CARGO_TARGET_DIR = resolve(root, "src-tauri/target");

function run(command, commandArgs, capture = false) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `Falló ${command}; revisa los requisitos de docs/releases/LINUX.md.`,
      { cause: result.error },
    );
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
}

run("git", ["--version"], true);
run("cargo", ["--version"], true);
console.log("Compilando RavenGit para Linux (.deb y .AppImage)...");

run(process.execPath, [
  resolve(root, "node_modules/@tauri-apps/cli/tauri.js"),
  "build",
  "--bundles",
  "deb,appimage",
  "--ci",
  "--",
  "--locked",
]);

const bundle = resolve(env.CARGO_TARGET_DIR, "release/bundle");
const debs = readdirSync(resolve(bundle, "deb")).filter(
  (name) => name.endsWith(".deb") && name.includes(version),
);
const appImages = readdirSync(resolve(bundle, "appimage")).filter(
  (name) => name.endsWith(".AppImage") && name.includes(version),
);
assert.equal(debs.length, 1, "Se requiere exactamente un paquete .deb");
assert.equal(appImages.length, 1, "Se requiere exactamente un paquete .AppImage");

const debPath = resolve(bundle, "deb", debs[0]);
const appImagePath = resolve(bundle, "appimage", appImages[0]);

const delivery = resolve(
  root,
  "state/linux.local",
  version,
  new Date().toISOString().replace(/[:.]/g, "-"),
);
mkdirSync(delivery, { recursive: true });
copyFileSync(debPath, resolve(delivery, debs[0]));
copyFileSync(appImagePath, resolve(delivery, appImages[0]));
copyFileSync(resolve(root, "LICENSE"), resolve(delivery, "LICENSE"));

const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const debHash = sha256(debPath);
const appImageHash = sha256(appImagePath);

writeFileSync(
  resolve(delivery, "SHA256SUMS.txt"),
  `${debHash}  ${debs[0]}\n${appImageHash}  ${appImages[0]}\n`,
);
writeFileSync(
  resolve(delivery, "MANIFEST.json"),
  JSON.stringify(
    {
      version,
      platform: `linux-${process.arch}`,
      commit: run("git", ["rev-parse", "HEAD"], true),
      workingTreeDirty: Boolean(run("git", ["status", "--porcelain"], true)),
      deb: debs[0],
      debSha256: debHash,
      appImage: appImages[0],
      appImageSha256: appImageHash,
      published: false,
      nativeAcceptance: false,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `Paquetes Linux generados:\n- ${debs[0]}\n- ${appImages[0]}\nEntrega y SHA256: ${delivery}`,
);

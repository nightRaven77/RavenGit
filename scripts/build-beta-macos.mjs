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
const beta = readJson("src-tauri/tauri.beta.conf.json");
const mac = readJson("src-tauri/tauri.beta.macos.conf.json");
const version = readJson("package.json").version;
assert.equal(mac.bundle.macOS.signingIdentity, "-", "Se requiere firma ad hoc");
assert.equal(base.bundle.resources["../LICENSE"], "LICENSE");
for (const path of ["LICENSE", "src-tauri/icons/icon.icns"])
  assert.ok(existsSync(resolve(root, path)), `Falta ${path}`);
const args = process.argv.slice(2);
assert.ok(
  args.every((arg) => arg === "--check-config"),
  "Opción no reconocida",
);
if (args.includes("--check-config")) {
  console.log(
    "Configuración macOS arm64/ad hoc comprobada; no es una compilación ni aceptación macOS.",
  );
  process.exit(0);
}
assert.equal(
  process.platform,
  "darwin",
  "Ejecuta este comando en una Mac Apple Silicon.",
);
assert.equal(process.arch, "arm64", "Usa Node arm64 nativo, sin Rosetta.");
const env = { ...process.env };
// This mode never imports certificates or submits notarization credentials.
// Only the child environment changes; keychain and shell settings are untouched.
for (const key of Object.keys(env))
  if (key.startsWith("APPLE_")) delete env[key];
env.APPLE_SIGNING_IDENTITY = "-";
env.CARGO_BUILD_JOBS ??= "2";
env.CARGO_TARGET_DIR = resolve(root, "src-tauri/target");
function run(command, commandArgs, capture = false) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Falló ${command}; revisa los requisitos de docs/releases/MACOS_BETA.md.`,
      { cause: result.error },
    );
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
}
run("/usr/bin/xcode-select", ["-p"], true);
run("/usr/bin/xcrun", ["--find", "clang"], true);
run("git", ["--version"], true);
run("cargo", ["--version"], true);
const target = "aarch64-apple-darwin";
const targets = run("rustup", ["target", "list", "--installed"], true).split(
  /\s+/,
);
assert.ok(
  targets.includes(target),
  `Instala el destino con: rustup target add ${target}`,
);
console.log(
  "Compilando RavenGit Beta para Apple Silicon con firma ad hoc, sin notarización.",
);
run(process.execPath, [
  resolve(root, "node_modules/@tauri-apps/cli/tauri.js"),
  "build",
  "--config",
  resolve(root, "src-tauri/tauri.beta.conf.json"),
  "--config",
  resolve(root, "src-tauri/tauri.beta.macos.conf.json"),
  "--target",
  target,
  "--bundles",
  "app,dmg",
  "--ci",
  "--",
  "--locked",
]);
const bundle = resolve(env.CARGO_TARGET_DIR, target, "release/bundle");
const app = resolve(bundle, "macos", `${beta.productName}.app`);
const plist = resolve(app, "Contents/Info.plist");
const field = (key) =>
  run("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", plist], true);
assert.equal(field("CFBundleIdentifier"), beta.identifier);
assert.equal(field("CFBundleShortVersionString"), version);
const executableName = field("CFBundleExecutable");
assert.ok(!/[\\/]/.test(executableName), "Nombre de ejecutable inesperado");
const executable = resolve(app, "Contents/MacOS", executableName);
assert.equal(run("/usr/bin/lipo", ["-archs", executable], true), "arm64");
run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
const signature = run(
  "/usr/bin/codesign",
  ["--display", "--verbose=4", app],
  true,
);
assert.match(signature, /^Signature=adhoc$/m, "La firma no es ad hoc");
const dmgs = readdirSync(resolve(bundle, "dmg")).filter(
  (name) => name.endsWith(".dmg") && name.includes(version),
);
assert.equal(dmgs.length, 1, "Se requiere exactamente un DMG de esta versión");
const dmg = resolve(bundle, "dmg", dmgs[0]);
run("/usr/bin/hdiutil", ["verify", dmg]);
const delivery = resolve(
  root,
  "state/beta-macos.local",
  version,
  new Date().toISOString().replace(/[:.]/g, "-"),
);
mkdirSync(delivery, { recursive: true });
copyFileSync(dmg, resolve(delivery, dmgs[0]));
copyFileSync(resolve(root, "LICENSE"), resolve(delivery, "LICENSE"));
copyFileSync(
  resolve(root, "docs/releases/MACOS_BETA.md"),
  resolve(delivery, "LEEME.md"),
);
const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const hash = sha256(dmg);
writeFileSync(resolve(delivery, "SHA256SUMS.txt"), `${hash}  ${dmgs[0]}\n`);
writeFileSync(
  resolve(delivery, "manifest.json"),
  JSON.stringify(
    {
      version,
      platform: "macos-arm64",
      commit: run("git", ["rev-parse", "HEAD"], true),
      workingTreeDirty: Boolean(run("git", ["status", "--porcelain"], true)),
      signing: "ad-hoc",
      notarized: false,
      published: false,
      nativeAcceptance: false,
      app,
      executableSha256: sha256(executable),
      dmg: dmgs[0],
      dmgSha256: hash,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Aplicación verificada: ${app}\nEntrega y SHA256: ${delivery}\nInstalación y arranque en tu Mac todavía pendientes.`,
);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const version = json("package.json").version;
assert.match(
  version,
  /^\d+\.\d+\.\d+-beta\.[1-9]\d*$/,
  "Se requiere una versión beta explícita",
);
const lock = json("package-lock.json");
const cargo = read("src-tauri/Cargo.toml").match(
  /\[package\][\s\S]*?\nversion = "([^"]+)"/,
);
const cargoLock = read("src-tauri/Cargo.lock").match(
  /\[\[package\]\]\r?\nname = "ravengit"\r?\nversion = "([^"]+)"/,
);
for (const [name, actual] of [
  ["package-lock", lock.version],
  ["package-lock raíz", lock.packages[""].version],
  ["Cargo.toml", cargo?.[1]],
  ["Cargo.lock", cargoLock?.[1]],
  ["Tauri", json("src-tauri/tauri.conf.json").version],
])
  assert.equal(actual, version, `Versión incoherente en ${name}`);
const base = json("src-tauri/tauri.conf.json");
const beta = json("src-tauri/tauri.beta.conf.json");
assert.notEqual(
  beta.identifier,
  base.identifier,
  "La beta debe usar un perfil independiente",
);
assert.notEqual(
  beta.productName,
  base.productName,
  "La beta debe identificarse en el instalador",
);
assert.ok(
  beta.app.windows[0].title.includes(version),
  "El título debe identificar la beta exacta",
);
assert.equal(beta.bundle.windows.nsis.installMode, "currentUser");
console.log(
  `Versiones coherentes: ${version}. Beta con nombre y perfil independientes.`,
);

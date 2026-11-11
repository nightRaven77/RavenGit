import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { windowsBuildEnvironment } from "./windows-toolchain.mjs";
import "./check-release.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const env = windowsBuildEnvironment();
env.CARGO_BUILD_JOBS ??= "2";
const clippy = process.argv.includes("--clippy");
const result = spawnSync(
  clippy ? "cargo" : process.execPath,
  clippy
    ? [
        "clippy",
        "--locked",
        "--manifest-path",
        "src-tauri/Cargo.toml",
        "--all-targets",
        "--",
        "-D",
        "warnings",
      ]
    : [
        resolve(root, "node_modules/@tauri-apps/cli/tauri.js"),
        "build",
        "--config",
        resolve(root, "src-tauri/tauri.beta.conf.json"),
        ...(process.argv.includes("--no-bundle")
          ? ["--no-bundle", "--no-sign"]
          : ["--bundles", "nsis"]),
        "--ci",
      ],
  { cwd: root, env, stdio: "inherit", windowsHide: true },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

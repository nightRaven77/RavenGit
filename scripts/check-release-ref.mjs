import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function checkReleaseRef({ eventName, ref, defaultBranch, version }) {
  assert.ok(defaultBranch, "Falta la rama predeterminada");
  if (eventName === "workflow_dispatch") {
    assert.equal(
      ref,
      `refs/heads/${defaultBranch}`,
      "La ejecución manual requiere la rama predeterminada",
    );
    return "manual";
  }
  assert.equal(eventName, "push", "Evento de entrega no permitido");
  assert.match(
    ref ?? "",
    /^refs\/tags\/v\d+\.\d+\.\d+$/,
    "Se requiere un tag estable vX.Y.Z",
  );
  assert.equal(
    ref,
    `refs/tags/v${version}`,
    "El tag no coincide con la versión del proyecto",
  );
  return "tag";
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await import("./check-release.mjs");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const version = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  ).version;
  const defaultBranch = process.env.RELEASE_DEFAULT_BRANCH;
  const ref = process.env.GITHUB_REF;
  const mode = checkReleaseRef({
    eventName: process.env.GITHUB_EVENT_NAME,
    ref,
    defaultBranch,
    version,
  });
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  if (mode === "tag") {
    assert.equal(
      git(["rev-parse", "--verify", `${ref}^{commit}`]),
      git(["rev-parse", "HEAD"]),
      "El checkout no coincide con el tag",
    );
  }
  // fetch-depth: 0 is required by both workflows. Do not fetch or mutate refs here.
  try {
    git([
      "merge-base",
      "--is-ancestor",
      "HEAD",
      `refs/remotes/origin/${defaultBranch}`,
    ]);
  } catch {
    throw new Error(
      "El commit no está en la historia de la rama predeterminada, o falta el historial completo",
    );
  }
  console.log(
    `Referencia de entrega verificada (${mode}): versión ${version}, commit integrado en la rama predeterminada.`,
  );
}

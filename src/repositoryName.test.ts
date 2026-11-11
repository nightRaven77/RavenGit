import { expect, it } from "vitest";
import { suggestedRepositoryName } from "./repositoryName";
it.each([
  ["https://github.com/equipo/repo.git", "repo"],
  ["git@gitlab.com:equipo/repo.git", "repo"],
  ["ssh://git@host:2222/equipo/repo.git", "repo"],
  ["https://host/equipo/Proyecto%20%C3%BC.git/", "Proyecto ü"],
  ["C:\\repos\\proyecto.git", "proyecto"],
  ["/tmp/repos/proyecto", "proyecto"],
  ["file:///C:/repos/proyecto.git", "proyecto"],
  ["https://host/CON.git", "_CON"],
  ["https://host/a%2Fb.git", "a-b"],
  ["https://host/", ""],
  ["texto sin ruta", ""],
  ["", ""],
])("sugiere una carpeta segura para %s", (url, name) =>
  expect(suggestedRepositoryName(url)).toBe(name),
);

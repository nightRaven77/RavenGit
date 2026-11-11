import { expect, it } from "vitest";
import { sshHost, withSshHost } from "./sshAccounts";
it("aplica alias SSH conservando usuario, puerto y ruta", () => {
  expect(withSshHost("git@gitlab.com:equipo/repo.git", "gitlab-trabajo")).toBe(
    "git@gitlab-trabajo:equipo/repo.git",
  );
  expect(
    withSshHost("ssh://git@gitea.local:2222/equipo/repo.git", "gitea-trabajo"),
  ).toBe("ssh://git@gitea-trabajo:2222/equipo/repo.git");
  expect(sshHost("git@github-personal:yo/repo.git")).toBe("github-personal");
});
it.each([
  "https://github.com/yo/repo",
  "C:/repo",
  "file:///tmp/repo",
  "ssh://git:secreto@host/repo",
  "ssh://host/repo?token=secreto",
])("no transforma transporte no SSH o con secretos: %s", (value) => {
  expect(sshHost(value)).toBeNull();
  expect(() => withSshHost(value, "alias")).toThrow();
});
it.each(["-proxy", "alias -i clave", "alias\ncommand", "https://host"])(
  "rechaza alias con opciones o comandos: %s",
  (host) => {
    expect(() => withSshHost("git@host:e/r.git", host)).toThrow();
  },
);

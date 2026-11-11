// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import SshAccountsPanel from "./SshAccountsPanel";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const api = vi.mocked(invoke);
afterEach(() => {
  cleanup();
  api.mockReset();
  vi.restoreAllMocks();
});
const profile = {
  label: "GitLab trabajo",
  provider: "GitLab",
  host: "gitlab-trabajo",
};
function mount(trusted = true) {
  const onApply = vi.fn(),
    onLock = vi.fn();
  render(
    <SshAccountsPanel
      repoId="fixture"
      trusted={trusted}
      disabled={false}
      fetchUrl="git@gitlab.com:e/r.git"
      pushUrl=""
      onApply={onApply}
      onLock={onLock}
    />,
  );
  return { onApply, onLock };
}

it.each([
  {
    agent: { client: "ssh", status: "empty", identities: 0 },
    text: "El agente no tiene identidades cargadas.",
    status: "empty",
    count: 0,
  },
  {
    agent: { client: "ssh", status: "unavailable", identities: null },
    text: "No se pudo consultar el agente.",
    status: "unavailable",
    count: null,
  },
  {
    agent: null,
    text: "No se pudo determinar el cliente o agente SSH.",
    status: "unavailable",
    count: null,
  },
])(
  "diagnostica $status sin helpers sin prometer acceso y conserva la copia sanitizada",
  async ({ agent, text, status, count }) => {
    const user = userEvent.setup();
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();
    api.mockImplementation(async (command) => {
      if (command === "read_ssh_accounts")
        return { token: "one", profiles: [] };
      if (command === "read_authentication_status")
        return { agent, credentialHelperEntries: false };
      throw new Error("No se permite conectar en esta prueba");
    });
    const { onApply, onLock } = mount();
    await user.click(screen.getByText("Cuentas SSH y agente"));
    await user.click(
      screen.getByRole("button", { name: "Diagnóstico de autenticación" }),
    );
    await screen.findByText((value) => value.startsWith(text));
    expect(screen.getByText(/HTTPS: no se encontraron entradas/)).toBeTruthy();
    expect(screen.getByText(/no confirma identidad ni permisos/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Copiar diagnóstico sin secretos" }),
    );
    const copied = JSON.parse(write.mock.calls[0][0]);
    expect(copied).toMatchObject({
      sshAgent: status,
      sshIdentities: count,
      credentialHelperEntries: false,
      authenticatedIdentityVerified: false,
      repositoryPermissionsVerified: false,
    });
    expect(onLock.mock.calls.map(([locked]) => locked)).toEqual([true, false]);
    expect(onApply).not.toHaveBeenCalled();
    expect(
      api.mock.calls.every(([command]) =>
        ["read_ssh_accounts", "read_authentication_status"].includes(command),
      ),
    ).toBe(true);
  },
);

it("retira el diagnóstico previo si la consulta falla y permite recuperar con una nueva lectura", async () => {
  let fail = false;
  api.mockImplementation(async (command) => {
    if (command === "read_ssh_accounts") return { token: "one", profiles: [] };
    if (fail)
      throw {
        code: "AUTH_DIAGNOSTIC",
        message: "No se pudo leer la configuración local de autenticación.",
      };
    return { agent: null, credentialHelperEntries: false };
  });
  const { onLock } = mount();
  await userEvent.click(screen.getByText("Cuentas SSH y agente"));
  const query = screen.getByRole("button", {
    name: "Diagnóstico de autenticación",
  });
  await userEvent.click(query);
  await screen.findByRole("button", {
    name: "Copiar diagnóstico sin secretos",
  });
  fail = true;
  await userEvent.click(query);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "No se pudo leer",
  );
  expect(
    screen.queryByRole("region", {
      name: "Diagnóstico local de autenticación",
    }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Copiar diagnóstico sin secretos" }),
  ).toBeNull();
  expect((query as HTMLButtonElement).disabled).toBe(false);
  fail = false;
  await userEvent.click(query);
  await screen.findByRole("button", {
    name: "Copiar diagnóstico sin secretos",
  });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(onLock.mock.calls.map(([locked]) => locked)).toEqual([
    true,
    false,
    true,
    false,
    true,
    false,
  ]);
});

it("copia sólo diagnóstico acotado sin rutas, URLs ni identidad autenticada", async () => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  api.mockImplementation(async (command) => {
    if (command === "read_ssh_accounts")
      return { token: "one", profiles: [profile] };
    if (command === "read_authentication_status")
      return {
        agent: {
          client: "C:/private-user/ssh.exe",
          status: "available",
          identities: 7,
        },
        credentialHelperEntries: true,
      };
    throw new Error("Unexpected command");
  });
  mount();
  await user.click(screen.getByText("Cuentas SSH y agente"));
  await user.click(
    screen.getByRole("button", { name: "Diagnóstico de autenticación" }),
  );
  await screen.findByText(/HTTPS: hay entradas/);
  await user.click(
    screen.getByRole("button", { name: "Copiar diagnóstico sin secretos" }),
  );
  const copied = write.mock.calls[0][0];
  expect(JSON.parse(copied)).toEqual({
    schema: 1,
    scope: "local-authentication",
    downloadTransport: "SSH",
    publicationTransport: "SSH",
    sshAgent: "available",
    sshIdentities: 7,
    credentialHelperEntries: true,
    authenticatedIdentityVerified: false,
    repositoryPermissionsVerified: false,
  });
  expect(copied).not.toMatch(
    /private-user|gitlab.com|gitlab-trabajo|GitLab trabajo/,
  );
  write.mockRejectedValueOnce(new Error("private clipboard details"));
  await user.click(
    screen.getByRole("button", { name: "Copiar diagnóstico sin secretos" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "No se pudo copiar",
  );
  expect(screen.queryByText(/private clipboard details/)).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Consultar agente SSH" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Copiar diagnóstico sin secretos" }),
    ).toBeNull(),
  );
});

it("descarta respuestas tardías al cambiar el destino y bloquea diagnóstico sin confianza", async () => {
  let finish!: (value: {
    agent: null;
    credentialHelperEntries: boolean;
  }) => void;
  api.mockImplementation(async (command) => {
    if (command === "read_ssh_accounts") return { token: "one", profiles: [] };
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const props = {
    repoId: "fixture",
    trusted: true,
    disabled: false,
    fetchUrl: "https://first.invalid/r.git",
    pushUrl: "",
    onApply: vi.fn(),
    onLock: vi.fn(),
  };
  const view = render(<SshAccountsPanel {...props} />);
  await userEvent.click(screen.getByText("Cuentas SSH y agente"));
  await userEvent.click(
    screen.getByRole("button", { name: "Diagnóstico de autenticación" }),
  );
  view.rerender(
    <SshAccountsPanel
      {...props}
      fetchUrl="https://second.invalid/r.git"
      trusted={false}
    />,
  );
  await act(async () => {
    finish({ agent: null, credentialHelperEntries: true });
  });
  expect(
    screen.queryByRole("region", {
      name: "Diagnóstico local de autenticación",
    }),
  ).toBeNull();
  expect(
    (
      screen.getByRole("button", {
        name: "Diagnóstico de autenticación",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    api.mock.calls.filter(([c]) => c === "read_authentication_status"),
  ).toHaveLength(1);
});
it("guarda metadatos revisados sin conectar ni aplicar el perfil al remoto", async () => {
  api.mockImplementation(async (command) =>
    command === "read_ssh_accounts"
      ? { token: "before", profiles: [] }
      : { token: "after", profiles: [profile] },
  );
  const { onApply } = mount();
  expect(api).not.toHaveBeenCalled();
  await userEvent.click(screen.getByText("Cuentas SSH y agente"));
  await userEvent.type(
    await screen.findByLabelText("Nombre de cuenta"),
    profile.label,
  );
  await userEvent.selectOptions(screen.getByLabelText("Proveedor"), "GitLab");
  await userEvent.type(screen.getByLabelText("Host o alias SSH"), profile.host);
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar perfil SSH" }),
  );
  await screen.findByText(/Perfiles guardados/);
  expect(api).toHaveBeenCalledWith("save_ssh_accounts", {
    token: "before",
    profiles: [profile],
  });
  expect(onApply).not.toHaveBeenCalled();
  expect(
    api.mock.calls.every(([c]) =>
      ["read_ssh_accounts", "save_ssh_accounts"].includes(c),
    ),
  ).toBe(true);
});
it("consulta agente sólo explícitamente y no confunde disponibilidad con acceso remoto", async () => {
  api.mockImplementation(async (command) =>
    command === "read_ssh_accounts"
      ? { token: "before", profiles: [profile] }
      : { client: "ssh", status: "available", identities: 2 },
  );
  const { onApply } = mount();
  await userEvent.click(screen.getByText("Cuentas SSH y agente"));
  await screen.findByText(profile.label, { selector: "strong" });
  expect(api.mock.calls.some(([c]) => c === "read_ssh_agent")).toBe(false);
  await userEvent.click(
    screen.getByRole("button", { name: "Consultar agente SSH" }),
  );
  await screen.findByText("Agente accesible: 2 identidades cargadas.");
  expect(
    screen.getByText(/Esto no confirma permisos ni la cuenta remota/),
  ).toBeTruthy();
  await userEvent.selectOptions(
    screen.getByLabelText("Aplicar perfil a"),
    "push",
  );
  await userEvent.click(
    screen.getByRole("button", { name: `Revisar uso de ${profile.label}` }),
  );
  expect(onApply).toHaveBeenCalledWith(profile, "push");
});
it("sin confianza no consulta el cliente configurado y conserva el error de guardado obsoleto", async () => {
  api.mockImplementation(async (command) => {
    if (command === "read_ssh_accounts")
      return { token: "old", profiles: [profile] };
    throw { message: "Los perfiles cambiaron. Actualiza antes de guardar." };
  });
  mount(false);
  await userEvent.click(screen.getByText("Cuentas SSH y agente"));
  await screen.findByText(profile.label, { selector: "strong" });
  expect(
    (
      screen.getByRole("button", {
        name: "Consultar agente SSH",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await userEvent.click(
    screen.getByRole("button", { name: `Editar perfil ${profile.label}` }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar perfil SSH" }),
  );
  await screen.findByRole("alert");
  expect(
    (screen.getByLabelText("Nombre de cuenta") as HTMLInputElement).value,
  ).toBe(profile.label);
  await waitFor(() =>
    expect(screen.queryByText(/Perfiles guardados/)).toBeNull(),
  );
});

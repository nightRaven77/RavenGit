import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  sshHost,
  type SshAccounts as Accounts,
  type SshProfile,
} from "./sshAccounts";
import { emitOperation, nextOperationId } from "./operations";
type Props = {
  repoId: string;
  trusted: boolean;
  disabled: boolean;
  fetchUrl: string;
  pushUrl: string;
  onApply: (
    profile: SshProfile,
    destination: "fetch" | "push" | "both",
  ) => void;
  onLock: (locked: boolean) => void;
};
const blank: SshProfile = { label: "", provider: "GitHub", host: "" };
type AgentStatus = {
  client: string;
  status: string;
  identities: number | null;
};
type AuthenticationStatus = {
  agent: AgentStatus | null;
  credentialHelperEntries: boolean;
};
const transport = (url: string) =>
  sshHost(url) ? "SSH" : url.startsWith("https://") ? "HTTPS" : "Otro";
const message = (e: unknown) =>
  typeof e === "object" && e && "message" in e
    ? String(e.message)
    : "No se pudo completar la consulta. Actualiza antes de repetir.";
export default function SshAccountsPanel({
  repoId,
  trusted,
  disabled,
  fetchUrl,
  pushUrl,
  onApply,
  onLock,
}: Props) {
  const [accounts, setAccounts] = useState<Accounts | null>(null);
  const [draft, setDraft] = useState(blank),
    [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [destination, setDestination] = useState<"fetch" | "push" | "both">(
    "fetch",
  );
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [diagnostic, setDiagnostic] = useState<AuthenticationStatus | null>(
    null,
  );
  const diagnosticRequest = useRef(0);
  useEffect(() => {
    diagnosticRequest.current++;
    setDiagnostic(null);
    setAgent(null);
    setNotice("");
    return () => {
      diagnosticRequest.current++;
    };
  }, [repoId, fetchUrl, pushUrl, trusted]);
  const flight = useRef(false),
    request = useRef(0);
  async function readAuthentication() {
    if (flight.current || disabled || !trusted) return;
    flight.current = true;
    const seq = ++diagnosticRequest.current;
    setBusy(true);
    onLock(true);
    setError("");
    setNotice("");
    setDiagnostic(null);
    try {
      const next = await invoke<AuthenticationStatus>(
        "read_authentication_status",
        { id: repoId },
      );
      if (seq === diagnosticRequest.current) {
        setDiagnostic(next);
        setAgent(next.agent);
      }
    } catch (e) {
      if (seq === diagnosticRequest.current) setError(message(e));
    } finally {
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }
  async function copyDiagnostic() {
    if (!diagnostic || disabled || busy || !trusted) return;
    const seq = diagnosticRequest.current;
    setError("");
    setNotice("");
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            schema: 1,
            scope: "local-authentication",
            downloadTransport: transport(fetchUrl),
            publicationTransport: transport(pushUrl || fetchUrl),
            sshAgent: diagnostic.agent?.status ?? "unavailable",
            sshIdentities: diagnostic.agent?.identities ?? null,
            credentialHelperEntries: diagnostic.credentialHelperEntries,
            authenticatedIdentityVerified: false,
            repositoryPermissionsVerified: false,
          },
          null,
          2,
        ),
      );
      if (seq === diagnosticRequest.current)
        setNotice(
          "Diagnóstico copiado sin URLs, rutas, perfiles, claves ni credenciales.",
        );
    } catch {
      if (seq === diagnosticRequest.current)
        setError(
          "No se pudo copiar el diagnóstico al portapapeles. Puedes volver a intentarlo.",
        );
    }
  }
  async function load() {
    const seq = ++request.current;
    setError("");
    try {
      const next = await invoke<Accounts>("read_ssh_accounts");
      if (seq === request.current) setAccounts(next);
    } catch (e) {
      if (seq === request.current) {
        setError(message(e));
        setAccounts(null);
      }
    }
  }
  useEffect(() => {
    return () => {
      request.current++;
    };
  }, []);
  async function run(profiles?: SshProfile[]) {
    if (flight.current || disabled || (profiles && !accounts)) return;
    flight.current = true;
    const context = diagnosticRequest.current;
    setBusy(true);
    onLock(true);
    setError("");
    setNotice("");
    const operationId = profiles ? nextOperationId() : "";
    if (profiles)
      emitOperation({
        id: operationId,
        operation: "sshAccounts",
        status: "progress",
        title: "Guardando perfiles SSH…",
        message: "No se modificarán claves, agente ni configuración SSH.",
        repoId,
      });
    try {
      if (profiles) {
        const next = await invoke<Accounts>("save_ssh_accounts", {
          token: accounts!.token,
          profiles,
        });
        setAccounts(next);
        setDraft(blank);
        setEditing(null);
        setNotice("Perfiles guardados en este equipo. Git y SSH se conservan.");
        emitOperation({
          id: operationId,
          operation: "sshAccounts",
          status: "confirmed",
          title: "Perfiles SSH guardados",
          message: "Git, claves, agente y configuración SSH se conservaron.",
          repoId,
        });
      } else {
        setDiagnostic(null);
        setAgent(null);
        const next = await invoke<AgentStatus>("read_ssh_agent", {
          id: repoId,
        });
        if (context === diagnosticRequest.current) setAgent(next);
      }
    } catch (e) {
      const detail = message(e);
      setError(detail);
      if (profiles)
        emitOperation({
          id: operationId,
          operation: "sshAccounts",
          status: "error",
          title: "Perfiles SSH no guardados",
          message: detail,
          repoId,
        });
    } finally {
      flight.current = false;
      setBusy(false);
      onLock(false);
    }
  }
  const locked = busy || disabled;
  return (
    <details
      className="ssh-accounts"
      onToggle={(e) => {
        if (e.currentTarget.open && !accounts) void load();
      }}
    >
      <summary>Cuentas SSH y agente</summary>
      <p>
        El agente del sistema aporta las claves. Cada perfil identifica un host
        o alias de tu configuración SSH; el nombre de cuenta es una etiqueta
        declarada, no una identidad autenticada.
      </p>
      <p>
        Para varias cuentas del mismo proveedor, utiliza alias distintos en
        ~/.ssh/config con IdentityFile e IdentitiesOnly. No se modifican tus
        claves, agente ni known_hosts.
      </p>
      {error && (
        <p role="alert" className="banner error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="banner notice">
          {notice}
        </p>
      )}
      <button
        type="button"
        className="button"
        disabled={locked}
        onClick={() => void load()}
      >
        Actualizar perfiles
      </button>
      <button
        type="button"
        className="button"
        disabled={locked || !trusted}
        onClick={() => void run()}
      >
        Consultar agente SSH
      </button>
      <button
        type="button"
        className="button"
        disabled={locked || !trusted}
        onClick={() => void readAuthentication()}
      >
        Diagnóstico de autenticación
      </button>
      {diagnostic && (
        <section aria-label="Diagnóstico local de autenticación">
          <h3>Autenticación del destino</h3>
          <p>
            Descarga: {transport(fetchUrl)} · Publicación:{" "}
            {transport(pushUrl || fetchUrl)}.
          </p>
          <p role="status">
            {diagnostic.credentialHelperEntries
              ? "HTTPS: hay entradas de credential helper en Git. Pueden ser específicas de otro host o estar restablecidas por una entrada vacía; no confirma credenciales disponibles."
              : "HTTPS: no se encontraron entradas de credential helper. Git puede disponer de otros mecanismos; no se consultaron credenciales."}
          </p>
          {!diagnostic.agent && (
            <p>
              No se pudo determinar el cliente o agente SSH. Revisa su
              configuración desde tu sistema.
            </p>
          )}
          <p>
            SSH utiliza OpenSSH y consulta el agente según tu configuración;
            también puede usar identidades en archivos. Para cuentas distintas,
            configura un alias por cuenta desde tu sistema y revisa su
            aplicación al remoto. HTTPS utiliza los mecanismos de Git; configura
            o inicia sesión desde tu terminal o gestor de credenciales.
          </p>
          <p>
            Esta consulta es local: no ejecuta helpers de credenciales, no
            inicia sesión y no confirma identidad ni permisos. Comprobar acceso
            consulta lectura; los permisos de publicación requieren su propia
            revisión.
          </p>
          <button
            type="button"
            className="button"
            disabled={locked || !trusted}
            onClick={() => void copyDiagnostic()}
          >
            Copiar diagnóstico sin secretos
          </button>
        </section>
      )}
      {agent && (
        <section aria-label="Estado del agente SSH">
          <p>
            Cliente seleccionado: <code>{agent.client}</code>
          </p>
          <p role="status">
            {agent.status === "available"
              ? `Agente accesible: ${agent.identities} identidades cargadas.`
              : agent.status === "empty"
                ? "El agente no tiene identidades cargadas."
                : "No se pudo consultar el agente. Comprueba que esté disponible y que las claves estén cargadas desde tu sistema."}
          </p>
          <p>
            Consulta local del agente heredado mediante ssh-add, sin conectar al
            proveedor. IdentityAgent de un host puede elegir otro agente. Esto
            no confirma permisos ni la cuenta remota; usa Comprobar acceso
            después de revisar el destino.
          </p>
        </section>
      )}
      {accounts && (
        <>
          <label>
            Aplicar perfil a
            <select
              value={destination}
              disabled={locked}
              onChange={(e) =>
                setDestination(e.target.value as typeof destination)
              }
            >
              <option value="fetch">Descarga</option>
              <option value="push">Publicación</option>
              <option value="both">Descarga y publicación</option>
            </select>
          </label>
          <ul aria-label="Perfiles SSH guardados">
            {accounts.profiles.map((profile) => (
              <li key={profile.host}>
                <strong>{profile.label}</strong> · {profile.provider} ·{" "}
                <code>{profile.host}</code>
                {sshHost(fetchUrl)?.toLowerCase() ===
                  profile.host.toLowerCase() && (
                  <span> · Host de descarga coincidente</span>
                )}
                {sshHost(pushUrl || fetchUrl)?.toLowerCase() ===
                  profile.host.toLowerCase() && (
                  <span> · Host de publicación coincidente</span>
                )}
                <button
                  type="button"
                  className="button"
                  disabled={
                    locked ||
                    !trusted ||
                    !(destination === "push"
                      ? sshHost(pushUrl || fetchUrl)
                      : destination === "both"
                        ? sshHost(fetchUrl) && sshHost(pushUrl || fetchUrl)
                        : sshHost(fetchUrl))
                  }
                  onClick={() => onApply(profile, destination)}
                >
                  Revisar uso de {profile.label}
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={locked}
                  onClick={() => {
                    setEditing(profile.host);
                    setDraft(profile);
                  }}
                >
                  Editar perfil {profile.label}
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={locked}
                  onClick={() =>
                    void run(
                      accounts.profiles.filter((p) => p.host !== profile.host),
                    )
                  }
                >
                  Quitar perfil {profile.label}
                </button>
              </li>
            ))}
          </ul>
          {!accounts.profiles.length && (
            <p>Aún no hay perfiles SSH guardados.</p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run([
                ...accounts.profiles.filter((p) => p.host !== editing),
                draft,
              ]);
            }}
          >
            <h3>{editing ? "Editar perfil SSH" : "Añadir perfil SSH"}</h3>
            <label>
              Nombre de cuenta
              <input
                required
                maxLength={100}
                disabled={locked}
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="GitLab · trabajo"
              />
            </label>
            <label>
              Proveedor
              <select
                disabled={locked}
                value={draft.provider}
                onChange={(e) =>
                  setDraft({ ...draft, provider: e.target.value })
                }
              >
                {["GitHub", "GitLab", "Gitea", "Bitbucket", "Otro"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Host o alias SSH
              <input
                required
                maxLength={253}
                pattern="[a-zA-Z0-9][a-zA-Z0-9._-]*"
                disabled={locked}
                value={draft.host}
                onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                placeholder="gitlab-trabajo"
              />
            </label>
            <button className="button" disabled={locked}>
              Guardar perfil SSH
            </button>
            {editing && (
              <button
                type="button"
                className="button"
                disabled={locked}
                onClick={() => {
                  setEditing(null);
                  setDraft(blank);
                }}
              >
                Cancelar edición de perfil
              </button>
            )}
          </form>
          <p>
            Usar un perfil abre la revisión del remoto; guardar el perfil por sí
            solo no cambia destinos ni conecta con servidores. Para HTTPS se
            conserva el helper de Git.
          </p>
        </>
      )}
    </details>
  );
}

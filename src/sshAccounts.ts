export type SshProfile = { label: string; provider: string; host: string };
export type SshAccounts = { token: string; profiles: SshProfile[] };
export function sshHost(value: string): string | null {
  if (value.startsWith("ssh://")) {
    try {
      const url = new URL(value);
      return url.password || url.search || url.hash ? null : url.hostname;
    } catch {
      return null;
    }
  }
  if (value.includes("://") || /^[a-zA-Z]:[\\/]/.test(value)) return null;
  return /^(?:[^@/:\s]+@)?([a-zA-Z0-9._-]+):[^\s]+$/.exec(value)?.[1] ?? null;
}
export function withSshHost(value: string, host: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,252}$/.test(host) || !sshHost(value))
    throw new Error(
      "El perfil sólo se aplica a una URL SSH existente. Revisa el host o alias.",
    );
  if (value.startsWith("ssh://")) {
    const url = new URL(value);
    if (url.password || url.search || url.hash)
      throw new Error("La URL SSH no debe incluir secretos ni parámetros.");
    url.hostname = host;
    return url.toString();
  }
  return value.replace(/^((?:[^@/:\s]+@)?)[^:]+:/, `$1${host}:`);
}

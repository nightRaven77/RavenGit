import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

// Use only the child process environment. Never repair Visual Studio, change
// the machine PATH, or guess a personal installation path in project config.
export function windowsBuildEnvironment() {
  if (process.platform !== "win32")
    throw new Error("Este build requiere Windows");
  const vswhere = join(
    process.env["ProgramFiles(x86)"] ?? "",
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  if (!existsSync(vswhere))
    throw new Error("No se encontró vswhere de Visual Studio");
  const installs = JSON.parse(
    execFileSync(vswhere, ["-all", "-products", "*", "-format", "json"], {
      encoding: "utf8",
      windowsHide: true,
    }),
  );
  let selected;
  for (const install of installs.reverse()) {
    const base = install.installationPath;
    if (!base || /["\r\n]/.test(base)) continue;
    const tools = join(base, "VC", "Tools", "MSVC");
    const devcmd = join(base, "Common7", "Tools", "VsDevCmd.bat");
    if (!existsSync(tools) || !existsSync(devcmd)) continue;
    for (const version of readdirSync(tools).sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true }),
    )) {
      if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
      const lib = join(tools, version, "lib", "x64");
      if (
        ["msvcrt.lib", "legacy_stdio_definitions.lib"].every((name) =>
          existsSync(join(lib, name)),
        )
      ) {
        selected = {
          devcmd,
          version,
          label: install.displayName ?? "Visual Studio",
        };
        break;
      }
    }
    if (selected) break;
  }
  if (!selected)
    throw new Error(
      "Faltan bibliotecas C++ x64 de Visual Studio; instala o repara el componente antes de compilar",
    );
  const command = `call "${selected.devcmd}" -no_logo -arch=x64 -host_arch=x64 -vcvars_ver=${selected.version} >nul && set`;
  const result = spawnSync(
    process.env.ComSpec ?? "cmd.exe",
    ["/d", "/u", "/s", "/c", command],
    {
      encoding: "utf16le",
      windowsHide: true,
      windowsVerbatimArguments: true,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error("No se pudo inicializar el entorno C++ de Visual Studio");
  const allowed = new Set([
    "PATH",
    "LIB",
    "LIBPATH",
    "INCLUDE",
    "VSINSTALLDIR",
    "VCINSTALLDIR",
    "VCTOOLSINSTALLDIR",
    "VCTOOLSVERSION",
    "WINDOWSSDKDIR",
    "WINDOWSSDKVERSION",
    "UNIVERSALCRTSDKDIR",
    "UCRTVERSION",
    "VSCMD_ARG_TGT_ARCH",
    "VSCMD_ARG_HOST_ARCH",
    "VSCMD_VER",
  ]);
  const env = { ...process.env };
  for (const line of result.stdout.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator);
    if (!allowed.has(key.toUpperCase())) continue;
    for (const existing of Object.keys(env))
      if (existing.toUpperCase() === key.toUpperCase()) delete env[existing];
    env[key] = line.slice(separator + 1);
  }
  console.log(`Toolchain C++ x64: ${selected.label}, MSVC ${selected.version}`);
  return env;
}

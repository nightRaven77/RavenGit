import { useEffect, useState, type ComponentType } from "react";
import {
  OpenInNewWindowIcon,
  DownloadIcon,
  ReloadIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  Share2Icon,
  ArchiveIcon,
  MagnifyingGlassIcon,
} from "@radix-ui/react-icons";
import type { Snapshot } from "./types";
type Props = {
  repo: Pick<Snapshot, "name" | "path" | "branch" | "head"> | null;
  locked: boolean;
  onOpen: () => void;
  onRefresh: () => void;
  onChanges: () => void;
  onFetch: () => void;
  onPush: () => void;
  onPull: () => void;
  onBranches: () => void;
  onSearch: () => void;
  onStash: () => void;
};
type Action = {
  label: string;
  icon: ComponentType;
  description: string;
  run?: () => void;
  needsRepo?: boolean;
  group: number;
  accent?: boolean;
};
export default function CommandBar({
  repo,
  locked,
  onOpen,
  onRefresh,
  onFetch,
  onPush,
  onPull,
  onBranches,
  onStash,
  onSearch,
}: Props) {
  const [hint, setHint] = useState("");
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHint("");
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, []);

  const actions: Action[] = [
    {
      label: "Abrir",
      icon: OpenInNewWindowIcon,
      description: "Abrir un repositorio local",
      run: onOpen,
      group: 0,
    },
    {
      label: "Actualizar",
      icon: ReloadIcon,
      description:
        "Releer historial y referencias locales; no contacta con servidores",
      run: onRefresh,
      needsRepo: true,
      group: 2,
    },
    {
      label: "Fetch",
      icon: ArrowDownIcon,
      description: "Abrir Remotos para elegir el destino y confirmar Fetch",
      run: onFetch,
      needsRepo: true,
      group: 3,
    },
    {
      label: "Pull",
      icon: DownloadIcon,
      description:
        "Abrir Pull para revisar el upstream, confirmar Fetch e integrar con merge",
      run: onPull,
      needsRepo: true,
      group: 3,
    },
    {
      label: "Push",
      icon: ArrowUpIcon,
      description:
        "Abrir Publicar para revisar remoto, ramas y commits antes de enviar",
      run: onPush,
      needsRepo: true,
      group: 3,
      accent: true,
    },
    {
      label: "Rama",
      icon: Share2Icon,
      description: "Crear, cambiar o renombrar ramas locales",
      run: onBranches,
      needsRepo: true,
      group: 4,
    },
    {
      label: "Stash",
      icon: ArchiveIcon,
      description:
        "Guardar cambios temporalmente o restaurar un stash conservando su entrada",
      run: onStash,
      needsRepo: true,
      group: 4,
    },
    {
      label: "Buscar",
      icon: MagnifyingGlassIcon,
      description: "Buscar mensaje, autor o hash en el historial cargado",
      run: onSearch,
      needsRepo: true,
      group: 5,
    },
  ];
  return (
    <header className="topbar command-bar" onMouseLeave={() => setHint("")}>
      <div className="command-brand">
        <img
          className="brand-icon"
          src="/ravengit.svg"
          alt=""
          width="32"
          height="32"
          aria-hidden="true"
        />
        <strong>RavenGit</strong>
      </div>
      <div className="command-context">
        <div title={repo?.path ?? "Sin repositorio abierto"}>
          <span className="command-context-label">Repositorio</span>
          <strong>{repo?.name ?? "Sin repositorio"}</strong>
        </div>
        <div title={repo?.branch ?? repo?.head ?? "Sin commits"}>
          <span className="command-context-label">Rama</span>
          <strong>
            {repo?.branch ?? (repo?.head ? "HEAD separado" : "Sin commits")}
          </strong>
        </div>
      </div>
      <div
        className="command-strip"
        role="group"
        aria-label="Comandos Git básicos"
      >
        {actions.map((action, index) => {
          const unavailable = !action.run || !!(action.needsRepo && !repo);
          const description = locked
            ? "Hay una operación en curso. Espera a que termine."
            : !action.run
              ? action.description
              : action.needsRepo && !repo
                ? "Abre un repositorio para utilizar esta acción."
                : action.description;
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              className={`command-action ${action.accent ? "command-accent" : ""} ${index > 0 && action.group !== actions[index - 1].group ? "command-group-start" : ""}`}
              disabled={locked}
              aria-disabled={unavailable || locked}
              aria-label={action.label}
              title={description}
              aria-describedby={
                hint === description ? "command-help" : undefined
              }
              onFocus={() => setHint(description)}
              onBlur={() => setHint("")}
              onMouseEnter={() => setHint(description)}
              onClick={() => {
                if (!unavailable && !locked) action.run?.();
              }}
            >
              <span>{action.label}</span>
              <Icon />
            </button>
          );
        })}
      </div>
      {hint && (
        <div id="command-help" className="command-help" role="tooltip">
          {hint}
        </div>
      )}
    </header>
  );
}

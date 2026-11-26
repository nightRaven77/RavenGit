import { CommitIcon } from "@radix-ui/react-icons";
import type { Snapshot } from "./types";

export interface StatusBarProps {
  repo: Snapshot | null;
  busy: boolean;
  loadingMore: boolean;
  writing: boolean;
  preferencesRepo: string | null;
  preferenceSave: "pending" | "saved" | "failed";
  onAuthorizeRepo: (repoId: string) => void;
  onRetrySavePreferences: () => void;
}

export default function StatusBar({
  repo,
  busy,
  loadingMore,
  writing,
  preferencesRepo,
  preferenceSave,
  onAuthorizeRepo,
  onRetrySavePreferences,
}: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span>
        <span className="status-dot" />
        {busy || loadingMore
          ? "Leyendo repositorio…"
          : repo
            ? "Repositorio local conectado"
            : "Listo para abrir un repositorio"}
        {repo && repo.trusted === false && (
          <button
            type="button"
            className="status-trust-btn"
            disabled={writing || busy}
            onClick={() => onAuthorizeRepo(repo.id)}
          >
            Solo lectura · Autorizar…
          </button>
        )}
      </span>
      <span>
        {writing
          ? "Operación Git en curso…"
          : "Cambios · Historial · Sincronizar"}
      </span>
      <span>
        {repo && preferencesRepo === repo.id ? (
          <>
            {preferenceSave === "pending" ? (
              "Guardando preferencias…"
            ) : preferenceSave === "saved" ? (
              "Preferencias guardadas"
            ) : (
              <button onClick={onRetrySavePreferences}>
                Reintentar guardar preferencias
              </button>
            )}
          </>
        ) : (
          <>
            <CommitIcon /> Git local · Sin publicación automática
          </>
        )}
      </span>
    </footer>
  );
}

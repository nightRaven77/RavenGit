import { useEffect, useRef, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CodeIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import DiffViewer from "./DiffViewer";
import type {
  CodeSearchMode,
  Commit,
  SearchMatchDiff,
  SearchQuery,
  SearchResult,
} from "./types";

export interface SearchDialogProps {
  repoId: string;
  repoName: string;
  currentScope: string;
  branches: string[];
  initialMode?: "history" | "code";
  initialQuery?: string;
  onClose: () => void;
  onJumpToCommit: (commit: Commit) => void;
}

const errorMessage = (reason: unknown) =>
  typeof reason === "object" && reason && "message" in reason
    ? String((reason as { message: unknown }).message)
    : String(reason);

function shortHash(hash: string) {
  return hash.slice(0, 8);
}

function formatDate(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString("es-MX", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export default function SearchDialog({
  repoId,
  repoName,
  currentScope,
  branches,
  initialMode = "history",
  initialQuery = "",
  onClose,
  onJumpToCommit,
}: SearchDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchReqRef = useRef(0);
  const diffReqRef = useRef(0);

  const [mode, setMode] = useState<"history" | "code">(initialMode);
  const [scope, setScope] = useState(currentScope || "all");
  const [message, setMessage] = useState(
    initialMode === "history" ? initialQuery : "",
  );
  const [author, setAuthor] = useState("");
  const [hash, setHash] = useState("");
  const [path, setPath] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [regex, setRegex] = useState(false);

  const [codeQuery, setCodeQuery] = useState(
    initialMode === "code" ? initialQuery : "",
  );
  const [codeMode, setCodeMode] = useState<CodeSearchMode>("literal");

  const [results, setResults] = useState<Commit[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [matchDiff, setMatchDiff] = useState<SearchMatchDiff | null>(null);
  const [diffBusy, setDiffBusy] = useState(false);
  const [diffError, setDiffError] = useState("");

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) {
      el.showModal?.();
    }
  }, []);

  function buildPayload(offset = 0): SearchQuery {
    return {
      scope,
      message: mode === "history" ? message.trim() || null : null,
      author: author.trim() || null,
      hash: mode === "history" ? hash.trim() || null : null,
      since: since.trim() || null,
      until: until.trim() || null,
      path: path.trim() || null,
      regex: mode === "history" ? regex : false,
      codeQuery: mode === "code" ? codeQuery.trim() || null : null,
      codeMode: mode === "code" ? codeMode : null,
      offset,
      limit: 50,
    };
  }

  async function runSearch(offset = 0) {
    const token = ++searchReqRef.current;
    if (offset === 0) {
      setBusy(true);
      setSelectedCommit(null);
      setMatchDiff(null);
      setDiffError("");
    } else {
      setLoadingMore(true);
    }
    setError("");
    try {
      const response = await invoke<SearchResult>("search_history", {
        id: repoId,
        query: buildPayload(offset),
      });
      if (token !== searchReqRef.current) return;
      setHasSearched(true);
      setNextOffset(response.nextOffset);
      setResults((current) =>
        offset === 0 ? response.commits : [...current, ...response.commits],
      );
      if (offset === 0 && response.commits.length > 0) {
        setSelectedCommit(response.commits[0]);
      }
    } catch (reason) {
      if (token === searchReqRef.current) setError(errorMessage(reason));
    } finally {
      if (token === searchReqRef.current) {
        setBusy(false);
        setLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    const token = ++diffReqRef.current;
    setMatchDiff(null);
    setDiffError("");
    if (!selectedCommit) {
      setDiffBusy(false);
      return;
    }
    setDiffBusy(true);
    invoke<SearchMatchDiff>("read_search_match_diff", {
      id: repoId,
      hash: selectedCommit.hash,
      path: path.trim() || null,
      codeQuery: mode === "code" ? codeQuery.trim() || null : null,
      codeMode: mode === "code" ? codeMode : null,
    })
      .then((res) => {
        if (token === diffReqRef.current) setMatchDiff(res);
      })
      .catch((reason) => {
        if (token === diffReqRef.current) setDiffError(errorMessage(reason));
      })
      .finally(() => {
        if (token === diffReqRef.current) setDiffBusy(false);
      });
  }, [repoId, selectedCommit, path, mode, codeQuery, codeMode]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void runSearch(0);
  }

  function handleClear() {
    setMessage("");
    setAuthor("");
    setHash("");
    setPath("");
    setSince("");
    setUntil("");
    setRegex(false);
    setCodeQuery("");
    setCodeMode("literal");
    setResults([]);
    setNextOffset(null);
    setHasSearched(false);
    setSelectedCommit(null);
    setMatchDiff(null);
    setError("");
  }

  return (
    <dialog
      ref={dialogRef}
      className="operation-dialog search-dialog"
      aria-labelledby="search-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="search-dialog-head">
        <div>
          <span className="trust-dialog-eyebrow">EXPLORACIÓN PROFUNDA</span>
          <h2 id="search-dialog-title">Búsqueda profunda en {repoName}</h2>
          <p className="worktree-dialog-sub">
            Consulta todo el historial del repositorio o busca cambios exactos
            en el código fuente.
          </p>
        </div>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Cerrar búsqueda profunda"
        >
          ×
        </button>
      </header>

      <div
        className="search-dialog-tabs"
        role="tablist"
        aria-label="Modo de búsqueda"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "history"}
          className={`button ${mode === "history" ? "active" : ""}`}
          onClick={() => setMode("history")}
        >
          <MagnifyingGlassIcon aria-hidden="true" />
          Historial completo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "code"}
          className={`button ${mode === "code" ? "active" : ""}`}
          onClick={() => setMode("code")}
        >
          <CodeIcon aria-hidden="true" />
          Código (-S / -G)
        </button>
      </div>

      <form className="search-dialog-form" onSubmit={handleSubmit}>
        {mode === "history" ? (
          <div className="search-dialog-grid">
            <label>
              Mensaje
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Texto o patrón en el mensaje…"
                maxLength={500}
                autoFocus
              />
            </label>
            <label>
              Autor
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Nombre o correo del autor…"
                maxLength={500}
              />
            </label>
            <label>
              Hash
              <input
                type="text"
                value={hash}
                onChange={(e) => setHash(e.target.value)}
                placeholder="Prefijo o hash completo…"
                maxLength={64}
              />
            </label>
            <label>
              Ruta de archivo
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="src/App.tsx o carpeta…"
                maxLength={500}
              />
            </label>
            <label>
              Desde
              <input
                type="date"
                value={since}
                onChange={(e) => setSince(e.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </label>
            <label>
              Ámbito
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="all">Todas las referencias</option>
                <option value="HEAD">Rama actual / HEAD</option>
                {branches.map((branchRef) => (
                  <option key={branchRef} value={branchRef}>
                    {branchRef.replace(/^refs\/heads\//, "")}
                  </option>
                ))}
              </select>
            </label>
            <label className="search-dialog-check">
              <input
                type="checkbox"
                checked={regex}
                onChange={(e) => setRegex(e.target.checked)}
              />
              Usar expresión regular (regex)
            </label>
          </div>
        ) : (
          <div className="search-dialog-grid">
            <label>
              Texto o patrón en código
              <input
                type="text"
                value={codeQuery}
                onChange={(e) => setCodeQuery(e.target.value)}
                placeholder="Función, símbolo o regex en el diff…"
                maxLength={500}
                autoFocus
              />
            </label>
            <label>
              Modo de código
              <select
                value={codeMode}
                onChange={(e) => setCodeMode(e.target.value as CodeSearchMode)}
              >
                <option value="literal">Texto literal (-S)</option>
                <option value="regex">Expresión regular (-G)</option>
              </select>
            </label>
            <label>
              Ruta de archivo
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="src/App.tsx o carpeta…"
                maxLength={500}
              />
            </label>
            <label>
              Autor
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Nombre o correo del autor…"
                maxLength={500}
              />
            </label>
            <label>
              Desde
              <input
                type="date"
                value={since}
                onChange={(e) => setSince(e.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </label>
            <label>
              Ámbito
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="all">Todas las referencias</option>
                <option value="HEAD">Rama actual / HEAD</option>
                {branches.map((branchRef) => (
                  <option key={branchRef} value={branchRef}>
                    {branchRef.replace(/^refs\/heads\//, "")}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="search-dialog-form-actions">
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Buscando…" : "Buscar"}
          </button>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={handleClear}
          >
            Limpiar filtros
          </button>
        </div>
      </form>

      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className="search-dialog-split">
        <div
          className="search-dialog-results"
          role="region"
          aria-label="Resultados de búsqueda"
        >
          <div className="search-dialog-results-head" role="status">
            {busy
              ? "Consultando historial completo…"
              : hasSearched
                ? `${results.length} commits encontrados${nextOffset !== null ? " (hay más)" : ""}`
                : "Configura los criterios y pulsa Buscar."}
          </div>
          {results.length > 0 && (
            <ul className="search-dialog-list">
              {results.map((commit) => {
                const isSelected = selectedCommit?.hash === commit.hash;
                return (
                  <li key={commit.hash}>
                    <button
                      type="button"
                      className={`search-dialog-item ${isSelected ? "selected" : ""}`}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedCommit(commit)}
                    >
                      <div className="search-dialog-item-top">
                        <code>{shortHash(commit.hash)}</code>
                        <span>{formatDate(commit.date)}</span>
                      </div>
                      <strong className="truncate">
                        {commit.subject || "(sin mensaje)"}
                      </strong>
                      <small className="truncate">{commit.author}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {hasSearched && !busy && results.length === 0 && !error && (
            <p className="search-dialog-empty">
              Ningún commit coincide con los filtros actuales.
            </p>
          )}
          {nextOffset !== null && (
            <div className="search-dialog-more">
              <button
                type="button"
                className="button"
                disabled={loadingMore}
                onClick={() => void runSearch(nextOffset)}
              >
                {loadingMore ? "Cargando más…" : "Cargar más"}
              </button>
            </div>
          )}
        </div>

        <div
          className="search-dialog-preview"
          role="region"
          aria-label="Vista previa del commit encontrado"
        >
          {selectedCommit ? (
            <>
              <div className="search-dialog-preview-head">
                <div>
                  <h3>{selectedCommit.subject || "(sin mensaje)"}</h3>
                  <p>
                    {selectedCommit.author} · {formatDate(selectedCommit.date)}{" "}
                    · <code>{shortHash(selectedCommit.hash)}</code>
                  </p>
                </div>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    onJumpToCommit(selectedCommit);
                    onClose();
                  }}
                >
                  Ir al commit
                </button>
              </div>
              <div className="search-dialog-preview-body" aria-busy={diffBusy}>
                {diffBusy ? (
                  <p className="search-dialog-empty">
                    Cargando fragmento coincidente…
                  </p>
                ) : diffError ? (
                  <div className="banner error" role="alert">
                    <span>{diffError}</span>
                  </div>
                ) : matchDiff?.text ? (
                  <DiffViewer
                    text={matchDiff.text}
                    filePath={path.trim() || undefined}
                  />
                ) : (
                  <p className="search-dialog-empty">
                    Sin fragmento de diff para mostrar en este filtro.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="search-dialog-empty">
              Selecciona un commit de la lista para inspeccionar su fragmento y
              saltar a él.
            </p>
          )}
        </div>
      </div>
    </dialog>
  );
}

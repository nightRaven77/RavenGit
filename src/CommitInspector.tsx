import {
  ArrowRightIcon,
  CommitIcon,
  FileTextIcon,
} from "@radix-ui/react-icons";
import AuthorAvatar from "./AuthorAvatar";
import DiffViewer, { DiffModeControl } from "./DiffViewer";
import ImageDiffViewer, { isImageAssetPath } from "./ImageDiffViewer";
import { formatCommitDate, short, type RepoView } from "./appHelpers";
import type {
  Commit,
  CommitDiff,
  CommitFile,
  ImageDiff,
  Snapshot,
} from "./types";

export interface CommitInspectorProps {
  repo: Snapshot | null;
  view: RepoView;
  inspectorOpen: boolean;
  inspectorSize: number;
  draggingSplit: boolean;
  active: Commit | null;
  commits: Commit[];
  writing: boolean;
  parentIndex: number;
  commitFiles: CommitFile[] | null;
  filesBusy: boolean;
  selectedFile: CommitFile | null;
  commitIgnoreWhitespace: boolean;
  commitContextLines: number;
  diff: CommitDiff | null;
  diffBusy: boolean;
  diffError: string;
  commitImageDiff: ImageDiff | null;
  preferTextForImage: boolean;
  onStartResize: (event: React.PointerEvent<HTMLDivElement>) => void;
  onChangeInspectorSize: (updater: (prev: number) => number) => void;
  onCopyText: (value: string, label: string) => void;
  onJump: (hash: string) => void;
  onTagCommit: (hash: string) => void;
  onReplayCommit: (kind: "cherryPick" | "revert", commit: string) => void;
  onSelectFile: (
    updater: (current: CommitFile | null) => CommitFile | null,
  ) => void;
  onOpenFileHistory: (path: string, revision: string) => void;
  onOpenBlame: (path: string, revision: string) => void;
  onChangeParentIndex: (index: number) => void;
  onPreferTextForImage: (prefer: boolean) => void;
  onIgnoreWhitespaceChange: (ignore: boolean) => void;
  onContextLinesChange: (lines: number) => void;
}

export default function CommitInspector({
  repo,
  view,
  inspectorOpen,
  inspectorSize,
  draggingSplit,
  active,
  commits,
  writing,
  parentIndex,
  commitFiles,
  filesBusy,
  selectedFile,
  commitIgnoreWhitespace,
  commitContextLines,
  diff,
  diffBusy,
  diffError,
  commitImageDiff,
  preferTextForImage,
  onStartResize,
  onChangeInspectorSize,
  onCopyText,
  onJump,
  onTagCommit,
  onReplayCommit,
  onSelectFile,
  onOpenFileHistory,
  onOpenBlame,
  onChangeParentIndex,
  onPreferTextForImage,
  onIgnoreWhitespaceChange,
  onContextLinesChange,
}: CommitInspectorProps) {
  return (
    <aside
      id="commit-inspector"
      hidden={(!!repo && view !== "history") || !inspectorOpen}
      className="inspector history-inspector"
      aria-label="Detalle del commit"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar panel de detalle"
        aria-valuemin={30}
        aria-valuemax={60}
        aria-valuenow={inspectorSize}
        tabIndex={0}
        className={`inspector-resizer${draggingSplit ? " active" : ""}`}
        onPointerDown={onStartResize}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            onChangeInspectorSize((v) => Math.min(60, v + 2));
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            onChangeInspectorSize((v) => Math.max(30, v - 2));
          }
        }}
      />
      <div className="inspector-heading">
        <FileTextIcon />
        <h2>Detalle del commit</h2>
        {active && (
          <button
            type="button"
            className="inspector-hash-pill"
            title="Copiar hash completo del commit"
            aria-label={`Copiar hash completo ${short(active.hash)}`}
            onClick={() => onCopyText(active.hash, "Hash copiado")}
          >
            <code>{short(active.hash)}</code>
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4 1.5h5.5A1.5 1.5 0 0 1 11 3v5.5H9.8V3a.3.3 0 0 0-.3-.3H4V1.5Zm-1.5 2A1.5 1.5 0 0 0 1 5v5.5A1.5 1.5 0 0 0 2.5 12H8a1.5 1.5 0 0 0 1.5-1.5V5A1.5 1.5 0 0 0 8 3.5H2.5Zm0 1.2H8a.3.3 0 0 1 .3.3v5.5a.3.3 0 0 1-.3.3H2.5a.3.3 0 0 1-.3-.3V5a.3.3 0 0 1 .3-.3Z"
              />
            </svg>
          </button>
        )}
        <div
          className="commit-step-navigation"
          role="group"
          aria-label="Navegar por commits cargados"
        >
          <button
            className="button"
            aria-label="Commit anterior en la lista"
            title="Commit anterior en la lista (orden topológico)"
            disabled={!active || commits.indexOf(active) === 0}
            onClick={() =>
              active && onJump(commits[commits.indexOf(active) - 1].hash)
            }
          >
            ↑
          </button>
          <button
            className="button"
            aria-label="Commit siguiente en la lista"
            title="Commit siguiente en la lista (orden topológico)"
            disabled={!active || commits.indexOf(active) === commits.length - 1}
            onClick={() =>
              active && onJump(commits[commits.indexOf(active) + 1].hash)
            }
          >
            ↓
          </button>
        </div>
      </div>
      {active ? (
        <>
          <div className="commit-meta">
            <h2>{active.subject || "(sin mensaje)"}</h2>
            <div className="commit-actions">
              <button
                className="button"
                disabled={writing}
                onClick={() => onTagCommit(active.hash)}
              >
                Etiquetar commit…
              </button>
              <button
                className="button"
                disabled={writing}
                onClick={() => onReplayCommit("cherryPick", active.hash)}
              >
                Cherry-pick
              </button>
              <button
                className="button"
                disabled={writing}
                onClick={() => onReplayCommit("revert", active.hash)}
              >
                Revertir commit
              </button>
            </div>
            <div className="selected-author">
              <AuthorAvatar name={active.author} />
              <span>{active.author || "Autor desconocido"}</span>
              <time dateTime={active.date}>
                {formatCommitDate(active.date)}
              </time>
            </div>
            <details className="commit-details" key={active.hash}>
              <summary>Más detalles</summary>
              <dl>
                <dt>Autor</dt>
                <dd>{active.author}</dd>
                <dt>Fecha</dt>
                <dd>{new Date(active.date).toLocaleString("es-MX")}</dd>
                <dt>Hash</dt>
                <dd className="full-hash">{active.hash}</dd>
                <dt>Padres</dt>
                <dd>
                  {active.parents.length
                    ? active.parents.map((p) => (
                        <button
                          key={p}
                          className="parent-link"
                          onClick={() => onJump(p)}
                          title={p}
                        >
                          {short(p)} <ArrowRightIcon />
                        </button>
                      ))
                    : "Commit raíz"}
                </dd>
              </dl>
            </details>
          </div>
          {active.parents.length > 0 && (
            <nav
              className="commit-parent-navigation"
              aria-label="Navegar por padres"
            >
              {active.parents.map((parent, index) => (
                <button
                  className="button"
                  key={parent}
                  title={parent}
                  onClick={() => onJump(parent)}
                >
                  Ir al padre {index + 1}
                </button>
              ))}
            </nav>
          )}
          {(filesBusy || (commitFiles && commitFiles.length > 0)) && (
            <section
              className="commit-files"
              aria-label="Archivos del commit"
              aria-busy={filesBusy}
            >
              <div className="commit-files-header">
                <span>Archivos modificados ({commitFiles?.length ?? "…"})</span>
                {commitFiles && commitFiles.length > 0 && (
                  <span className="commit-files-totals">
                    <span className="stat-add">
                      +
                      {commitFiles.reduce(
                        (acc, item) => acc + (item.additions ?? 0),
                        0,
                      )}
                    </span>{" "}
                    <span className="stat-del">
                      −
                      {commitFiles.reduce(
                        (acc, item) => acc + (item.deletions ?? 0),
                        0,
                      )}
                    </span>
                  </span>
                )}
                {selectedFile && (
                  <button
                    type="button"
                    className="button commit-files-reset"
                    onClick={() => onSelectFile(() => null)}
                  >
                    Ver todos
                  </button>
                )}
              </div>
              {commitFiles && commitFiles.length > 0 && (
                <ul className="commit-files-list">
                  {commitFiles.map((file) => {
                    const activeFile = selectedFile?.path === file.path;
                    return (
                      <li
                        key={`${file.status}:${file.path}`}
                        className="commit-file-item"
                      >
                        <button
                          type="button"
                          className={`commit-file-row${activeFile ? " selected" : ""}`}
                          aria-pressed={activeFile}
                          onClick={() =>
                            onSelectFile((current) =>
                              current?.path === file.path ? null : file,
                            )
                          }
                          title={
                            file.oldPath
                              ? `${file.oldPath} → ${file.path}`
                              : file.path
                          }
                        >
                          <span
                            className={`commit-file-status status-${file.status}`}
                          >
                            {file.status}
                          </span>
                          <span className="truncate">
                            {file.oldPath
                              ? `${file.oldPath} → ${file.path}`
                              : file.path}
                          </span>
                          <span className="commit-file-stats">
                            {file.binary ? (
                              "bin"
                            ) : (
                              <>
                                <span className="stat-add">
                                  +{file.additions ?? 0}
                                </span>
                                <span className="stat-del">
                                  −{file.deletions ?? 0}
                                </span>
                              </>
                            )}
                          </span>
                        </button>
                        <div className="commit-file-tools">
                          <button
                            type="button"
                            className="button commit-file-tool"
                            aria-label="Historial del archivo"
                            title={`Ver historial de ${file.path}`}
                            disabled={writing}
                            onClick={() =>
                              onOpenFileHistory(file.path, active.hash)
                            }
                          >
                            Historial
                          </button>
                          <button
                            type="button"
                            className="button commit-file-tool"
                            aria-label="Blame del archivo"
                            title={`Ver blame de ${file.path}`}
                            disabled={
                              writing || file.status === "D" || file.binary
                            }
                            onClick={() => onOpenBlame(file.path, active.hash)}
                          >
                            Blame
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
          <div className="diff-toolbar">
            <span>{selectedFile ? selectedFile.path : "Diff del commit"}</span>
            {active.parents.length > 1 ? (
              <label>
                Contra padre{" "}
                <select
                  value={parentIndex}
                  onChange={(e) => {
                    onChangeParentIndex(Number(e.target.value));
                    onSelectFile(() => null);
                  }}
                >
                  {active.parents.map((p, i) => (
                    <option key={p} value={i}>
                      {i + 1} · {short(p)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <code>
                {active.parents[0] ? short(active.parents[0]) : "árbol vacío"} →{" "}
                {short(active.hash)}
              </code>
            )}
          </div>
          <div className="diff-body" aria-busy={diffBusy}>
            {diffBusy ? (
              <div className="skeleton-list" aria-label="Leyendo diff">
                <div className="skeleton-row" />
                <div className="skeleton-row" />
                <div className="skeleton-row" />
              </div>
            ) : diffError ? (
              <>
                <div className="banner error" role="alert">
                  {diffError}
                </div>
                {!selectedFile && commitFiles && commitFiles.length > 0 && (
                  <p className="partial-note">
                    Selecciona un archivo individual arriba para inspeccionar su
                    diff sin superar el límite de 2 MiB.
                  </p>
                )}
              </>
            ) : selectedFile &&
              isImageAssetPath(selectedFile.path) &&
              commitImageDiff &&
              !preferTextForImage ? (
              <ImageDiffViewer
                diff={commitImageDiff}
                onToggleText={
                  commitImageDiff.mime === "image/svg+xml" && diff?.text
                    ? () => onPreferTextForImage(true)
                    : undefined
                }
                toggleTextLabel="Ver diff de texto"
              />
            ) : diff?.text ? (
              <>
                {selectedFile &&
                  isImageAssetPath(selectedFile.path) &&
                  commitImageDiff && (
                    <div className="image-diff-switch-row">
                      <button
                        type="button"
                        className="button"
                        onClick={() => onPreferTextForImage(false)}
                      >
                        Ver diff visual
                      </button>
                    </div>
                  )}
                <DiffViewer
                  text={diff.text}
                  filePath={selectedFile?.path}
                  ignoreWhitespace={commitIgnoreWhitespace}
                  onIgnoreWhitespaceChange={onIgnoreWhitespaceChange}
                  contextLines={commitContextLines}
                  onContextLinesChange={onContextLinesChange}
                />
              </>
            ) : (
              <>
                {(commitIgnoreWhitespace || commitContextLines !== 3) && (
                  <DiffModeControl
                    mode="unified"
                    onChange={() => {}}
                    available={false}
                    ignoreWhitespace={commitIgnoreWhitespace}
                    onIgnoreWhitespaceChange={onIgnoreWhitespaceChange}
                    contextLines={commitContextLines}
                    onContextLinesChange={onContextLinesChange}
                  />
                )}
                <div className="diff-empty">
                  Sin diferencias de contenido contra este padre.
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="inspector-empty">
          <CommitIcon width="24" height="24" />
          <h3>El contexto, a un clic.</h3>
          <p>Selecciona un commit para ver su autor, sus padres y el diff.</p>
        </div>
      )}
    </aside>
  );
}

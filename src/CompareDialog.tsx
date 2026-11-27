import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import DiffViewer from "./DiffViewer";
import ImageDiffViewer, { isImageAssetPath } from "./ImageDiffViewer";
import type {
  Commit,
  CommitFile,
  ImageDiff,
  RangeDiff,
  RangeFiles,
} from "./types";

export interface CompareDialogProps {
  repoId: string;
  base: Commit;
  target: Commit;
  onClose: () => void;
  onSwap: () => void;
}

const errorMessage = (reason: unknown) =>
  typeof reason === "object" && reason && "message" in reason
    ? String((reason as { message: unknown }).message)
    : String(reason);

function shortHash(hash: string) {
  return hash.slice(0, 8);
}

export default function CompareDialog({
  repoId,
  base,
  target,
  onClose,
  onSwap,
}: CompareDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const filesReqRef = useRef(0);
  const diffReqRef = useRef(0);
  const imageDiffReqRef = useRef(0);

  const [files, setFiles] = useState<CommitFile[] | null>(null);
  const [filesBusy, setFilesBusy] = useState(true);
  const [selectedFile, setSelectedFile] = useState<CommitFile | null>(null);
  const [diff, setDiff] = useState<RangeDiff | null>(null);
  const [imageDiff, setImageDiff] = useState<ImageDiff | null>(null);
  const [preferTextForImage, setPreferTextForImage] = useState(false);
  const [diffBusy, setDiffBusy] = useState(true);
  const [error, setError] = useState("");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [contextLines, setContextLines] = useState(3);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) {
      el.showModal?.();
    }
  }, []);

  useEffect(() => {
    const token = ++filesReqRef.current;
    setFiles(null);
    setSelectedFile(null);
    setFilesBusy(true);
    setError("");
    invoke<RangeFiles>("read_range_files", {
      id: repoId,
      base: base.hash,
      target: target.hash,
    })
      .then((res) => {
        if (token === filesReqRef.current) setFiles(res.files);
      })
      .catch((reason) => {
        if (token === filesReqRef.current) setError(errorMessage(reason));
      })
      .finally(() => {
        if (token === filesReqRef.current) setFilesBusy(false);
      });
  }, [repoId, base.hash, target.hash]);

  useEffect(() => {
    const token = ++diffReqRef.current;
    setDiff(null);
    setDiffBusy(true);
    setError("");
    invoke<RangeDiff>("read_range_diff", {
      id: repoId,
      base: base.hash,
      target: target.hash,
      path: selectedFile?.path ?? null,
      oldPath: selectedFile?.oldPath ?? null,
      ignoreWhitespace,
      contextLines,
    })
      .then((res) => {
        if (token === diffReqRef.current) setDiff(res);
      })
      .catch((reason) => {
        if (token === diffReqRef.current) setError(errorMessage(reason));
      })
      .finally(() => {
        if (token === diffReqRef.current) setDiffBusy(false);
      });
  }, [
    repoId,
    base.hash,
    target.hash,
    selectedFile,
    ignoreWhitespace,
    contextLines,
  ]);

  useEffect(() => {
    const token = ++imageDiffReqRef.current;
    setImageDiff(null);
    setPreferTextForImage(false);
    if (!selectedFile || !isImageAssetPath(selectedFile.path)) {
      return;
    }
    invoke<ImageDiff>("read_image_diff", {
      id: repoId,
      source: {
        kind: "range",
        base: base.hash,
        target: target.hash,
        path: selectedFile.path,
        oldPath: selectedFile.oldPath ?? null,
      },
    })
      .then((res) => {
        if (token === imageDiffReqRef.current) setImageDiff(res);
      })
      .catch(() => {
        if (token === imageDiffReqRef.current) setImageDiff(null);
      });
    return () => {
      imageDiffReqRef.current++;
    };
  }, [repoId, base.hash, target.hash, selectedFile]);

  const totalAdditions = (files ?? []).reduce(
    (acc, item) => acc + (item.additions ?? 0),
    0,
  );
  const totalDeletions = (files ?? []).reduce(
    (acc, item) => acc + (item.deletions ?? 0),
    0,
  );

  return (
    <dialog
      ref={dialogRef}
      className="operation-dialog compare-dialog"
      aria-labelledby="compare-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="compare-dialog-head">
        <div>
          <span className="trust-dialog-eyebrow">
            COMPARACIÓN DE RANGO DE COMMITS
          </span>
          <h2 id="compare-dialog-title">
            Comparar {shortHash(base.hash)} → {shortHash(target.hash)}
          </h2>
          <p className="worktree-dialog-sub">
            {base.subject || "(sin mensaje)"} →{" "}
            {target.subject || "(sin mensaje)"}
          </p>
        </div>
        <div className="compare-head-actions">
          <button type="button" className="button" onClick={onSwap}>
            Invertir A ↔ B
          </button>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Cerrar comparación de commits"
          >
            ×
          </button>
        </div>
      </header>

      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className="search-dialog-split">
        <div
          className="search-dialog-results"
          role="region"
          aria-label="Archivos modificados en el rango"
        >
          <div className="search-dialog-results-head compare-files-head">
            <span>
              {filesBusy
                ? "Calculando archivos…"
                : `${files?.length ?? 0} archivos`}
            </span>
            {files && files.length > 0 && (
              <span className="commit-files-totals">
                <span className="stat-add">+{totalAdditions}</span>{" "}
                <span className="stat-del">−{totalDeletions}</span>
              </span>
            )}
            {selectedFile && (
              <button
                type="button"
                className="button commit-files-reset"
                onClick={() => setSelectedFile(null)}
              >
                Ver todos
              </button>
            )}
          </div>
          {files && files.length > 0 ? (
            <ul className="search-dialog-list">
              {files.map((file) => {
                const active = selectedFile?.path === file.path;
                return (
                  <li key={`${file.status}:${file.path}`}>
                    <button
                      type="button"
                      className={`commit-file-row ${active ? "selected" : ""}`}
                      aria-pressed={active}
                      onClick={() =>
                        setSelectedFile((cur) =>
                          cur?.path === file.path ? null : file,
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
                  </li>
                );
              })}
            </ul>
          ) : (
            !filesBusy && (
              <p className="search-dialog-empty">
                No hay diferencias de archivos entre ambos commits.
              </p>
            )
          )}
        </div>

        <div
          className="search-dialog-preview"
          role="region"
          aria-label="Diff acumulado del rango"
        >
          <div className="search-dialog-preview-body" aria-busy={diffBusy}>
            {diffBusy ? (
              <p className="search-dialog-empty">Calculando diff del rango…</p>
            ) : selectedFile &&
              isImageAssetPath(selectedFile.path) &&
              imageDiff &&
              !preferTextForImage ? (
              <ImageDiffViewer
                diff={imageDiff}
                onToggleText={
                  imageDiff.mime === "image/svg+xml" && diff?.text
                    ? () => setPreferTextForImage(true)
                    : undefined
                }
                toggleTextLabel="Ver diff de texto"
              />
            ) : diff?.text ? (
              <>
                {selectedFile &&
                  isImageAssetPath(selectedFile.path) &&
                  imageDiff && (
                    <div className="image-diff-switch-row">
                      <button
                        type="button"
                        className="button"
                        onClick={() => setPreferTextForImage(false)}
                      >
                        Ver diff visual
                      </button>
                    </div>
                  )}
                <DiffViewer
                  text={diff.text}
                  filePath={selectedFile?.path}
                  ignoreWhitespace={ignoreWhitespace}
                  onIgnoreWhitespaceChange={setIgnoreWhitespace}
                  contextLines={contextLines}
                  onContextLinesChange={setContextLines}
                />
              </>
            ) : (
              <p className="search-dialog-empty">
                Sin diferencias de contenido entre ambos commits.
              </p>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}

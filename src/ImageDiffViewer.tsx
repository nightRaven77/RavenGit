import { useEffect, useRef, useState } from "react";
import type { ImageDiff, ImageSide } from "./types";

export type ImageDiffMode = "side-by-side" | "swipe" | "onion" | "pixel";

export function isImageAssetPath(path: string | null | undefined): boolean {
  if (!path) return false;
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(path);
}

export interface ImageDiffViewerProps {
  diff: ImageDiff;
  onToggleText?: () => void;
  toggleTextLabel?: string;
}

interface Dimensions {
  width: number;
  height: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function sizeDeltaText(
  before: ImageSide | null,
  after: ImageSide | null,
): string {
  if (before && after) {
    if (before.bytes === 0) {
      return `${formatBytes(before.bytes)} → ${formatBytes(after.bytes)}`;
    }
    const pct = Math.round(((after.bytes - before.bytes) / before.bytes) * 100);
    const sign = pct > 0 ? "+" : "";
    return `${formatBytes(before.bytes)} → ${formatBytes(after.bytes)} (${sign}${pct}%)`;
  }
  if (after) return `Nueva · ${formatBytes(after.bytes)}`;
  if (before) return `Eliminada · ${formatBytes(before.bytes)}`;
  return "Sin datos";
}

function SideNotice({
  side,
  emptyText,
}: {
  side: ImageSide | null;
  emptyText: string;
}) {
  if (!side) {
    return <p className="image-diff-placeholder">{emptyText}</p>;
  }
  if (side.isLfsPointer) {
    return (
      <p className="image-diff-placeholder">
        Puntero Git LFS detectado ({formatBytes(side.bytes)}). El contenido real
        no está descargado localmente.
      </p>
    );
  }
  if (side.tooLarge) {
    return (
      <p className="image-diff-placeholder">
        Imagen de {formatBytes(side.bytes)}: supera el límite de 2 MiB para
        vista previa visual.
      </p>
    );
  }
  return (
    <p className="image-diff-placeholder">
      No se pudo renderizar esta versión de la imagen.
    </p>
  );
}

export default function ImageDiffViewer({
  diff,
  onToggleText,
  toggleTextLabel = "Ver diff de texto",
}: ImageDiffViewerProps) {
  const [mode, setMode] = useState<ImageDiffMode>("side-by-side");
  const [swipePos, setSwipePos] = useState(50);
  const [onionOpacity, setOnionOpacity] = useState(50);
  const [beforeDims, setBeforeDims] = useState<Dimensions | null>(null);
  const [afterDims, setAfterDims] = useState<Dimensions | null>(null);
  const [pixelStats, setPixelStats] = useState<{
    percent: number;
    canvasReady: boolean;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beforeUrl = diff.before?.dataUrl ?? null;
  const afterUrl = diff.after?.dataUrl ?? null;
  const canOverlay = Boolean(beforeUrl && afterUrl);

  useEffect(() => {
    setBeforeDims(null);
    setAfterDims(null);
    setPixelStats(null);
    setMode((prev) =>
      prev !== "side-by-side" && !canOverlay ? "side-by-side" : prev,
    );
  }, [diff.path, diff.oldPath, beforeUrl, afterUrl, canOverlay]);

  useEffect(() => {
    if (mode !== "pixel" || !beforeUrl || !afterUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      ctx = null;
    }
    if (!ctx) {
      setPixelStats({ percent: 0, canvasReady: false });
      return;
    }

    let cancelled = false;
    const imgA = new Image();
    const imgB = new Image();
    let loaded = 0;

    const tryRenderDiff = () => {
      loaded += 1;
      if (loaded < 2 || cancelled) return;
      try {
        const w = Math.max(
          1,
          imgA.naturalWidth || imgB.naturalWidth,
          imgB.naturalWidth,
        );
        const h = Math.max(
          1,
          imgA.naturalHeight || imgB.naturalHeight,
          imgB.naturalHeight,
        );
        canvas.width = w;
        canvas.height = h;

        const offA = document.createElement("canvas");
        offA.width = w;
        offA.height = h;
        const ctxA = offA.getContext("2d");
        const offB = document.createElement("canvas");
        offB.width = w;
        offB.height = h;
        const ctxB = offB.getContext("2d");
        if (!ctxA || !ctxB) {
          setPixelStats({ percent: 0, canvasReady: false });
          return;
        }
        ctxA.drawImage(imgA, 0, 0);
        ctxB.drawImage(imgB, 0, 0);
        const dataA = ctxA.getImageData(0, 0, w, h).data;
        const dataB = ctxB.getImageData(0, 0, w, h).data;
        const out = ctx!.createImageData(w, h);
        let changed = 0;
        const total = w * h;
        for (let i = 0; i < out.data.length; i += 4) {
          const dr = Math.abs(dataA[i] - dataB[i]);
          const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
          const db = Math.abs(dataA[i + 2] - dataB[i + 2]);
          const da = Math.abs(dataA[i + 3] - dataB[i + 3]);
          if (dr + dg + db + da > 8) {
            changed += 1;
            out.data[i] = 244;
            out.data[i + 1] = 63;
            out.data[i + 2] = 166;
            out.data[i + 3] = 255;
          } else {
            out.data[i] = Math.round(dataB[i] * 0.35);
            out.data[i + 1] = Math.round(dataB[i + 1] * 0.35);
            out.data[i + 2] = Math.round(dataB[i + 2] * 0.35);
            out.data[i + 3] = Math.max(40, Math.round(dataB[i + 3] * 0.45));
          }
        }
        ctx!.putImageData(out, 0, 0);
        if (!cancelled) {
          setPixelStats({
            percent: Number(((changed / total) * 100).toFixed(2)),
            canvasReady: true,
          });
        }
      } catch {
        if (!cancelled) {
          setPixelStats({ percent: 0, canvasReady: false });
        }
      }
    };

    imgA.onload = tryRenderDiff;
    imgB.onload = tryRenderDiff;
    imgA.src = beforeUrl;
    imgB.src = afterUrl;
    return () => {
      cancelled = true;
    };
  }, [mode, beforeUrl, afterUrl]);

  const activeMode = canOverlay ? mode : "side-by-side";
  const overlayDisabledReason =
    "Requiere versión anterior y nueva cargadas localmente para comparar";

  return (
    <div className="image-diff-viewer" data-mime={diff.mime}>
      <div className="image-diff-toolbar">
        <div
          className="image-diff-modes"
          role="group"
          aria-label="Modo de comparación de imagen"
        >
          <button
            type="button"
            className={`button${activeMode === "side-by-side" ? " active" : ""}`}
            aria-pressed={activeMode === "side-by-side"}
            onClick={() => setMode("side-by-side")}
          >
            Lado a lado
          </button>
          <button
            type="button"
            className={`button${activeMode === "swipe" ? " active" : ""}`}
            aria-pressed={activeMode === "swipe"}
            disabled={!canOverlay}
            title={!canOverlay ? overlayDisabledReason : undefined}
            onClick={() => setMode("swipe")}
          >
            Cortina
          </button>
          <button
            type="button"
            className={`button${activeMode === "onion" ? " active" : ""}`}
            aria-pressed={activeMode === "onion"}
            disabled={!canOverlay}
            title={!canOverlay ? overlayDisabledReason : undefined}
            onClick={() => setMode("onion")}
          >
            Onion-skin
          </button>
          <button
            type="button"
            className={`button${activeMode === "pixel" ? " active" : ""}`}
            aria-pressed={activeMode === "pixel"}
            disabled={!canOverlay}
            title={!canOverlay ? overlayDisabledReason : undefined}
            onClick={() => setMode("pixel")}
          >
            Pixel-diff
          </button>
        </div>

        <div className="image-diff-meta">
          <span>{sizeDeltaText(diff.before, diff.after)}</span>
          {(beforeDims || afterDims) && (
            <span>
              {beforeDims ? `${beforeDims.width}×${beforeDims.height}` : "—"} →{" "}
              {afterDims ? `${afterDims.width}×${afterDims.height} px` : "—"}
            </span>
          )}
          {onToggleText && (
            <button type="button" className="button" onClick={onToggleText}>
              {toggleTextLabel}
            </button>
          )}
        </div>
      </div>

      {activeMode === "side-by-side" && (
        <div className="image-diff-side-grid">
          <figure className="image-diff-card">
            <figcaption>
              <span>{diff.before?.label ?? "Antes"}</span>
              {diff.before && (
                <span>
                  {formatBytes(diff.before.bytes)}
                  {beforeDims
                    ? ` · ${beforeDims.width}×${beforeDims.height}`
                    : ""}
                </span>
              )}
            </figcaption>
            <div className="image-diff-stage">
              {diff.before?.dataUrl ? (
                <img
                  src={diff.before.dataUrl}
                  alt={diff.before.label}
                  onLoad={(e) =>
                    setBeforeDims({
                      width: e.currentTarget.naturalWidth,
                      height: e.currentTarget.naturalHeight,
                    })
                  }
                />
              ) : (
                <SideNotice
                  side={diff.before}
                  emptyText="No existía en la versión anterior."
                />
              )}
            </div>
          </figure>

          <figure className="image-diff-card">
            <figcaption>
              <span>{diff.after?.label ?? "Después"}</span>
              {diff.after && (
                <span>
                  {formatBytes(diff.after.bytes)}
                  {afterDims ? ` · ${afterDims.width}×${afterDims.height}` : ""}
                </span>
              )}
            </figcaption>
            <div className="image-diff-stage">
              {diff.after?.dataUrl ? (
                <img
                  src={diff.after.dataUrl}
                  alt={diff.after.label}
                  onLoad={(e) =>
                    setAfterDims({
                      width: e.currentTarget.naturalWidth,
                      height: e.currentTarget.naturalHeight,
                    })
                  }
                />
              ) : (
                <SideNotice
                  side={diff.after}
                  emptyText="Eliminada en esta versión."
                />
              )}
            </div>
          </figure>
        </div>
      )}

      {activeMode === "swipe" && beforeUrl && afterUrl && (
        <div className="image-diff-interactive">
          <div className="image-diff-slider-row">
            <label htmlFor="image-swipe-range">Cortina: {swipePos}%</label>
            <input
              id="image-swipe-range"
              type="range"
              min={0}
              max={100}
              value={swipePos}
              aria-label="Posición de cortina"
              onChange={(e) => setSwipePos(Number(e.currentTarget.value))}
            />
          </div>
          <div className="image-diff-stage image-diff-overlay">
            <img
              src={beforeUrl}
              alt={diff.before?.label ?? "Antes"}
              className="image-diff-base"
            />
            <img
              src={afterUrl}
              alt={diff.after?.label ?? "Después"}
              className="image-diff-top"
              style={{ clipPath: `inset(0 ${100 - swipePos}% 0 0)` }}
            />
            <div
              className="image-diff-swipe-line"
              style={{ left: `${swipePos}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
      )}

      {activeMode === "onion" && beforeUrl && afterUrl && (
        <div className="image-diff-interactive">
          <div className="image-diff-slider-row">
            <label htmlFor="image-onion-range">
              Opacidad nueva: {onionOpacity}%
            </label>
            <input
              id="image-onion-range"
              type="range"
              min={0}
              max={100}
              value={onionOpacity}
              aria-label="Opacidad de capa nueva"
              onChange={(e) => setOnionOpacity(Number(e.currentTarget.value))}
            />
          </div>
          <div className="image-diff-stage image-diff-overlay">
            <img
              src={beforeUrl}
              alt={diff.before?.label ?? "Antes"}
              className="image-diff-base"
            />
            <img
              src={afterUrl}
              alt={diff.after?.label ?? "Después"}
              className="image-diff-top"
              style={{ opacity: onionOpacity / 100 }}
            />
          </div>
        </div>
      )}

      {activeMode === "pixel" && beforeUrl && afterUrl && (
        <div className="image-diff-interactive">
          <div className="image-diff-slider-row">
            <span>
              {pixelStats?.canvasReady
                ? `Píxeles modificados: ${pixelStats.percent}% (resaltados en magenta)`
                : "Diferencia visual de píxeles"}
            </span>
          </div>
          <div className="image-diff-stage image-diff-overlay">
            <canvas
              ref={canvasRef}
              className="image-diff-canvas"
              style={{
                display: pixelStats?.canvasReady ? "block" : "none",
              }}
            />
            {(!pixelStats || !pixelStats.canvasReady) && (
              <>
                <img
                  src={beforeUrl}
                  alt={diff.before?.label ?? "Antes"}
                  className="image-diff-base"
                />
                <img
                  src={afterUrl}
                  alt={diff.after?.label ?? "Después"}
                  className="image-diff-top image-diff-blend"
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

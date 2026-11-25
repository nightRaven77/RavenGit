import { authorIdentity } from "./AuthorAvatar";
import type { GraphRow, Segment } from "./graph";

export interface GraphCellProps {
  row: GraphRow;
  width: number;
  colors: readonly string[];
  rowHeight?: number;
  isHead?: boolean;
  hasRefs?: boolean;
  style?: "compact" | "tributary";
  authorName?: string;
  refSide?: "left" | "right";
}

export default function GraphCell({
  row,
  width,
  colors,
  rowHeight = 42,
  isHead = false,
  hasRefs = false,
  style = "compact",
  authorName = "",
  refSide = "right",
}: GraphCellProps) {
  const isTributary = style === "tributary";
  const laneStep = isTributary ? 34 : 20;
  const baseOffset = isTributary ? 26 : 18;
  const x = (lane: number) => baseOffset + lane * laneStep;
  const midY = rowHeight / 2;
  const colorFor = (index: number) =>
    colors.length ? colors[index % colors.length] : "#52b7ff";
  const nodeColor = colorFor(row.color);
  const cx = x(row.lane);

  const pathFor = (segment: Segment) => {
    const start = segment.kind === "parent" ? midY : 0;
    const end = segment.kind === "incoming" ? midY : rowHeight;
    const x1 = x(segment.from);
    const x2 = x(segment.to);
    if (segment.from === segment.to) {
      return `M ${x1} ${start} V ${end}`;
    }
    if (isTributary) {
      // Suave trazo estilo mapa de metro con codo redondeado amplio
      const mid = (start + end) / 2;
      const ctrl1 = start + (mid - start) * 0.85;
      const ctrl2 = end - (end - mid) * 0.85;
      return `M ${x1} ${start} C ${x1} ${ctrl1}, ${x2} ${ctrl2}, ${x2} ${end}`;
    }
    const mid = (start + end) / 2;
    return `M ${x1} ${start} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${end}`;
  };

  const straightSegments = row.segments.filter((s) => s.from === s.to);
  const curvedSegments = row.segments.filter((s) => s.from !== s.to);
  const strokeWidth = isTributary ? 2.8 : 2.5;
  const haloWidth = isTributary ? 5.6 : 4.6;
  const identity = isTributary ? authorIdentity(authorName || "?") : null;

  const connectorLine = (() => {
    if (!hasRefs && !isHead) return null;
    const gap = isTributary ? 15.5 : 6;
    if (refSide === "left") {
      const endX = Math.max(0, cx - gap);
      if (endX <= 1) return null;
      return (
        <line
          x1={0}
          y1={midY}
          x2={endX}
          y2={midY}
          stroke={nodeColor}
          strokeWidth={1.8}
          strokeOpacity={0.62}
        />
      );
    }
    return (
      <line
        x1={cx + gap}
        y1={midY}
        x2={width}
        y2={midY}
        stroke={nodeColor}
        strokeWidth={1.6}
        strokeOpacity={0.55}
      />
    );
  })();

  return (
    <svg
      className="graph-cell"
      width={width}
      height={rowHeight}
      aria-hidden="true"
    >
      {straightSegments.map((segment, index) => (
        <path
          key={`s-${index}`}
          d={pathFor(segment)}
          fill="none"
          stroke={colorFor(segment.color)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          opacity={segment.kind === "through" ? 0.82 : 1}
        />
      ))}
      {curvedSegments.map((segment, index) => {
        const d = pathFor(segment);
        const stroke = colorFor(segment.color);
        return (
          <g key={`c-${index}`}>
            <path
              d={d}
              fill="none"
              stroke="var(--bg-canvas)"
              strokeWidth={haloWidth}
              strokeLinecap="round"
              opacity={0.9}
            />
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              opacity={segment.kind === "through" ? 0.82 : 1}
            />
          </g>
        );
      })}
      {connectorLine}
      {isTributary && identity ? (
        <g className="graph-avatar-node">
          {(isHead || hasRefs) && (
            <circle
              cx={cx}
              cy={midY}
              r={isHead ? 18.5 : 16.8}
              fill={nodeColor}
              opacity={isHead ? 0.24 : 0.16}
            />
          )}
          <circle cx={cx} cy={midY} r={15.4} fill="var(--bg-canvas)" />
          {row.isMerge && (
            <circle
              cx={cx}
              cy={midY}
              r={15.8}
              fill="none"
              stroke={nodeColor}
              strokeWidth={1.35}
              strokeDasharray="2.8 2"
              opacity={0.85}
            />
          )}
          {row.isRoot ? (
            <rect
              x={cx - 13}
              y={midY - 13}
              width={26}
              height={26}
              rx={7}
              fill={identity.background}
              stroke={nodeColor}
              strokeWidth={2.4}
            />
          ) : (
            <circle
              cx={cx}
              cy={midY}
              r={13.5}
              fill={identity.background}
              stroke={nodeColor}
              strokeWidth={isHead ? 2.8 : 2.2}
            />
          )}
          <text
            x={cx}
            y={midY}
            fill="#f8fafc"
            fontSize="11"
            fontWeight="700"
            textAnchor="middle"
            dominantBaseline="central"
            style={{ letterSpacing: "0.02em" }}
          >
            {identity.initials}
          </text>
        </g>
      ) : isHead ? (
        <g>
          <circle cx={cx} cy={midY} r={9} fill={nodeColor} opacity={0.24} />
          <circle cx={cx} cy={midY} r={6.4} fill="var(--bg-canvas)" />
          <circle
            cx={cx}
            cy={midY}
            r={5.4}
            fill={nodeColor}
            stroke={nodeColor}
            strokeWidth={1.5}
          />
          <circle cx={cx} cy={midY} r={2.1} fill="var(--bg-canvas)" />
        </g>
      ) : row.isMerge ? (
        <g>
          <circle cx={cx} cy={midY} r={6.4} fill="var(--bg-canvas)" />
          <circle
            cx={cx}
            cy={midY}
            r={5.3}
            fill="var(--bg-canvas)"
            stroke={nodeColor}
            strokeWidth={2.3}
          />
          <circle cx={cx} cy={midY} r={2.2} fill={nodeColor} />
        </g>
      ) : row.isRoot ? (
        <rect
          x={cx - 4.25}
          y={midY - 4.25}
          width={8.5}
          height={8.5}
          rx={2.5}
          fill={nodeColor}
          stroke="var(--bg-canvas)"
          strokeWidth={1.5}
        />
      ) : hasRefs ? (
        <g>
          <circle cx={cx} cy={midY} r={7.4} fill={nodeColor} opacity={0.2} />
          <circle
            cx={cx}
            cy={midY}
            r={4.8}
            fill={nodeColor}
            stroke="var(--bg-canvas)"
            strokeWidth={1.5}
          />
        </g>
      ) : (
        <circle
          cx={cx}
          cy={midY}
          r={4.2}
          fill={nodeColor}
          stroke="var(--bg-canvas)"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}

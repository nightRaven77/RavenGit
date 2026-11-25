import type { GraphRow, Segment } from "./graph";

export interface GraphCellProps {
  row: GraphRow;
  width: number;
  colors: readonly string[];
  rowHeight?: number;
  isHead?: boolean;
  hasRefs?: boolean;
}

export default function GraphCell({
  row,
  width,
  colors,
  rowHeight = 42,
  isHead = false,
  hasRefs = false,
}: GraphCellProps) {
  const x = (lane: number) => 18 + lane * 20;
  const midY = rowHeight / 2;
  const colorFor = (index: number) =>
    colors.length ? colors[index % colors.length] : "#52b7ff";
  const nodeColor = colorFor(row.color);
  const cx = x(row.lane);

  const pathFor = (segment: Segment) => {
    const start = segment.kind === "parent" ? midY : 0;
    const end = segment.kind === "incoming" ? midY : rowHeight;
    if (segment.from === segment.to) {
      return `M ${x(segment.from)} ${start} V ${end}`;
    }
    const mid = (start + end) / 2;
    return `M ${x(segment.from)} ${start} C ${x(segment.from)} ${mid}, ${x(segment.to)} ${mid}, ${x(segment.to)} ${end}`;
  };

  const straightSegments = row.segments.filter((s) => s.from === s.to);
  const curvedSegments = row.segments.filter((s) => s.from !== s.to);

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
          strokeWidth={2.5}
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
              strokeWidth={4.6}
              strokeLinecap="round"
              opacity={0.88}
            />
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={segment.kind === "through" ? 0.82 : 1}
            />
          </g>
        );
      })}
      {(hasRefs || isHead) && (
        <line
          x1={cx + 6}
          y1={midY}
          x2={width}
          y2={midY}
          stroke={nodeColor}
          strokeWidth={1.6}
          strokeOpacity={0.55}
        />
      )}
      {isHead ? (
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

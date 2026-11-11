import type { Commit } from "./types";
export interface Segment {
  from: number;
  to: number;
  kind: "through" | "incoming" | "parent";
  target: string;
}
export interface GraphRow {
  lane: number;
  segments: Segment[];
  width: number;
}
export function layoutGraph(commits: Commit[]): GraphRow[] {
  const lanes: (string | null)[] = [];
  return commits.map((commit) => {
    const before = [...lanes];
    let lane = lanes.indexOf(commit.hash);
    if (lane === -1) {
      lane = lanes.indexOf(null);
      if (lane === -1) lane = lanes.length;
    }
    lanes[lane] = null;
    const parents: { lane: number; hash: string }[] = [];
    for (const hash of commit.parents) {
      let target = lanes.indexOf(hash);
      if (target === -1) {
        target = lanes.indexOf(null);
        if (target === -1) target = lanes.length;
        lanes[target] = hash;
      }
      parents.push({ lane: target, hash });
    }
    const segments: Segment[] = [];
    before.forEach((hash, index) => {
      if (hash === commit.hash)
        segments.push({
          from: index,
          to: lane,
          kind: "incoming",
          target: hash,
        });
      else if (hash)
        segments.push({
          from: index,
          to: lanes.indexOf(hash),
          kind: "through",
          target: hash,
        });
    });
    parents.forEach((parent) =>
      segments.push({
        from: lane,
        to: parent.lane,
        kind: "parent",
        target: parent.hash,
      }),
    );
    const width = Math.max(before.length, lanes.length, lane + 1);
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    return { lane, segments, width };
  });
}

export function graphPixelWidth(
  rows: readonly Pick<GraphRow, "width">[],
): number {
  let width = 92;
  for (const row of rows) width = Math.max(width, row.width * 20 + 28);
  return width;
}

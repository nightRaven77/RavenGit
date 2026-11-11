export interface Commit {
  hash: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
}
export interface GitRef {
  name: string;
  hash: string;
  kind: "branch" | "remote" | "tag" | "other";
}
export interface HistoryPage {
  commits: Commit[];
  nextOffset: number | null;
  generation: string;
}
export interface Snapshot {
  id: string;
  path: string;
  name: string;
  head: string | null;
  branch: string | null;
  shallow: boolean;
  refs: GitRef[];
  page: HistoryPage;
}
export interface CommitDiff {
  hash: string;
  text: string;
  parent: string | null;
  parentCount: number;
}
export type ChangeArea = "staged" | "unstaged";
export interface ChangeEntry {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  untracked: boolean;
  conflict: boolean;
  submodule: boolean;
}
export interface ChangesState {
  token: string;
  entries: ChangeEntry[];
  head: string | null;
  branch: string | null;
  author: string | null;
  operation: string | null;
  trusted: boolean;
}
export interface DiffHunk {
  index: number;
  header: string;
  text: string;
}
export interface FileDiff {
  previewToken: string;
  token: string;
  path: string;
  area: ChangeArea;
  text: string;
  hunks: DiffHunk[];
  partialAllowed: boolean;
  partialReason: string | null;
}
export interface MutationResult {
  commitHash: string | null;
  changes: ChangesState | null;
  warning: string | null;
}

export interface RemoteInfo {
  name: string;
  fetchUrls: string[];
  pushUrls: string[];
  editUrl: string | null;
  editPushUrl: string | null;
  provider: string;
  editable: boolean;
  fetchAllowed: boolean;
  pushAllowed: boolean;
  restriction: string | null;
  trackingCount: number;
  upstreamBranches: string[];
}
export interface RemotesState {
  token: string;
  remotes: RemoteInfo[];
  trusted: boolean;
}
export interface RemoteOperationResult {
  state: RemotesState | null;
  message: string;
  completedAt: number | null;
  warning: string | null;
}

export interface PushOptions {
  branches: string[];
  current: string | null;
}
export interface PushPreview {
  token: string;
  remote: string;
  url: string;
  sourceBranch: string;
  sourceHash: string;
  targetBranch: string;
  targetHash: string | null;
  ahead: number;
  behind: number;
  relation: "new" | "equal" | "ahead" | "behind" | "diverged";
  commits: { hash: string; subject: string }[];
  canPush: boolean;
  setUpstream: boolean;
}
export interface PushOutcome {
  status: "confirmed" | "unchanged" | "uncertain";
  message: string;
  warning: string | null;
  state: RemotesState | null;
}

export interface BranchesState {
  rebaseRecord?: boolean;
  operation?: string | null;
  token: string;
  trusted: boolean;
  current: string | null;
  head: string | null;
  branches: { name: string; hash: string }[];
  restriction: string | null;
}
export type BranchEdit =
  | { kind: "create"; name: string }
  | { kind: "switch"; name: string }
  | { kind: "rename"; source: string; name: string };
export interface BranchOutcome {
  message: string;
  warning: string | null;
}

export interface MergePreview {
  token: string;
  source: string;
  destination: string;
  sourceHash: string;
  destinationHash: string;
  relation: "upToDate" | "fastForward" | "diverged";
  incoming: number;
  local: number;
  commits: { hash: string; subject: string }[];
  truncated: boolean;
  shallow: boolean;
}

export interface MergeState {
  token: string;
  branch: string | null;
  head: string | null;
  sourceHash: string;
  conflicts: string[];
  staged: string[];
  canContinue: boolean;
  restriction: string | null;
}

export type MergeEdit =
  | {
      kind: "start";
      source: string;
      sourceHash: string;
      destinationHash: string;
    }
  | { kind: "resolve"; path: string }
  | { kind: "continue"; message: string }
  | { kind: "abort" };

export interface PullOptions {
  token: string;
  trusted: boolean;
  branch: string | null;
  remote: string | null;
  remoteBranch: string | null;
  url: string | null;
  restriction: string | null;
}

export interface PullPreview {
  token: string;
  remote: string;
  remoteBranch: string;
  url: string;
  fetchedAt: number;
  merge: MergePreview;
}
export type RebasePreview = {
  token: string;
  branch: string;
  base: string;
  headHash: string;
  baseHash: string;
  relation: "upToDate" | "fastForward" | "diverged";
  candidates: number;
  commits: { hash: string; subject: string }[];
  truncated: boolean;
  containsMerges: boolean;
  interactive?: { token: string; steps: RebaseStep[] } | null;
};
export type RebaseStep = {
  hash: string;
  action: "pick" | "reword" | "squash" | "fixup" | "drop";
  message: string;
};
export type RebaseEdit =
  | { kind: "continue" }
  | { kind: "abort" }
  | { kind: "clearRecord" }
  | { kind: "resolve"; path: string };
export type RebaseState = {
  active: boolean;
  token: string;
  branch: string;
  original: string;
  base: string;
  backup: string | null;
  conflicts: string[];
  canContinue: boolean;
};

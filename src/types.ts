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
  trusted?: boolean;
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
export interface CommitFile {
  path: string;
  oldPath: string | null;
  status: string;
  additions: number | null;
  deletions: number | null;
  binary: boolean;
}
export interface CommitFiles {
  hash: string;
  parent: string | null;
  parentCount: number;
  files: CommitFile[];
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
export interface WorktreeSummary {
  trusted: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicts: number;
  total: number;
  operation: string | null;
}
export type RepoChangeKind = "worktree" | "git" | "both";
export interface RepoChangedEvent {
  id: string;
  kind: RepoChangeKind;
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
export interface WorktreeItem {
  path: string;
  name: string;
  head: string | null;
  branch: string | null;
  detached: boolean;
  bare: boolean;
  main: boolean;
  current: boolean;
  locked: boolean;
  lockReason: string | null;
  prunable: boolean;
  prunableReason: string | null;
}
export interface WorktreesState {
  trusted: boolean;
  currentPath: string;
  worktrees: WorktreeItem[];
  branches: string[];
  restriction: string | null;
}
export interface WorktreeOutcome {
  message: string;
  createdPath: string | null;
  state: WorktreesState;
}
export type AddWorktreeRequest =
  | {
      mode: "newBranch";
      path: string;
      branch: string;
      baseRef: string | null;
    }
  | {
      mode: "existingBranch";
      path: string;
      branch: string;
    }
  | {
      mode: "detached";
      path: string;
      startPoint: string | null;
    };
export type CodeSearchMode = "literal" | "regex";
export interface SearchQuery {
  scope?: string | null;
  message?: string | null;
  author?: string | null;
  hash?: string | null;
  since?: string | null;
  until?: string | null;
  path?: string | null;
  regex?: boolean;
  codeQuery?: string | null;
  codeMode?: CodeSearchMode | null;
  offset?: number;
  limit?: number;
}
export interface SearchResult {
  commits: Commit[];
  nextOffset: number | null;
  truncated: boolean;
}
export interface SearchMatchDiff {
  hash: string;
  text: string;
}
export interface FileHistoryEntry {
  commit: Commit;
  path: string;
  oldPath: string | null;
  status: string;
}
export interface FileHistoryPage {
  path: string;
  entries: FileHistoryEntry[];
  nextOffset: number | null;
}
export interface BlameLine {
  lineNumber: number;
  hash: string;
  author: string;
  date: string;
  summary: string;
  content: string;
}
export interface FileBlame {
  path: string;
  commit: string;
  lines: BlameLine[];
}
export interface RangeFiles {
  base: string;
  target: string;
  files: CommitFile[];
}
export interface RangeDiff {
  base: string;
  target: string;
  text: string;
}
export interface EnvironmentStatus {
  os: string;
  gitAvailable: boolean;
  gitVersion: string | null;
  lfsAvailable: boolean;
  lfsVersion: string | null;
  gixEnabled: boolean;
}
export interface SnapshotFile {
  path: string;
  status: string;
  existed: boolean;
  sha256: string | null;
  size: number;
}
export interface SnapshotSummary {
  id: string;
  createdAt: number;
  label: string;
  trigger: string;
  branch: string | null;
  head: string | null;
  totalBytes: number;
  fileCount: number;
  files: SnapshotFile[];
}
export interface SnapshotList {
  snapshots: SnapshotSummary[];
  totalBytes: number;
  count: number;
}
export interface SnapshotCaptureOutcome {
  created: boolean;
  deduplicated: boolean;
  snapshot: SnapshotSummary | null;
  list: SnapshotList;
  message: string;
}
export interface SnapshotRestoreFilePreview {
  path: string;
  action: "restore" | "recreate" | "delete" | "unchanged" | string;
  bytesBefore: number;
  bytesAfter: number;
}
export interface SnapshotRestorePlan {
  token: string;
  snapshotId: string;
  label: string;
  createdAt: number;
  snapshotBranch: string | null;
  snapshotHead: string | null;
  currentBranch: string | null;
  currentHead: string | null;
  branchMismatch: boolean;
  headMismatch: boolean;
  files: SnapshotRestoreFilePreview[];
  summary: string;
}
export interface SnapshotRestoreOutcome {
  snapshotId: string;
  backupSnapshotId: string | null;
  restoredFiles: number;
  message: string;
}
export interface UndoRefState {
  branch: string | null;
  head: string | null;
}
export interface UndoEntry {
  id: string;
  timestamp: number;
  kind: string;
  label: string;
  before: UndoRefState;
  after: UndoRefState;
  movesRefs: boolean;
}
export interface UndoState {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  nextUndo: UndoEntry | null;
  nextRedo: UndoEntry | null;
  recentUndo: UndoEntry[];
}
export interface UndoPlan {
  token: string;
  direction: "undo" | "redo" | string;
  entry: UndoEntry;
  currentBranch: string | null;
  currentHead: string | null;
  targetBranch: string | null;
  targetHead: string | null;
  requiresConfirmation: boolean;
  summary: string;
  warning: string | null;
}
export interface UndoOutcome {
  direction: string;
  message: string;
  state: UndoState;
}
export interface ImageSide {
  label: string;
  dataUrl: string | null;
  mime: string;
  bytes: number;
  isLfsPointer: boolean;
  tooLarge: boolean;
}
export interface ImageDiff {
  path: string;
  oldPath: string | null;
  mime: string;
  before: ImageSide | null;
  after: ImageSide | null;
}
export type ImageDiffSource =
  | {
      kind: "worktree";
      path: string;
      area: "staged" | "unstaged";
    }
  | {
      kind: "commit";
      hash: string;
      parentIndex: number;
      path: string;
      oldPath: string | null;
    }
  | {
      kind: "range";
      base: string;
      target: string;
      path: string;
      oldPath: string | null;
    };
export interface LfsFile {
  path: string;
  oid: string;
  downloaded: boolean;
  sizeLabel: string | null;
}
export interface LfsLock {
  id: string;
  path: string;
  owner: string;
  lockedAt: string | null;
}
export interface LfsStatus {
  installed: boolean;
  version: string | null;
  configured: boolean;
  trackedPatterns: string[];
  files: LfsFile[];
  locks: LfsLock[];
  cacheBytes: number;
  trusted: boolean;
}
export interface LfsActionOutcome {
  message: string;
  status: LfsStatus;
}
export interface SubmoduleEntry {
  name: string;
  path: string;
  url: string | null;
  branch: string | null;
  head: string;
  describe: string | null;
  status: "clean" | "uninitialized" | "modified" | "conflict" | string;
  initialized: boolean;
}
export interface SubmoduleList {
  submodules: SubmoduleEntry[];
  trusted: boolean;
}
export type SubmoduleAction =
  | {
      kind: "initUpdate";
      path: string | null;
      recursive: boolean;
    }
  | {
      kind: "syncUrls";
      path: string | null;
    };
export interface SubmoduleOutcome {
  message: string;
  list: SubmoduleList;
}

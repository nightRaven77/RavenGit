export type OperationKey =
  | "initialize"
  | "clone"
  | "stage"
  | "unstage"
  | "commit"
  | "amend"
  | "branch"
  | "remote"
  | "fetch"
  | "pull"
  | "push"
  | "tag"
  | "publishTag"
  | "stash"
  | "merge"
  | "rebase"
  | "replay"
  | "conflict"
  | "restoreConflict"
  | "trust"
  | "sshAccounts";

export type OperationStatus =
  "progress" | "confirmed" | "unchanged" | "warning" | "uncertain" | "error";

export type OperationReport = {
  id: string;
  repoId?: string;
  operation: OperationKey;
  status: OperationStatus;
  title: string;
  message: string;
  destination?: string;
  warning?: string;
};

export const operationEvent = "ravengit-operation-result";

export function nextOperationId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `operation-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export function emitOperation(report: OperationReport) {
  window.dispatchEvent(
    new CustomEvent<OperationReport>(operationEvent, { detail: report }),
  );
}

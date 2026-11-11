export type HistoryPreferences = {
  inspectorOpen: boolean;
  inspectorSize: number;
  authorWidth: number;
  showDate: boolean;
  showHash: boolean;
  scope: string;
  query: string;
  selectedCommit: string | null;
};
export type LibraryEntry = {
  path: string;
  name: string;
  pinned: boolean;
  lastOpened: number;
  preferences: HistoryPreferences;
  collectionId: string | null;
};
export type RepositoryCollection = { id: string; name: string };
export type RepositoryLibrary = {
  version: number;
  repositories: LibraryEntry[];
  collections: RepositoryCollection[];
};
export type CollectionEdit =
  | { kind: "createCollection"; name: string }
  | { kind: "renameCollection"; id: string; name: string }
  | { kind: "removeCollection"; id: string }
  | { kind: "moveCollection"; id: string; direction: "up" | "down" }
  | { kind: "assignCollection"; path: string; collectionId: string | null };

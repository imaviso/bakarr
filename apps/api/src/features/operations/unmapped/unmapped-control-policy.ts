import type { UnmappedFolder } from "@packages/shared/index.ts";
import {
  markUnmappedFolderPaused,
  markUnmappedFolderPending,
  resetUnmappedFolderMatch,
} from "@/features/operations/unmapped/unmapped-folders.ts";

export type UnmappedFolderControlAction = "pause" | "resume" | "reset";
export type UnmappedFolderBulkControlAction =
  | "pause_queued"
  | "resume_paused"
  | "reset_failed"
  | "retry_failed";

export function transitionUnmappedFolderForControlAction(
  folder: UnmappedFolder,
  action: UnmappedFolderControlAction,
) {
  if (action === "pause") {
    return markUnmappedFolderPaused(folder);
  }

  if (action === "resume") {
    return markUnmappedFolderPending(folder);
  }

  return resetUnmappedFolderMatch(folder);
}

export function transitionUnmappedFoldersForBulkControlAction(
  folders: readonly UnmappedFolder[],
  action: UnmappedFolderBulkControlAction,
) {
  if (action === "pause_queued") {
    return folders
      .filter((folder) => folder.match_status === "pending")
      .map((folder) => markUnmappedFolderPaused(folder));
  }

  if (action === "resume_paused") {
    return folders
      .filter((folder) => folder.match_status === "paused")
      .map((folder) => markUnmappedFolderPending(folder));
  }

  return folders
    .filter((folder) => folder.match_status === "failed")
    .map((folder) => resetUnmappedFolderMatch(folder));
}

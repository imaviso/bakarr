import { MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS, type UnmappedFolder } from "~/api";
import { Schema } from "effect";

export function folderStatusLabel(folder: UnmappedFolder) {
  switch (folder.match_status) {
    case "matching":
      return "Matching";
    case "paused":
      return "Paused";
    case "done":
      return folder.suggested_matches.length > 0 ? "Matched" : "No match";
    case "failed":
      return hasAutomaticRetryRemaining(folder) ? "Retrying soon" : "Needs review";
    case "pending":
    default:
      return "Queued";
  }
}

export function folderMatchHint(folder: UnmappedFolder) {
  switch (folder.match_status) {
    case "matching":
      return "Searching AniList in the background now.";
    case "paused":
      return "Automatic matching is paused for this folder. Start it again or refresh when you are ready.";
    case "failed":
      return hasAutomaticRetryRemaining(folder)
        ? folder.last_match_error
          ? `Last attempt failed: ${folder.last_match_error}. Another background pass is queued.`
          : "The last attempt failed. Another background pass is queued."
        : folder.last_match_error
          ? `Automatic matching stopped after ${MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS} failed attempts: ${folder.last_match_error}`
          : `Automatic matching stopped after ${MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS} failed attempts.`;
    case "done":
      return folder.suggested_matches.length > 0
        ? "Automatic suggestions are ready. You can import immediately or change the match."
        : "No automatic match was found in the latest background pass. Search manually to continue.";
    case "pending":
    default:
      return "Queued for the next background match pass. Folders are processed one by one.";
  }
}

export function emptyMatchMessage(folder: UnmappedFolder) {
  switch (folder.match_status) {
    case "matching":
      return "Matching in background...";
    case "paused":
      return "Automatic matching is paused for this folder.";
    case "failed":
      return hasAutomaticRetryRemaining(folder)
        ? "Automatic match failed for now. Another retry is queued."
        : "Automatic matching is paused. Search for an anime to import.";
    case "pending":
      return "Queued for the next background match pass. Search for an anime to import now, or wait for suggestions.";
    case "done":
    default:
      return "No automatic match yet. Search for an anime to import.";
  }
}

export function hasAutomaticRetryRemaining(folder: UnmappedFolder) {
  return (
    folder.match_status === "failed" &&
    (folder.match_attempts ?? 0) < MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS
  );
}

const ApiErrorSchema = Schema.Struct({
  error: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
});

export function normalizeApiErrorMessage(message: string) {
  const trimmed = message.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const result = Schema.decodeUnknownEither(ApiErrorSchema)(JSON.parse(trimmed));
    if (result._tag === "Right") {
      const decoded = result.right;
      if (decoded.error?.trim()) {
        return decoded.error;
      }
      if (decoded.message?.trim()) {
        return decoded.message;
      }
    }
    return trimmed;
  }

  return trimmed;
}

export function formatConfidencePercent(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unknown";
  }

  const clamped = Math.max(0, Math.min(1, value));
  return `${Math.round(clamped * 100)}%`;
}

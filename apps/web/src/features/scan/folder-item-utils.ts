import { MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS, type UnmappedFolder } from "@/api/contracts";
import { clampConfidencePercent } from "@/domain/format";
import { Schema } from "effect";

type MatchStatus = NonNullable<UnmappedFolder["match_status"]>;

const FOLDER_STATUS_CONFIG: Record<
  MatchStatus,
  {
    readonly hint: (folder: UnmappedFolder) => string;
    readonly empty: (folder: UnmappedFolder) => string;
    readonly label: (folder: UnmappedFolder) => string;
  }
> = {
  matching: {
    label: () => "Matching",
    hint: () => "Searching AniList in the background now.",
    empty: () => "Matching in background...",
  },
  paused: {
    label: () => "Paused",
    hint: () =>
      "Automatic matching is paused for this folder. Start it again or refresh when you are ready.",
    empty: () => "Automatic matching is paused for this folder.",
  },
  done: {
    label: (folder) => (folder.suggested_matches.length > 0 ? "Matched" : "No match"),
    hint: (folder) =>
      folder.suggested_matches.length > 0
        ? "Automatic suggestions are ready. You can import immediately or change the match."
        : "No automatic match was found in the latest background pass. Search manually to continue.",
    empty: () => "No automatic match yet. Search for an anime to import.",
  },
  failed: {
    label: (folder) => (hasAutomaticRetryRemaining(folder) ? "Retrying soon" : "Needs review"),
    hint: (folder) =>
      hasAutomaticRetryRemaining(folder)
        ? folder.last_match_error
          ? `Last attempt failed: ${folder.last_match_error}. Another background pass is queued.`
          : "The last attempt failed. Another background pass is queued."
        : folder.last_match_error
          ? `Automatic matching stopped after ${MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS} failed attempts: ${folder.last_match_error}`
          : `Automatic matching stopped after ${MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS} failed attempts.`,
    empty: (folder) =>
      hasAutomaticRetryRemaining(folder)
        ? "Automatic match failed for now. Another retry is queued."
        : "Automatic matching is paused. Search for an anime to import.",
  },
  pending: {
    label: () => "Queued",
    hint: () => "Queued for the next background match pass. Folders are processed one by one.",
    empty: () =>
      "Queued for the next background match pass. Search for an anime to import now, or wait for suggestions.",
  },
};

export function folderStatusLabel(folder: UnmappedFolder) {
  return FOLDER_STATUS_CONFIG[folder.match_status ?? "pending"].label(folder);
}

export function folderMatchHint(folder: UnmappedFolder) {
  return FOLDER_STATUS_CONFIG[folder.match_status ?? "pending"].hint(folder);
}

export function emptyMatchMessage(folder: UnmappedFolder) {
  return FOLDER_STATUS_CONFIG[folder.match_status ?? "pending"].empty(folder);
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
const ApiErrorJsonSchema = Schema.parseJson(ApiErrorSchema);

export function normalizeApiErrorMessage(message: string) {
  const trimmed = message.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const result = Schema.decodeUnknownEither(ApiErrorJsonSchema)(trimmed);
    if (result._tag === "Right") {
      const decoded = result.right;
      const error = decoded.error?.trim();
      if (error) {
        return error;
      }
      const decodedMessage = decoded.message?.trim();
      if (decodedMessage) {
        return decodedMessage;
      }
    }
    return trimmed;
  }

  return trimmed;
}

export function formatConfidencePercent(value?: number) {
  const percent = clampConfidencePercent(value);
  return percent === undefined ? "Unknown" : `${percent}%`;
}

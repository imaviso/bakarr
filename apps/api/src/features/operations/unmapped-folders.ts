import { Effect } from "effect";

import type {
  AnimeSearchResult,
  ScannerState,
  UnmappedFolder,
} from "../../../../../packages/shared/src/index.ts";

type UnmappedFolderInput = Pick<
  ScannerState["folders"][number],
  "name" | "path"
>;

const DEFAULT_SEARCH_CONCURRENCY = 4;
export const MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS = 3;
const NOISE_PATTERNS = [
  /\b(?:19|20)\d{2}\b/gi,
  /\b(?:2160|1080|720|480)p\b/gi,
  /\b(?:web[ .-]?dl|webrip|bluray|bdrip|dvdrip|remux)\b/gi,
  /\b(?:x264|x265|h[ .-]?264|h[ .-]?265|hevc|av1)\b/gi,
  /\b(?:aac(?:\d(?:[ .]?\d)?)?|flac|ac3|ddp(?:\d(?:[ .]?\d)?)?)\b/gi,
  /\b(?:multi|dub(?:bed)?|sub(?:bed)?|dual(?:[ .-]?audio)?)\b/gi,
  /\b(?:nf|amzn|cr|atvp|dsnp|uhd)\b/gi,
  /\b0\b/g,
  /\bv\d+\b/gi,
  /\b(?:proper|repack|complete|batch)\b/gi,
  /\b[A-Z0-9]{5,}\b/g,
];

export function buildUnmappedFolderSearchQueries(folderName: string): string[] {
  const expanded = folderName
    .replace(/[._]+/g, " ")
    .replace(/\bS0?(\d{1,2})\b/gi, " Season $1 ")
    .replace(/\((?:19|20)\d{2}\)/g, " ")
    .replace(/[\[\](){}-]+/g, " ");

  const primary = normalizeSearchText(stripNoise(expanded));
  const seasonless = normalizeSearchText(
    primary.replace(/\bseason\s+\d+\b/gi, " "),
  );

  return [
    ...new Set([primary, seasonless].filter((value) => value.length > 0)),
  ];
}

export const suggestUnmappedFolders = Effect.fn(
  "Operations.suggestUnmappedFolders",
)(function* (
  folders: readonly UnmappedFolderInput[],
  search: (query: string) => Effect.Effect<AnimeSearchResult[], never>,
  options?: { readonly concurrency?: number },
) {
  const queriesByFolder = new Map(
    folders.map((
      folder,
    ) => [folder.path, buildUnmappedFolderSearchQueries(folder.name)]),
  );
  const queryResults = new Map<string, readonly AnimeSearchResult[]>();
  const uniqueQueries = [
    ...new Set([...queriesByFolder.values()].flatMap((queries) => queries)),
  ];

  yield* Effect.forEach(
    uniqueQueries,
    (query) =>
      search(query).pipe(
        Effect.tap((results) =>
          Effect.sync(() => {
            queryResults.set(query, results.slice(0, 5));
          })
        ),
      ),
    {
      concurrency: options?.concurrency ?? DEFAULT_SEARCH_CONCURRENCY,
      discard: true,
    },
  );

  return folders.map((folder) => ({
    name: folder.name,
    path: folder.path,
    size: 0,
    suggested_matches: firstMatchingSuggestions(
      queriesByFolder.get(folder.path) ?? [],
      queryResults,
    ),
  })) satisfies ScannerState["folders"];
});

export function mergeUnmappedFolderSuggestions(
  folder: UnmappedFolder,
  suggestions: readonly AnimeSearchResult[],
): UnmappedFolder {
  return {
    ...folder,
    match_attempts: 0,
    last_match_error: undefined,
    last_matched_at: new Date().toISOString(),
    match_status: "done",
    suggested_matches: [...suggestions],
  };
}

export function markUnmappedFolderMatching(
  folder: UnmappedFolder,
): UnmappedFolder {
  return {
    ...folder,
    match_attempts: folder.match_attempts ?? 0,
    last_match_error: undefined,
    match_status: "matching",
  };
}

export function markUnmappedFolderPending(
  folder: UnmappedFolder,
): UnmappedFolder {
  return {
    ...folder,
    match_attempts: folder.match_attempts ?? 0,
    last_match_error: undefined,
    match_status: "pending",
  };
}

export function markUnmappedFolderRetryPending(
  folder: UnmappedFolder,
): UnmappedFolder {
  return {
    ...folder,
    match_attempts: folder.match_attempts ?? 0,
    match_status: "pending",
  };
}

export function markUnmappedFolderFailed(
  folder: UnmappedFolder,
  error: string,
): UnmappedFolder {
  const matchAttempts = (folder.match_attempts ?? 0) + 1;

  return {
    ...folder,
    match_attempts: matchAttempts,
    last_match_error: error,
    last_matched_at: new Date().toISOString(),
    match_status: "failed",
  };
}

export function hasUnmappedFolderRetryAttemptsRemaining(
  folder: Pick<UnmappedFolder, "match_attempts" | "match_status">,
) {
  return folder.match_status === "failed" &&
    (folder.match_attempts ?? 0) < MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS;
}

export function isUnmappedFolderOutstanding(
  folder: Pick<UnmappedFolder, "match_attempts" | "match_status">,
) {
  return folder.match_status === "pending" ||
    folder.match_status === "matching" ||
    hasUnmappedFolderRetryAttemptsRemaining(folder);
}

function stripNoise(value: string) {
  return NOISE_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, " "),
    value,
  );
}

function normalizeSearchText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatchingSuggestions(
  queries: readonly string[],
  queryResults: ReadonlyMap<string, readonly AnimeSearchResult[]>,
) {
  for (const query of queries) {
    const matches = queryResults.get(query);

    if (matches && matches.length > 0) {
      return [...matches];
    }
  }

  return [];
}

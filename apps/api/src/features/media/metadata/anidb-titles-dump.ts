import { stat as nodeStat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { Cache, Clock, Duration, Effect, Stream } from "effect";

import { type ExternalCallShape } from "@/infra/effect/retry.ts";
import { executeProviderRequest } from "@/infra/effect/provider-http.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import {
  normalizeTitleForMatch,
  scorePreNormalizedCandidate,
  tokenizeNormalizedTitle,
  type AniDbTitleCandidate,
} from "@/features/media/metadata/anidb-protocol.ts";

const ANIDB_TITLES_DUMP_URL = "https://anidb.net/api/anime-titles.dat.gz";
// Wiki policy: the dump refreshes daily and must not be requested more than
// once per day.
const ANIDB_TITLES_DUMP_TTL_MS = 24 * 60 * 60 * 1000;
const ANIDB_TITLES_DUMP_FILENAME = "anidb-anime-titles.dat.gz";
// Sanity caps: the real dump is ~1.4MB compressed / ~7MB text. Anything far
// beyond that is a corrupt payload or a gzip bomb, never a titles dump.
const ANIDB_TITLES_DUMP_MAX_BYTES = 32 * 1024 * 1024;
const ANIDB_TITLES_DUMP_MAX_DECODED_BYTES = 64 * 1024 * 1024;

export interface AniDbDumpTitle {
  readonly aid: number;
  readonly type: number;
  readonly lang: string;
  readonly title: string;
}

export interface PreparedDumpTitle extends AniDbDumpTitle {
  readonly normalized: string;
  readonly tokens: ReadonlySet<string>;
}

export interface PreparedTitlesDump {
  readonly titles: ReadonlyArray<PreparedDumpTitle>;
  readonly byNormalized: ReadonlyMap<string, ReadonlyArray<PreparedDumpTitle>>;
}

export interface AniDbDumpMatch {
  readonly aid: number;
  readonly score: number;
  readonly matchedTitle: string;
}

export function titlesDumpPathForImagesPath(imagesPath: string) {
  return join(dirname(imagesPath.replace(/\/$/, "")), ANIDB_TITLES_DUMP_FILENAME);
}

export function parseAnimeTitlesDump(text: string): ReadonlyArray<AniDbDumpTitle> {
  const titles: Array<AniDbDumpTitle> = [];

  for (const line of text.split("\n")) {
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const firstPipe = line.indexOf("|");
    const secondPipe = firstPipe < 0 ? -1 : line.indexOf("|", firstPipe + 1);
    const thirdPipe = secondPipe < 0 ? -1 : line.indexOf("|", secondPipe + 1);

    if (firstPipe < 0 || secondPipe < 0 || thirdPipe < 0) {
      continue;
    }

    const aid = globalThis.Number.parseInt(line.slice(0, firstPipe), 10);
    const type = globalThis.Number.parseInt(line.slice(firstPipe + 1, secondPipe), 10);

    if (!globalThis.Number.isInteger(aid) || aid <= 0 || !globalThis.Number.isInteger(type)) {
      continue;
    }

    const title = line.slice(thirdPipe + 1);

    if (title.length === 0) {
      continue;
    }

    titles.push({
      aid,
      lang: line.slice(secondPipe + 1, thirdPipe),
      title,
      type,
    });
  }

  return titles;
}

export function prepareAnimeTitlesDump(titles: ReadonlyArray<AniDbDumpTitle>): PreparedTitlesDump {
  const prepared = titles.map((title) => {
    const normalized = normalizeTitleForMatch(title.title);
    return { ...title, normalized, tokens: tokenizeNormalizedTitle(normalized) };
  });
  const byNormalized = new Map<string, Array<PreparedDumpTitle>>();

  for (const title of prepared) {
    if (title.normalized.length === 0) {
      continue;
    }

    const bucket = byNormalized.get(title.normalized);

    if (bucket === undefined) {
      byNormalized.set(title.normalized, [title]);
    } else {
      bucket.push(title);
    }
  }

  return { byNormalized, titles: prepared };
}

// Local aid resolution against the official titles dump. AniDB by-name UDP
// lookup demands a perfect server-side match against AniDB's idiosyncratic
// titles ("Tensei Shitara Slime Datta Ken (2024)" vs our "Tensei shitara
// Slime Datta Ken 3rd Season"), so exact UDP misses are the norm, not the
// exception. Scoring reuses the UDP-match scorer, so thresholds keep their
// meaning and verify-then-store applies unchanged.
//
// Cost note: exact hits short-circuit on the index. The fuzzy fallback only
// runs when nothing matched exactly, and every string is pre-normalized, so
// the hot loop is pure set/slice compares with no regex.
export function resolveAidFromDumpTitles(
  dump: PreparedTitlesDump,
  candidates: ReadonlyArray<AniDbTitleCandidate>,
): AniDbDumpMatch | undefined {
  if (dump.titles.length === 0 || candidates.length === 0) {
    return undefined;
  }

  const preparedCandidates = candidates.flatMap((candidate) => {
    const normalized = normalizeTitleForMatch(candidate.value);

    if (normalized.length === 0) {
      return [];
    }

    return [
      {
        normalized,
        source: candidate.source,
        tokens: tokenizeNormalizedTitle(normalized),
      },
    ];
  });

  let best: (AniDbDumpMatch & { readonly typeRank: number }) | undefined;

  const consider = (
    source: AniDbTitleCandidate["source"],
    candidateNormalized: string,
    candidateTokens: ReadonlySet<string>,
    title: PreparedDumpTitle,
  ) => {
    const score = scorePreNormalizedCandidate({
      candidateNormalized,
      candidateTokens,
      source,
      titleNormalized: title.normalized,
      titleTokens: title.tokens,
    });
    const typeRank = dumpTypeRank(title.type);

    if (
      best === undefined ||
      score > best.score ||
      (score === best.score &&
        (typeRank < best.typeRank || (typeRank === best.typeRank && title.aid < best.aid)))
    ) {
      best = { aid: title.aid, matchedTitle: title.title, score, typeRank };
    }
  };

  // Any exact hit outscores every fuzzy one (exact adds +60, fuzzy at most
  // +40), so the index pass settling anything skips the full scan.
  for (const candidate of preparedCandidates) {
    const hits = dump.byNormalized.get(candidate.normalized);

    if (hits === undefined) {
      continue;
    }

    for (const title of hits) {
      consider(candidate.source, candidate.normalized, candidate.tokens, title);
    }
  }

  if (best !== undefined) {
    return best;
  }

  for (const candidate of preparedCandidates) {
    for (const title of dump.titles) {
      consider(candidate.source, candidate.normalized, candidate.tokens, title);
    }
  }

  return best;
}

// Dump types: 1=primary, 2=synonym, 3=short, 4=official. Short titles collide
// most ("TenSura 3" style abbreviations), so they lose ties.
function dumpTypeRank(type: number) {
  switch (type) {
    case 1:
      return 0;
    case 2:
      return 1;
    case 4:
      return 2;
    case 3:
      return 3;
    default:
      return 4;
  }
}

export interface TitlesDumpCacheDeps {
  readonly client: HttpClient.HttpClient;
  readonly externalCall: ExternalCallShape;
  readonly fs: typeof FileSystem.Service;
}

// Parsed dump shared by every lookup, refreshed at most once per day. The
// cache dedupes concurrent cold loads (single download), pays parse +
// normalize once per dump version, and closes the policy race where two
// simultaneous lookups would each download. Lookup never fails: total
// failure yields an empty dump and the caller falls back to UDP probing.
export const makeTitlesDumpCache = Effect.fn("AniDbTitlesDump.makeCache")(function* (
  deps: TitlesDumpCacheDeps,
) {
  return yield* Cache.makeWith((path: string) => refreshTitlesDump({ ...deps, path }), {
    capacity: 4,
    timeToLive: () => Duration.millis(ANIDB_TITLES_DUMP_TTL_MS),
  });
});

const refreshTitlesDump = Effect.fn("AniDbTitlesDump.refresh")(function* (input: {
  readonly client: HttpClient.HttpClient;
  readonly externalCall: ExternalCallShape;
  readonly fs: typeof FileSystem.Service;
  readonly path: string;
}) {
  const now = yield* Clock.currentTimeMillis;
  const mtimeMs = yield* readMtimeMs(input.path);

  if (mtimeMs !== undefined && mtimeMs <= now && now - mtimeMs < ANIDB_TITLES_DUMP_TTL_MS) {
    const cached = yield* readDumpTitles(input.fs, input.path);

    if (cached !== undefined) {
      return cached;
    }
  }

  const downloaded = yield* downloadTitlesDump(input.client, input.externalCall);

  if (downloaded !== undefined) {
    const decoded = decodeDump(downloaded);
    const parsed = decoded === undefined ? [] : parseAnimeTitlesDump(decoded);

    if (parsed.length > 0) {
      yield* input.fs
        .writeFile(input.path, downloaded)
        .pipe(
          Effect.catch((error) =>
            Effect.logDebug("AniDB titles dump write degraded").pipe(
              Effect.annotateLogs({ error: error.message, path: input.path }),
            ),
          ),
        );
      return prepareAnimeTitlesDump(parsed);
    }

    yield* Effect.logWarning("AniDB titles dump decoded to no titles; keeping stale file").pipe(
      Effect.annotateLogs({ path: input.path }),
    );
  }

  // Stale file kept when the refresh failed or decoded empty.
  const stale = yield* readDumpTitles(input.fs, input.path);
  return stale ?? { byNormalized: new Map(), titles: [] };
});

// FileInfo carries no mtime, so freshness reads node stat directly. Only the
// timestamp is used; all content IO goes through the FileSystem service.
const readMtimeMs = Effect.fn("AniDbTitlesDump.readMtimeMs")(function* (path: string) {
  return yield* Effect.tryPromise({
    try: () => nodeStat(path).then((stats) => stats.mtimeMs),
    catch: () => undefined,
  }).pipe(Effect.orElseSucceed(() => undefined));
});

const readDumpTitles = Effect.fn("AniDbTitlesDump.readDump")(function* (
  fs: TitlesDumpCacheDeps["fs"],
  path: string,
) {
  const bytes = yield* fs
    .readFile(path)
    .pipe(
      Effect.catch((error) =>
        Effect.logDebug("AniDB titles dump read degraded").pipe(
          Effect.annotateLogs({ error: error.message, path }),
          Effect.as(undefined),
        ),
      ),
    );

  if (bytes === undefined) {
    return undefined;
  }

  const decoded = decodeDump(bytes);

  if (decoded === undefined) {
    return undefined;
  }

  return prepareAnimeTitlesDump(parseAnimeTitlesDump(decoded));
});

function decodeDump(bytes: Uint8Array): string | undefined {
  try {
    const text = gunzipSync(Buffer.from(bytes)).toString("utf-8");

    if (Buffer.byteLength(text, "utf-8") > ANIDB_TITLES_DUMP_MAX_DECODED_BYTES) {
      return undefined;
    }

    return text;
  } catch {
    return undefined;
  }
}

const downloadTitlesDump = Effect.fn("AniDbTitlesDump.download")(function* (
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
) {
  const response = yield* executeProviderRequest({
    client,
    externalCall,
    failureMessage: "AniDB titles dump",
    operation: "anidb.titles",
    request: HttpClientRequest.get(ANIDB_TITLES_DUMP_URL),
  }).pipe(
    Effect.catch((error) =>
      Effect.logWarning("AniDB titles dump download degraded").pipe(
        Effect.annotateLogs({ error: error.message, operation: error.operation }),
        Effect.as(undefined),
      ),
    ),
  );

  if (response === undefined) {
    return undefined;
  }

  const contentLength = response.headers["content-length"];
  const declaredBytes =
    contentLength === undefined ? Number.NaN : globalThis.Number.parseInt(contentLength, 10);

  if (globalThis.Number.isFinite(declaredBytes) && declaredBytes > ANIDB_TITLES_DUMP_MAX_BYTES) {
    yield* Effect.logWarning("AniDB titles dump oversized; refusing download").pipe(
      Effect.annotateLogs({ contentLength, path: ANIDB_TITLES_DUMP_URL }),
    );
    return undefined;
  }

  const chunks = yield* Stream.runCollect(HttpClientResponse.stream(Effect.succeed(response))).pipe(
    Effect.catch((cause) =>
      Effect.logWarning("AniDB titles dump body degraded").pipe(
        Effect.annotateLogs({ error: globalThis.String(cause) }),
        Effect.as(undefined),
      ),
    ),
  );

  if (chunks === undefined) {
    return undefined;
  }

  let total = 0;
  for (const chunk of chunks) {
    total += chunk.length;

    if (total > ANIDB_TITLES_DUMP_MAX_BYTES) {
      yield* Effect.logWarning("AniDB titles dump oversized; refusing download").pipe(
        Effect.annotateLogs({ path: ANIDB_TITLES_DUMP_URL, total }),
      );
      return undefined;
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return bytes;
});

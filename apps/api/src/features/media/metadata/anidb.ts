import { type Socket } from "node:dgram";
import * as HttpClient from "effect/unstable/http/HttpClient";

import type { Config } from "@packages/shared/index.ts";
import { type DatabaseError } from "@/db/database.ts";
import {
  buildTitleCandidates,
  parseAnimeLookupMatch,
  parseEpisodeResponse,
  scoreAnimeLookupCandidate,
  type AniDbEpisodeLookupInput,
  type AniDbEpisodeLookupResult,
  type AniDbEpisodeMetadata,
  type AniDbTitleCandidate,
} from "@/features/media/metadata/anidb-protocol.ts";
import {
  makeTitlesDumpCache,
  resolveAidFromDumpTitles,
  titlesDumpPathForImagesPath,
  type PreparedTitlesDump,
} from "@/features/media/metadata/anidb-titles-dump.ts";
import {
  authenticateAniDbEffect,
  encodeCommandValue,
  logoutAniDbEffect,
  sendAniDbCommandEffect,
  type AniDbRequestContext,
} from "@/features/media/metadata/anidb-command-client.ts";
import {
  closeAniDbSocketEffect,
  openAniDbSocketEffect,
  resolveAniDbPeerEffect,
} from "@/features/media/metadata/anidb-socket.ts";
import { ExternalIdMapRepository } from "@/features/media/metadata/external-id-map-repository.ts";
import { AniDbRuntimeConfigError } from "@/features/media/errors.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { StoredConfigCorruptError } from "@/features/system/errors.ts";
import { DEFAULT_ANIDB_METADATA_CONFIG } from "@/features/system/metadata-providers-config.ts";
import { ExternalCallError, ExternalCall } from "@/infra/effect/retry.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { Cache, Context, Effect, Layer, Option, Ref, Semaphore } from "effect";

const ANIDB_MIN_ANIME_MATCH_SCORE = 70;
const ANIDB_STRONG_ANIME_MATCH_SCORE = 90;

interface AniDbClientShape {
  readonly getEpisodeMetadata: (
    input: AniDbEpisodeLookupInput,
  ) => Effect.Effect<AniDbEpisodeLookupResult, ExternalCallError | AniDbRuntimeConfigError>;
}

interface AniDbRuntimeConfig {
  readonly enabled: boolean;
  readonly username: string | null;
  readonly password: string | null;
  readonly client: string;
  readonly clientVersion: number;
  readonly episodeLimit: number;
  readonly localPort: number;
  readonly titlesDumpPath: string;
}

function resolveAniDbRuntimeConfig(config: Config): AniDbRuntimeConfig {
  const anidb = config.metadata?.anidb ?? DEFAULT_ANIDB_METADATA_CONFIG;

  return {
    enabled: anidb.enabled,
    username: anidb.username ?? null,
    password: anidb.password ?? null,
    client: anidb.client,
    clientVersion: anidb.client_version,
    episodeLimit: anidb.episode_limit,
    localPort: anidb.local_port,
    titlesDumpPath: titlesDumpPathForImagesPath(config.general.images_path),
  };
}

export function normalizeEpisodeCount(unitCount: number | undefined, episodeLimit: number) {
  if (!globalThis.Number.isFinite(unitCount) || unitCount === undefined) {
    return episodeLimit;
  }

  const normalized = Math.floor(unitCount);

  if (normalized <= 0) {
    return episodeLimit;
  }

  return Math.min(normalized, episodeLimit);
}

const makeAniDbClient = Effect.fn("AniDbClient.make")(function* () {
  const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
  const idMap = yield* ExternalIdMapRepository;
  const httpClient = yield* HttpClient.HttpClient;
  const externalCall = yield* ExternalCall;
  const fs = yield* FileSystem;
  // Parsed dump shared by every lookup: dedupes concurrent cold loads
  // (single download), pays parse + normalize once per dump version.
  const titlesDumpCache = yield* makeTitlesDumpCache({ client: httpClient, externalCall, fs });
  // Serializes every socket interaction so paced packets from concurrent
  // lookups can never interleave and breach flood protection.
  const requestSemaphore = yield* Semaphore.make(1);
  const requestContext: AniDbRequestContext = {
    nextTagRef: yield* Ref.make(1),
    packetGate: yield* Semaphore.make(1),
    packetTimestampsRef: yield* Ref.make<ReadonlyArray<number>>([]),
    peer: yield* resolveAniDbPeerEffect(),
  };

  // Best-effort LOGOUT: failures are swallowed — the session dies server-side
  // on timeout and the socket always closes via the ensuring clause.
  const logoutBestEffort = Effect.fn("AniDbClient.logoutBestEffort")(function* (
    socket: Socket,
    sessionToken: string,
  ) {
    yield* logoutAniDbEffect(socket, sessionToken, requestContext).pipe(
      Effect.catch(() => Effect.void),
    );
  });

  const getEpisodeMetadata: AniDbClientShape["getEpisodeMetadata"] = Effect.fn(
    "AniDbClient.getEpisodeMetadata",
  )(function* (input: AniDbEpisodeLookupInput) {
    const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig().pipe(
      Effect.map((config) => Option.some(config)),
      Effect.catchTag("StoredConfigMissingError", () => Effect.succeed(Option.none())),
      Effect.catchTag("StoredConfigCorruptError", (error) =>
        failRuntimeConfigLoad(error, "stored config is corrupt"),
      ),
      Effect.catchTag("DatabaseError", (error) =>
        failRuntimeConfigLoad(error, "database read failed"),
      ),
    );

    if (Option.isNone(runtimeConfig)) {
      return {
        _tag: "AniDbLookupSkipped",
        reason: "runtime_config_unavailable",
      } satisfies AniDbEpisodeLookupResult;
    }

    const config = resolveAniDbRuntimeConfig(runtimeConfig.value);

    const unitCount = normalizeEpisodeCount(input.unitCount ?? undefined, config.episodeLimit);

    if (!config.enabled) {
      return { _tag: "AniDbLookupSkipped", reason: "disabled" } satisfies AniDbEpisodeLookupResult;
    }

    if (!config.username || !config.password) {
      return {
        _tag: "AniDbLookupSkipped",
        reason: "missing_credentials",
      } satisfies AniDbEpisodeLookupResult;
    }

    const username = config.username;
    const password = config.password;

    const titleCandidates = buildTitleCandidates(input.title, input.synonyms ?? undefined);

    if (titleCandidates.length === 0) {
      return {
        _tag: "AniDbLookupSkipped",
        reason: "missing_title_candidates",
      } satisfies AniDbEpisodeLookupResult;
    }

    // Session-per-lookup: the spec asks non-notification clients to LOGOUT
    // once finished instead of holding idle sessions (server timeout is 35
    // minutes), and a fresh AUTH per lookup is immune to NAT port remaps.
    //
    // The dump loads outside the socket lock: it needs no UDP pacing, and a
    // cold download must never stall unrelated lookups behind the semaphore.
    const dumpTitles = yield* Cache.get(titlesDumpCache, config.titlesDumpPath);

    return yield* requestSemaphore.withPermits(1)(
      Effect.gen(function* () {
        const socket = yield* openAniDbSocketEffect(config.localPort, {
          // Adapter edge: dgram error callbacks are plain Node events, so the
          // warning is logged through a detached fiber. Without this handler a
          // stray ICMP error on the socket would crash the process.
          onBackgroundError: (cause) =>
            Effect.runFork(
              Effect.logWarning("AniDB socket background error").pipe(
                Effect.annotateLogs({ errorMessage: cause.message }),
              ),
            ),
        });

        return yield* Effect.gen(function* () {
          const sessionToken = yield* authenticateAniDbEffect(
            socket,
            username,
            password,
            config.client,
            config.clientVersion,
            requestContext,
          );

          return yield* Effect.gen(function* () {
            const result = yield* fetchAniDbEpisodesEffect({
              unitCount,
              countKnown: input.unitCount !== undefined && input.unitCount !== null,
              dumpTitles,
              idMap,
              mediaId: input.mediaId,
              requestContext,
              sessionToken,
              socket,
              titleCandidates,
            });

            yield* logoutBestEffort(socket, sessionToken);
            return result;
          }).pipe(
            Effect.catchTag("ExternalCallError", (error) =>
              logoutBestEffort(socket, sessionToken).pipe(Effect.andThen(Effect.fail(error))),
            ),
          );
        }).pipe(Effect.ensuring(closeAniDbSocketEffect(socket)));
      }),
    );
  });

  return { getEpisodeMetadata } satisfies AniDbClientShape;
});

export class AniDbClient extends Context.Service<AniDbClient, AniDbClientShape>()(
  "@bakarr/api/AniDbClient",
) {
  static readonly layer = Layer.effect(AniDbClient, makeAniDbClient());
}

export const AniDbClientLive = AniDbClient.layer;

const logRuntimeConfigError = (error: DatabaseError | StoredConfigCorruptError, reason: string) =>
  Effect.logWarning("AniDB metadata lookup failed due to runtime config load failure").pipe(
    Effect.annotateLogs({
      cause: globalThis.String(error.cause),
      error: error.message,
      reason,
    }),
  );

const failRuntimeConfigLoad = (error: DatabaseError | StoredConfigCorruptError, reason: string) =>
  logRuntimeConfigError(error, reason).pipe(
    Effect.andThen(
      AniDbRuntimeConfigError.make({
        cause: error.cause ?? error,
        message: `AniDB lookup failed while loading runtime config: ${error.message}`,
      }),
    ),
  );

export function buildAnimeCommand(candidate: AniDbTitleCandidate, sessionToken: string) {
  return `ANIME aname=${encodeCommandValue(candidate.value)}&s=${sessionToken}`;
}

const fetchAniDbEpisodesEffect = Effect.fn("AniDbClient.fetchEpisodes")(function* (input: {
  unitCount: number;
  countKnown: boolean;
  dumpTitles: PreparedTitlesDump | undefined;
  idMap: AniDbIdMap;
  mediaId: number | undefined;
  requestContext: AniDbRequestContext;
  sessionToken: string;
  socket: Socket;
  titleCandidates: ReadonlyArray<AniDbTitleCandidate>;
}) {
  const resolvedOption = yield* resolveAnimeIdEffect({
    dumpTitles: input.dumpTitles,
    idMap: input.idMap,
    mediaId: input.mediaId,
    requestContext: input.requestContext,
    sessionToken: input.sessionToken,
    socket: input.socket,
    titleCandidates: input.titleCandidates,
  });

  if (Option.isNone(resolvedOption)) {
    return {
      _tag: "AniDbLookupSkipped",
      reason: "title_not_found",
    } satisfies AniDbEpisodeLookupResult;
  }

  const resolved = resolvedOption.value;

  const reachedEndRef = yield* Ref.make(false);
  const sawEpisodeRef = yield* Ref.make(false);
  const unitNumbers = Array.from({ length: input.unitCount }, (_, index) => index + 1);
  const episodeResults = yield* Effect.forEach(
    unitNumbers,
    (unitNumber) =>
      Effect.gen(function* () {
        const reachedEnd = yield* Ref.get(reachedEndRef);

        if (reachedEnd) {
          return Option.none<AniDbEpisodeMetadata>();
        }

        const response = yield* sendAniDbCommandEffect(
          input.socket,
          `EPISODE aid=${resolved.aid}&epno=${unitNumber}&s=${input.sessionToken}`,
          input.requestContext,
          "episode",
        );

        if (response.code === 340) {
          yield* Ref.set(reachedEndRef, true);
          return Option.none<AniDbEpisodeMetadata>();
        }

        if (response.code !== 240) {
          return yield* ExternalCallError.make({
            cause: new Error(`AniDB EPISODE failed with code ${response.code}`),
            message: "AniDB episode lookup failed",
            operation: "anidb.episode.response",
          });
        }

        yield* Ref.set(sawEpisodeRef, true);
        return Option.fromNullishOr(parseEpisodeResponse(response.lines[0], unitNumber));
      }),
    { concurrency: 1 },
  );

  const mediaUnits = episodeResults.filter(Option.isSome).map((result) => result.value);
  const sawEpisodeResponse = yield* Ref.get(sawEpisodeRef);

  yield* persistAidDecision({
    countKnown: input.countKnown,
    fetchedCount: mediaUnits.length,
    idMap: input.idMap,
    mediaId: input.mediaId,
    requestedCount: input.unitCount,
    resolved,
    sawEpisodeResponse,
  });

  return {
    _tag: "AniDbLookupSuccess",
    mediaUnits,
  } satisfies AniDbEpisodeLookupResult;
});

type AniDbIdMap = Pick<
  typeof ExternalIdMapRepository.Service,
  "deleteByAniListId" | "loadByEitherId" | "upsert"
>;

interface ResolvedAnimeId {
  readonly aid: number;
  readonly score?: number | undefined;
  readonly source: "map" | "search";
  readonly strong: boolean;
}

export type AidPersistenceDecision = "store" | "keep" | "ephemeral" | "delete";

// Verify-then-store: only strong title matches confirmed by a full episode
// fetch enter the map. Weak matches serve the current lookup only. A map hit
// is dropped only when no healthy EPISODE reply arrived at all — all-specials
// entries legitimately yield zero regular episodes, so bare emptiness never
// deletes. Shortfalls are ambiguous (airing shows also fall short).
export function decideAidPersistence(input: {
  readonly countKnown: boolean;
  readonly fetchedCount: number;
  readonly mapHit: boolean;
  readonly requestedCount: number;
  readonly sawEpisodeResponse: boolean;
  readonly strong: boolean;
}): AidPersistenceDecision {
  if (input.mapHit) {
    return input.sawEpisodeResponse ? "keep" : "delete";
  }

  if (!input.strong) {
    return "ephemeral";
  }

  if (input.countKnown && input.fetchedCount < input.requestedCount) {
    return "ephemeral";
  }

  return "store";
}

const loadMapAid = Effect.fn("AniDbClient.loadMapAid")(function* (
  idMap: AniDbIdMap,
  mediaId: number,
) {
  const mapping = yield* loadMappingDegraded(idMap, mediaId);

  if (Option.isSome(mapping) && mapping.value.anidbAid !== undefined) {
    return mapping.value.anidbAid;
  }

  return undefined;
});

const resolveMapAnilistId = Effect.fn("AniDbClient.resolveMapAnilistId")(function* (
  idMap: AniDbIdMap,
  mediaId: number,
) {
  const mapping = yield* loadMappingDegraded(idMap, mediaId);

  if (Option.isNone(mapping)) {
    return undefined;
  }

  // AniList-side rows are keyed by the requested id; MAL-side rows project
  // their AniList counterpart.
  return mapping.value.anilistId === mediaId ? mediaId : mapping.value.anilistId;
});

const loadMappingDegraded = Effect.fn("AniDbClient.loadMappingDegraded")(function* (
  idMap: AniDbIdMap,
  mediaId: number,
) {
  return yield* idMap
    .loadByEitherId(mediaId)
    .pipe(
      Effect.catch((error) =>
        Effect.logWarning("External id map lookup degraded").pipe(
          Effect.annotateLogs({ error: error.message, mediaId }),
          Effect.as(Option.none()),
        ),
      ),
    );
});

const persistAidDecision = Effect.fn("AniDbClient.persistAidDecision")(function* (input: {
  countKnown: boolean;
  fetchedCount: number;
  idMap: AniDbIdMap;
  mediaId: number | undefined;
  requestedCount: number;
  resolved: ResolvedAnimeId;
  sawEpisodeResponse: boolean;
}) {
  if (input.mediaId === undefined) {
    return;
  }

  const mediaId = input.mediaId;
  const decision = decideAidPersistence({
    countKnown: input.countKnown,
    fetchedCount: input.fetchedCount,
    mapHit: input.resolved.source === "map",
    requestedCount: input.requestedCount,
    sawEpisodeResponse: input.sawEpisodeResponse,
    strong: input.resolved.strong,
  });

  // Media IDs live in two spaces (AniList legacy, MAL canonical) while map
  // rows stay keyed by AniList ID. Unknown-space IDs skip map writes: storing
  // a MAL id in the anilist_id column would poison future lookups, and
  // deleting by it could drop another show's row on numeric collision.
  const mapAnilistId = yield* resolveMapAnilistId(input.idMap, mediaId);

  if (mapAnilistId === undefined) {
    yield* Effect.logDebug("AniDB aid mapping skipped for unmapped id space").pipe(
      Effect.annotateLogs({ aid: input.resolved.aid, decision, mediaId }),
    );
    return;
  }

  if (decision === "store") {
    const aid = input.resolved.aid;
    yield* input.idMap
      .upsert({ anidbAid: aid, anilistId: mapAnilistId })
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning("External id map store degraded").pipe(
            Effect.annotateLogs({ anidbAid: aid, error: error.message, mediaId }),
          ),
        ),
      );
    yield* Effect.logInfo("AniDB aid mapping stored").pipe(
      Effect.annotateLogs({
        aid,
        fetchedCount: input.fetchedCount,
        mediaId,
        requestedCount: input.requestedCount,
        ...(input.resolved.score === undefined ? {} : { score: input.resolved.score }),
      }),
    );
    return;
  }

  if (decision === "delete") {
    yield* input.idMap
      .deleteByAniListId(mapAnilistId)
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning("External id map delete degraded").pipe(
            Effect.annotateLogs({ error: error.message, mediaId }),
          ),
        ),
      );
    yield* Effect.logWarning("AniDB aid mapping dropped after empty fetch").pipe(
      Effect.annotateLogs({ aid: input.resolved.aid, mediaId }),
    );
    return;
  }

  yield* Effect.logDebug("AniDB aid mapping not stored").pipe(
    Effect.annotateLogs({
      aid: input.resolved.aid,
      decision,
      fetchedCount: input.fetchedCount,
      mediaId,
      requestedCount: input.requestedCount,
      ...(input.resolved.score === undefined ? {} : { score: input.resolved.score }),
    }),
  );
});

const resolveAnimeIdEffect = Effect.fn("AniDbClient.resolveAnimeId")(function* (input: {
  dumpTitles: PreparedTitlesDump | undefined;
  idMap: AniDbIdMap;
  mediaId: number | undefined;
  requestContext: AniDbRequestContext;
  sessionToken: string;
  socket: Socket;
  titleCandidates: ReadonlyArray<AniDbTitleCandidate>;
}) {
  // Self-owned AniList→AniDB mapping: a known aid skips the paced ANIME
  // title search entirely. Fresh matches are verified after the episode
  // fetch before entering the map (see decideAidPersistence). MAL-space IDs
  // resolve through their map row to the same aid.
  if (input.mediaId !== undefined) {
    const mapAid = yield* loadMapAid(input.idMap, input.mediaId);

    if (mapAid !== undefined) {
      yield* Effect.logDebug("AniDB aid map hit").pipe(
        Effect.annotateLogs({ aid: mapAid, mediaId: input.mediaId }),
      );
      const mapHit: ResolvedAnimeId = { aid: mapAid, source: "map", strong: true };
      return Option.some(mapHit);
    }
  }

  // Zero-packet dump resolution: the official titles dump carries every
  // alias, so AniDB's idiosyncratic main titles ("(2024)" suffixes,
  // romanization case) match locally instead of depending on perfect
  // server-side by-name hits.
  if (input.dumpTitles !== undefined) {
    const dumpMatch = resolveAidFromDumpTitles(input.dumpTitles, input.titleCandidates);

    if (dumpMatch !== undefined && dumpMatch.score >= ANIDB_MIN_ANIME_MATCH_SCORE) {
      const strong = dumpMatch.score >= ANIDB_STRONG_ANIME_MATCH_SCORE;
      yield* Effect.logDebug("AniDB aid dump hit").pipe(
        Effect.annotateLogs({
          aid: dumpMatch.aid,
          matchedTitle: dumpMatch.matchedTitle,
          mediaId: input.mediaId,
          score: dumpMatch.score,
          strong,
        }),
      );
      const resolved: ResolvedAnimeId = {
        aid: dumpMatch.aid,
        score: dumpMatch.score,
        source: "search",
        strong,
      };
      return Option.some(resolved);
    }
  }

  let bestMatch:
    | {
        readonly aid: number;
        readonly score: number;
      }
    | undefined;

  let resolved: ResolvedAnimeId | undefined;

  for (const candidate of input.titleCandidates) {
    const response = yield* sendAniDbCommandEffect(
      input.socket,
      buildAnimeCommand(candidate, input.sessionToken),
      input.requestContext,
      "media",
    );

    if (response.code === 330) {
      continue;
    }

    // 230 ANIME plus 231 ANIME_BEST_MATCH both carry the match row.
    if (response.code !== 230 && response.code !== 231) {
      return yield* ExternalCallError.make({
        cause: new Error(`AniDB ANIME failed with code ${response.code}`),
        message: "AniDB media lookup failed",
        operation: "anidb.media.response",
      });
    }

    const parsedMatch = parseAnimeLookupMatch(response.lines[0]);

    if (!parsedMatch) {
      continue;
    }

    const score = scoreAnimeLookupCandidate(candidate, parsedMatch.title);

    if (score >= ANIDB_STRONG_ANIME_MATCH_SCORE) {
      resolved = { aid: parsedMatch.aid, score, source: "search", strong: true };
      break;
    }

    if (bestMatch === undefined || score > bestMatch.score) {
      bestMatch = {
        aid: parsedMatch.aid,
        score,
      };
    }
  }

  if (resolved === undefined && bestMatch && bestMatch.score >= ANIDB_MIN_ANIME_MATCH_SCORE) {
    resolved = { aid: bestMatch.aid, score: bestMatch.score, source: "search", strong: false };
  }

  return Option.fromNullishOr(resolved);
});

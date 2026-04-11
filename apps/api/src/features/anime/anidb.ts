import { type Socket } from "node:dgram";

import { Context, Effect, Layer, Option, Ref } from "effect";

import { type DatabaseError } from "@/db/database.ts";
import { ClockService, type ClockServiceShape } from "@/lib/clock.ts";
import {
  buildTitleCandidates,
  parseAnimeLookupMatch,
  parseEpisodeResponse,
  scoreAnimeLookupCandidate,
  type AniDbTitleCandidate,
} from "@/features/anime/anidb-protocol.ts";
import {
  sendAniDbCommandEffect,
  withAniDbSessionEffect,
} from "@/features/anime/anidb-command-client.ts";
import { closeAniDbSocketEffect, openAniDbSocketEffect } from "@/features/anime/anidb-socket.ts";
import type {
  AniDbEpisodeLookupResult,
  AniDbEpisodeLookupInput,
  AniDbEpisodeMetadata,
} from "@/features/anime/anidb-types.ts";
import {
  normalizeEpisodeCount,
  resolveAniDbRuntimeConfig,
} from "@/features/anime/anidb-runtime-config.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { StoredConfigCorruptError } from "@/features/system/errors.ts";
import { ExternalCallError } from "@/lib/effect-retry.ts";

const ANIDB_MIN_ANIME_MATCH_SCORE = 70;
const ANIDB_STRONG_ANIME_MATCH_SCORE = 90;

interface AniDbClientShape {
  readonly getEpisodeMetadata: (
    input: AniDbEpisodeLookupInput,
  ) => Effect.Effect<AniDbEpisodeLookupResult, ExternalCallError>;
}

export class AniDbClient extends Context.Tag("@bakarr/api/AniDbClient")<
  AniDbClient,
  AniDbClientShape
>() {}

export const AniDbClientLive = Layer.effect(
  AniDbClient,
  Effect.gen(function* () {
    const clock = yield* ClockService;
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
    const requestSemaphore = yield* Effect.makeSemaphore(1);
    const lastPacketAtRef = yield* Ref.make(0);

    const getEpisodeMetadata = Effect.fn("AniDbClient.getEpisodeMetadata")(function* (
      input: AniDbEpisodeLookupInput,
    ) {
      const runtimeConfig = yield* runtimeConfigSnapshot.getRuntimeConfig().pipe(
        Effect.map(Option.some),
        Effect.catchTag("StoredConfigMissingError", () => Effect.succeed(Option.none())),
        Effect.catchTag("StoredConfigCorruptError", (error) =>
          failRuntimeConfigLoad(error, "stored config is corrupt"),
        ),
        Effect.catchTag("DatabaseError", (error) =>
          failRuntimeConfigLoad(error, "database read failed"),
        ),
      );

      if (Option.isNone(runtimeConfig)) {
        return { _tag: "AniDbLookupSkipped", reason: "runtime_config_unavailable" } as const;
      }

      const config = resolveAniDbRuntimeConfig(runtimeConfig.value);

      const episodeCount = normalizeEpisodeCount(input.episodeCount, config.episodeLimit);

      if (!config.enabled) {
        return { _tag: "AniDbLookupSkipped", reason: "disabled" } as const;
      }

      if (!config.username || !config.password) {
        return { _tag: "AniDbLookupSkipped", reason: "missing_credentials" } as const;
      }

      const username = config.username;
      const password = config.password;

      const titleCandidates = buildTitleCandidates(input.title, input.synonyms);

      if (titleCandidates.length === 0) {
        return { _tag: "AniDbLookupSkipped", reason: "missing_title_candidates" } as const;
      }

      return yield* requestSemaphore.withPermits(1)(
        Effect.acquireUseRelease(
          openAniDbSocketEffect(config.localPort),
          (socket) =>
            withAniDbSessionEffect(
              socket,
              username,
              password,
              config.client,
              config.clientVersion,
              clock,
              lastPacketAtRef,
            ).pipe(
              Effect.flatMap((sessionToken) =>
                fetchAniDbEpisodesEffect({
                  clock,
                  episodeCount,
                  lastPacketAtRef,
                  sessionToken,
                  socket,
                  titleCandidates,
                }),
              ),
            ),
          closeAniDbSocketEffect,
        ),
      );
    });

    return AniDbClient.of({ getEpisodeMetadata });
  }),
);

const logRuntimeConfigError = (error: DatabaseError | StoredConfigCorruptError, reason: string) =>
  Effect.logWarning("AniDB metadata lookup failed due to runtime config load failure").pipe(
    Effect.annotateLogs({
      cause: String(error.cause),
      error: error.message,
      reason,
    }),
  );

const failRuntimeConfigLoad = (error: DatabaseError | StoredConfigCorruptError, reason: string) =>
  logRuntimeConfigError(error, reason).pipe(
    Effect.zipRight(
      ExternalCallError.make({
        cause: error.cause ?? error,
        message: "AniDB lookup failed while loading runtime config",
        operation: "anidb.runtime_config.load",
      }),
    ),
  );

const fetchAniDbEpisodesEffect = Effect.fn("AniDbClient.fetchEpisodes")(function* (input: {
  clock: ClockServiceShape;
  episodeCount: number;
  lastPacketAtRef: Ref.Ref<number>;
  sessionToken: string;
  socket: Socket;
  titleCandidates: ReadonlyArray<AniDbTitleCandidate>;
}) {
  const aidOption = yield* resolveAnimeIdEffect({
    clock: input.clock,
    lastPacketAtRef: input.lastPacketAtRef,
    sessionToken: input.sessionToken,
    socket: input.socket,
    titleCandidates: input.titleCandidates,
  });

  if (Option.isNone(aidOption)) {
    return {
      _tag: "AniDbLookupSkipped",
      reason: "title_not_found",
    } as const satisfies AniDbEpisodeLookupResult;
  }

  const reachedEndRef = yield* Ref.make(false);
  const episodeNumbers = Array.from({ length: input.episodeCount }, (_, index) => index + 1);
  const episodeResults = yield* Effect.forEach(
    episodeNumbers,
    (episodeNumber) =>
      Effect.gen(function* () {
        const reachedEnd = yield* Ref.get(reachedEndRef);

        if (reachedEnd) {
          return Option.none<AniDbEpisodeMetadata>();
        }

        const response = yield* sendAniDbCommandEffect(
          input.socket,
          `EPISODE aid=${aidOption.value}&epno=${episodeNumber}&s=${input.sessionToken}`,
          input.clock,
          input.lastPacketAtRef,
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

        return Option.fromNullable(parseEpisodeResponse(response.lines[0], episodeNumber));
      }),
    { concurrency: 1 },
  );

  const episodes = episodeResults.filter(Option.isSome).map((result) => result.value);

  return {
    _tag: "AniDbLookupSuccess",
    episodes,
  } as const satisfies AniDbEpisodeLookupResult;
});

const resolveAnimeIdEffect = Effect.fn("AniDbClient.resolveAnimeId")(function* (input: {
  clock: ClockServiceShape;
  lastPacketAtRef: Ref.Ref<number>;
  sessionToken: string;
  socket: Socket;
  titleCandidates: ReadonlyArray<AniDbTitleCandidate>;
}) {
  let bestMatch:
    | {
        readonly aid: number;
        readonly score: number;
      }
    | undefined;

  for (const candidate of input.titleCandidates) {
    const response = yield* sendAniDbCommandEffect(
      input.socket,
      `ANIME aname=${encodeURIComponent(candidate.value)}&s=${input.sessionToken}`,
      input.clock,
      input.lastPacketAtRef,
      "anime",
    );

    if (response.code === 330) {
      continue;
    }

    if (response.code !== 230) {
      return yield* ExternalCallError.make({
        cause: new Error(`AniDB ANIME failed with code ${response.code}`),
        message: "AniDB anime lookup failed",
        operation: "anidb.anime.response",
      });
    }

    const parsedMatch = parseAnimeLookupMatch(response.lines[0]);

    if (!parsedMatch) {
      continue;
    }

    const score = scoreAnimeLookupCandidate(candidate, parsedMatch.title);

    if (score >= ANIDB_STRONG_ANIME_MATCH_SCORE) {
      return Option.some(parsedMatch.aid);
    }

    if (bestMatch === undefined || score > bestMatch.score) {
      bestMatch = {
        aid: parsedMatch.aid,
        score,
      };
    }
  }

  if (bestMatch && bestMatch.score >= ANIDB_MIN_ANIME_MATCH_SCORE) {
    return Option.some(bestMatch.aid);
  }

  return Option.none();
});

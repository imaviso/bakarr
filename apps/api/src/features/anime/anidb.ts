import { type Socket } from "node:dgram";

import { Context, Effect, Layer, Option, Ref } from "effect";

import { type DatabaseError } from "@/db/database.ts";
import { ClockService, type ClockServiceShape } from "@/lib/clock.ts";
import {
  buildTitleCandidates,
  parseAnimeLookupMatch,
  parseAniDbResponse,
  parseEpisodeResponse,
  scoreAnimeLookupCandidate,
  type AniDbTitleCandidate,
} from "@/features/anime/anidb-protocol.ts";
import {
  closeAniDbSocketEffect,
  openAniDbSocketEffect,
  sendAndReceiveAniDbPacket,
} from "@/features/anime/anidb-socket.ts";
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

const ANIDB_PROTO_VERSION = 3;
const ANIDB_MIN_PACKET_INTERVAL_MS = 2_200;
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

const withAniDbSessionEffect = Effect.fn("AniDbClient.withSession")(function* (
  socket: Socket,
  username: string,
  password: string,
  client: string,
  clientVersion: number,
  clock: ClockServiceShape,
  lastPacketAtRef: Ref.Ref<number>,
) {
  return yield* Effect.acquireUseRelease(
    authenticateAniDbEffect(
      socket,
      username,
      password,
      client,
      clientVersion,
      clock,
      lastPacketAtRef,
    ),
    Effect.succeed,
    (sessionToken) =>
      logoutAniDbEffect(socket, sessionToken, clock, lastPacketAtRef).pipe(
        Effect.catchTag("ExternalCallError", () => Effect.void),
      ),
  );
});

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
      `ANIME aname=${encodeCommandValue(candidate.value)}&s=${input.sessionToken}`,
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

const authenticateAniDbEffect = Effect.fn("AniDbClient.authenticate")(function* (
  socket: Socket,
  username: string,
  password: string,
  client: string,
  clientVersion: number,
  clock: ClockServiceShape,
  lastPacketAtRef: Ref.Ref<number>,
) {
  const response = yield* sendAniDbCommandEffect(
    socket,
    [
      `AUTH user=${encodeCommandValue(username)}`,
      `pass=${encodeCommandValue(password)}`,
      `protover=${ANIDB_PROTO_VERSION}`,
      `client=${encodeCommandValue(client)}`,
      `clientver=${clientVersion}`,
    ].join("&"),
    clock,
    lastPacketAtRef,
    "auth",
  );

  if (response.code !== 200 && response.code !== 201) {
    return yield* ExternalCallError.make({
      cause: new Error(`AniDB AUTH failed with code ${response.code}`),
      message: "AniDB authentication failed",
      operation: "anidb.auth.response",
    });
  }

  const token = response.rest.split(/\s+/)[0];

  if (!token || !/^[a-zA-Z0-9]{4,16}$/.test(token)) {
    return yield* ExternalCallError.make({
      cause: new Error("AniDB AUTH did not return a valid session token"),
      message: "AniDB authentication failed",
      operation: "anidb.auth.token",
    });
  }

  return token;
});

const logoutAniDbEffect = Effect.fn("AniDbClient.logout")(function* (
  socket: Socket,
  sessionToken: string,
  clock: ClockServiceShape,
  lastPacketAtRef: Ref.Ref<number>,
) {
  const response = yield* sendAniDbCommandEffect(
    socket,
    `LOGOUT s=${sessionToken}`,
    clock,
    lastPacketAtRef,
    "logout",
  );

  if (response.code === 203 || response.code === 403) {
    return;
  }

  return yield* ExternalCallError.make({
    cause: new Error(`AniDB LOGOUT failed with code ${response.code}`),
    message: "AniDB logout failed",
    operation: "anidb.logout.response",
  });
});

const sendAniDbCommandEffect = Effect.fn("AniDbClient.sendCommand")(function* (
  socket: Socket,
  command: string,
  clock: ClockServiceShape,
  lastPacketAtRef: Ref.Ref<number>,
  operation: string,
) {
  yield* waitForPacketWindowEffect(clock, lastPacketAtRef);

  const responseRaw = yield* Effect.tryPromise({
    try: () => sendAndReceiveAniDbPacket(socket, command),
    catch: (cause) =>
      ExternalCallError.make({
        cause,
        message: `AniDB ${operation} request failed`,
        operation: `anidb.${operation}.request`,
      }),
  });

  const parsed = parseAniDbResponse(responseRaw);

  if (!parsed) {
    return yield* ExternalCallError.make({
      cause: new Error("AniDB response was not parseable"),
      message: `AniDB ${operation} response decode failed`,
      operation: `anidb.${operation}.decode`,
    });
  }

  return parsed;
});

const waitForPacketWindowEffect = Effect.fn("AniDbClient.waitForPacketWindow")(function* (
  clock: ClockServiceShape,
  lastPacketAtRef: Ref.Ref<number>,
) {
  const now = yield* clock.currentMonotonicMillis;
  const lastPacketAt = yield* Ref.get(lastPacketAtRef);
  const elapsed = now - lastPacketAt;

  if (elapsed < ANIDB_MIN_PACKET_INTERVAL_MS) {
    yield* Effect.sleep(`${ANIDB_MIN_PACKET_INTERVAL_MS - elapsed} millis`);
  }

  const nextPacketAt = yield* clock.currentMonotonicMillis;
  yield* Ref.set(lastPacketAtRef, nextPacketAt);
});

function encodeCommandValue(value: string) {
  return encodeURIComponent(value);
}

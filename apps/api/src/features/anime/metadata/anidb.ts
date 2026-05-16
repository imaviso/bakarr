import { type Socket } from "node:dgram";

import { Context, Effect, Layer, Option, Ref } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { type DatabaseError } from "@/db/database.ts";
import { ClockService, type ClockServiceShape } from "@/infra/clock.ts";
import {
  buildTitleCandidates,
  parseAnimeLookupMatch,
  parseEpisodeResponse,
  scoreAnimeLookupCandidate,
  type AniDbEpisodeLookupInput,
  type AniDbEpisodeLookupResult,
  type AniDbEpisodeMetadata,
  type AniDbTitleCandidate,
} from "@/features/anime/metadata/anidb-protocol.ts";
import {
  authenticateAniDbEffect,
  logoutAniDbEffect,
  sendAniDbCommandEffect,
} from "@/features/anime/metadata/anidb-command-client.ts";
import {
  closeAniDbSocketEffect,
  openAniDbSocketEffect,
} from "@/features/anime/metadata/anidb-socket.ts";
import { AniDbRuntimeConfigError } from "@/features/anime/errors.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { StoredConfigCorruptError } from "@/features/system/errors.ts";
import { DEFAULT_ANIDB_METADATA_CONFIG } from "@/features/system/metadata-providers-config.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";

const ANIDB_MIN_ANIME_MATCH_SCORE = 70;
const ANIDB_STRONG_ANIME_MATCH_SCORE = 90;

interface AniDbClientShape {
  readonly getEpisodeMetadata: (
    input: AniDbEpisodeLookupInput,
  ) => Effect.Effect<AniDbEpisodeLookupResult, ExternalCallError | AniDbRuntimeConfigError>;
}

export class AniDbClient extends Context.Tag("@bakarr/api/AniDbClient")<
  AniDbClient,
  AniDbClientShape
>() {}

interface AniDbSessionState {
  readonly configKey: string;
  readonly sessionToken: string;
  readonly socket: Socket;
}

interface AniDbRuntimeConfig {
  readonly enabled: boolean;
  readonly username: string | null;
  readonly password: string | null;
  readonly client: string;
  readonly clientVersion: number;
  readonly episodeLimit: number;
  readonly localPort: number;
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
  };
}

export function normalizeEpisodeCount(episodeCount: number | undefined, episodeLimit: number) {
  if (!Number.isFinite(episodeCount) || episodeCount === undefined) {
    return episodeLimit;
  }

  const normalized = Math.floor(episodeCount);

  if (normalized <= 0) {
    return episodeLimit;
  }

  return Math.min(normalized, episodeLimit);
}

export const AniDbClientLive = Layer.scoped(
  AniDbClient,
  Effect.gen(function* () {
    const clock = yield* ClockService;
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
    const requestSemaphore = yield* Effect.makeSemaphore(1);
    const lastPacketAtRef = yield* Ref.make(0);
    const sessionRef = yield* Ref.make(Option.none<AniDbSessionState>());

    const closeSession = Effect.fn("AniDbClient.closeSession")(function* () {
      const current = yield* Ref.getAndSet(sessionRef, Option.none<AniDbSessionState>());

      if (Option.isNone(current)) {
        return;
      }

      const session = current.value;

      yield* logoutAniDbEffect(session.socket, session.sessionToken, clock, lastPacketAtRef).pipe(
        Effect.catchTag("ExternalCallError", () => Effect.void),
      );
      yield* closeAniDbSocketEffect(session.socket);
    });

    const createSession = Effect.fn("AniDbClient.createSession")(function* (config: {
      readonly client: string;
      readonly clientVersion: number;
      readonly localPort: number;
      readonly password: string;
      readonly username: string;
    }) {
      const socket = yield* openAniDbSocketEffect(config.localPort);

      const sessionToken = yield* authenticateAniDbEffect(
        socket,
        config.username,
        config.password,
        config.client,
        config.clientVersion,
        clock,
        lastPacketAtRef,
      ).pipe(
        Effect.catchTag("ExternalCallError", (error) =>
          closeAniDbSocketEffect(socket).pipe(Effect.zipRight(Effect.fail(error))),
        ),
      );

      return {
        configKey: toAniDbSessionConfigKey(config),
        sessionToken,
        socket,
      } satisfies AniDbSessionState;
    });

    const ensureSession = Effect.fn("AniDbClient.ensureSession")(function* (config: {
      readonly client: string;
      readonly clientVersion: number;
      readonly localPort: number;
      readonly password: string;
      readonly username: string;
    }) {
      const configKey = toAniDbSessionConfigKey(config);
      const current = yield* Ref.get(sessionRef);

      if (Option.isSome(current) && current.value.configKey === configKey) {
        return current.value;
      }

      if (Option.isSome(current)) {
        yield* closeSession();
      }

      const session = yield* createSession(config);
      yield* Ref.set(sessionRef, Option.some(session));
      return session;
    });

    yield* Effect.addFinalizer(closeSession);

    const getEpisodeMetadata: AniDbClientShape["getEpisodeMetadata"] = Effect.fn(
      "AniDbClient.getEpisodeMetadata",
    )(function* (input: AniDbEpisodeLookupInput) {
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
        Effect.gen(function* () {
          const session = yield* ensureSession({
            client: config.client,
            clientVersion: config.clientVersion,
            localPort: config.localPort,
            password,
            username,
          });

          return yield* fetchAniDbEpisodesEffect({
            clock,
            episodeCount,
            lastPacketAtRef,
            sessionToken: session.sessionToken,
            socket: session.socket,
            titleCandidates,
          }).pipe(
            Effect.catchTag("ExternalCallError", (error) =>
              closeSession().pipe(Effect.zipRight(Effect.fail(error))),
            ),
          );
        }),
      );
    });

    return AniDbClient.of({ getEpisodeMetadata });
  }),
);

function toAniDbSessionConfigKey(config: {
  readonly client: string;
  readonly clientVersion: number;
  readonly localPort: number;
  readonly password: string;
  readonly username: string;
}) {
  return [
    config.localPort,
    config.username,
    config.password,
    config.client,
    config.clientVersion,
  ].join("|");
}

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
      AniDbRuntimeConfigError.make({
        cause: error.cause ?? error,
        message: "AniDB lookup failed while loading runtime config",
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

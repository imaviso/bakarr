import { type Socket } from "node:dgram";

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
  authenticateAniDbEffect,
  logoutAniDbEffect,
  sendAniDbCommandEffect,
  type AniDbRequestContext,
} from "@/features/media/metadata/anidb-command-client.ts";
import {
  closeAniDbSocketEffect,
  openAniDbSocketEffect,
  resolveAniDbPeerEffect,
} from "@/features/media/metadata/anidb-socket.ts";
import { AniDbRuntimeConfigError } from "@/features/media/errors.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { StoredConfigCorruptError } from "@/features/system/errors.ts";
import { DEFAULT_ANIDB_METADATA_CONFIG } from "@/features/system/metadata-providers-config.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { Context, Effect, Layer, Option, Ref, Scope, Semaphore } from "effect";

const ANIDB_MIN_ANIME_MATCH_SCORE = 70;
const ANIDB_STRONG_ANIME_MATCH_SCORE = 90;
const ANIDB_CLOSE_SESSION_TIMEOUT = "15 seconds";

interface AniDbClientShape {
  readonly getEpisodeMetadata: (
    input: AniDbEpisodeLookupInput,
  ) => Effect.Effect<AniDbEpisodeLookupResult, ExternalCallError | AniDbRuntimeConfigError>;
}

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
  yield* Scope.Scope;
  const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
  // Serializes every socket interaction (AUTH, ANIME, EPISODE, LOGOUT) so a
  // scope-finalizer LOGOUT can never interleave with an in-flight lookup.
  const requestSemaphore = yield* Semaphore.make(1);
  const requestContext: AniDbRequestContext = {
    lastPacketAtRef: yield* Ref.make(0),
    nextTagRef: yield* Ref.make(1),
    peer: yield* resolveAniDbPeerEffect(),
  };
  const sessionRef = yield* Ref.make(Option.none<AniDbSessionState>());

  const logoutAndCloseSession = Effect.fn("AniDbClient.logoutAndCloseSession")(function* () {
    const current = yield* Ref.getAndSet(sessionRef, Option.none<AniDbSessionState>());

    if (Option.isNone(current)) {
      return;
    }

    const session = current.value;

    yield* logoutAniDbEffect(session.socket, session.sessionToken, requestContext).pipe(
      Effect.timeout(ANIDB_CLOSE_SESSION_TIMEOUT),
      Effect.catchTag("ExternalCallError", () => Effect.void),
      Effect.catchTag("TimeoutError", () => Effect.void),
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
    const socket = yield* openAniDbSocketEffect(config.localPort, {
      // Adapter edge: dgram error callbacks are plain Node events, so the
      // warning is logged through a detached fiber. Without this handler a
      // stray ICMP error on the idle socket would crash the process.
      onBackgroundError: (cause) =>
        Effect.runFork(
          Effect.logWarning("AniDB socket background error").pipe(
            Effect.annotateLogs({ errorMessage: cause.message }),
          ),
        ),
    });

    // `onError` releases the bound socket on AUTH failure *and* interruption
    // (scope shutdown mid-AUTH); after success the session owns the socket and
    // the client finalizer closes it.
    const sessionToken = yield* authenticateAniDbEffect(
      socket,
      config.username,
      config.password,
      config.client,
      config.clientVersion,
      requestContext,
    ).pipe(Effect.onError(() => closeAniDbSocketEffect(socket)));

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
      yield* logoutAndCloseSession();
    }

    const session = yield* createSession(config);
    yield* Ref.set(sessionRef, Option.some(session));
    return session;
  });

  // Finalizer LOGOUT goes through the same semaphore as lookups so it can
  // never interleave with an in-flight EPISODE request.
  yield* Effect.addFinalizer(() => requestSemaphore.withPermits(1)(logoutAndCloseSession()));

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
          unitCount,
          requestContext,
          sessionToken: session.sessionToken,
          socket: session.socket,
          titleCandidates,
        }).pipe(
          Effect.catchTag("ExternalCallError", (error) =>
            logoutAndCloseSession().pipe(Effect.andThen(Effect.fail(error))),
          ),
        );
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

const fetchAniDbEpisodesEffect = Effect.fn("AniDbClient.fetchEpisodes")(function* (input: {
  unitCount: number;
  requestContext: AniDbRequestContext;
  sessionToken: string;
  socket: Socket;
  titleCandidates: ReadonlyArray<AniDbTitleCandidate>;
}) {
  const aidOption = yield* resolveAnimeIdEffect({
    requestContext: input.requestContext,
    sessionToken: input.sessionToken,
    socket: input.socket,
    titleCandidates: input.titleCandidates,
  });

  if (Option.isNone(aidOption)) {
    return {
      _tag: "AniDbLookupSkipped",
      reason: "title_not_found",
    } satisfies AniDbEpisodeLookupResult;
  }

  const reachedEndRef = yield* Ref.make(false);
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
          `EPISODE aid=${aidOption.value}&epno=${unitNumber}&s=${input.sessionToken}`,
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

        return Option.fromNullishOr(parseEpisodeResponse(response.lines[0], unitNumber));
      }),
    { concurrency: 1 },
  );

  const mediaUnits = episodeResults.filter(Option.isSome).map((result) => result.value);

  return {
    _tag: "AniDbLookupSuccess",
    mediaUnits,
  } satisfies AniDbEpisodeLookupResult;
});

const resolveAnimeIdEffect = Effect.fn("AniDbClient.resolveAnimeId")(function* (input: {
  requestContext: AniDbRequestContext;
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
      input.requestContext,
      "media",
    );

    if (response.code === 330) {
      continue;
    }

    if (response.code !== 230) {
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

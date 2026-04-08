import { createSocket, type Socket } from "node:dgram";

import { Context, Effect, Layer, Option, Ref } from "effect";

import { type DatabaseError } from "@/db/database.ts";
import { ClockService, type ClockServiceShape } from "@/lib/clock.ts";
import {
  buildTitleCandidates,
  parseAid,
  parseAniDbResponse,
  parseEpisodeResponse,
} from "@/features/anime/anidb-protocol.ts";
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

const ANIDB_HOST = "api.anidb.net";
const ANIDB_PORT = 9000;
const ANIDB_PROTO_VERSION = 3;
const ANIDB_PACKET_TIMEOUT_MS = 10_000;
const ANIDB_MIN_PACKET_INTERVAL_MS = 2_200;

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
      const runtimeConfig = yield* runtimeConfigSnapshot
        .getRuntimeConfig()
        .pipe(
          Effect.map(Option.some),
          Effect.catchTag("StoredConfigMissingError", () => Effect.succeed(Option.none())),
          Effect.catchTag("StoredConfigCorruptError", (error) =>
            logRuntimeConfigError(error, "stored config is corrupt").pipe(
              Effect.as(Option.none()),
            ),
          ),
          Effect.catchTag("DatabaseError", (error) =>
            logRuntimeConfigError(error, "database read failed").pipe(Effect.as(Option.none())),
          ),
        );

      if (Option.isNone(runtimeConfig)) {
        return { _tag: "AniDbLookupSkipped", reason: "runtime_config_unavailable" } as const;
      }

      const config = resolveAniDbRuntimeConfig(runtimeConfig.value);

      const episodeCount = normalizeEpisodeCount(input.episodeCount, config.episodeLimit);

      if (episodeCount === undefined) {
        return { _tag: "AniDbLookupSkipped", reason: "missing_episode_count" } as const;
      }

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
          openSocketEffect(config.localPort),
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
          closeSocketEffect,
        ),
      );
    });

    return AniDbClient.of({ getEpisodeMetadata });
  }),
);

const logRuntimeConfigError = (
  error: DatabaseError | StoredConfigCorruptError,
  reason: string,
) =>
  Effect.logWarning("AniDB metadata lookup skipped due to runtime config load failure").pipe(
    Effect.annotateLogs({
      cause: String(error.cause),
      error: error.message,
      reason,
    }),
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
  titleCandidates: ReadonlyArray<string>;
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

  const episodes: AniDbEpisodeMetadata[] = [];

  for (let episodeNumber = 1; episodeNumber <= input.episodeCount; episodeNumber += 1) {
    const response = yield* sendAniDbCommandEffect(
      input.socket,
      `EPISODE aid=${aidOption.value}&epno=${episodeNumber}&s=${input.sessionToken}`,
      input.clock,
      input.lastPacketAtRef,
      "episode",
    );

    if (response.code === 340) {
      break;
    }

    if (response.code !== 240) {
      return yield* ExternalCallError.make({
        cause: new Error(`AniDB EPISODE failed with code ${response.code}`),
        message: "AniDB episode lookup failed",
        operation: "anidb.episode.response",
      });
    }

    const parsedEpisode = parseEpisodeResponse(response.lines[0], episodeNumber);

    if (!parsedEpisode) {
      continue;
    }

    episodes.push(parsedEpisode);
  }

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
  titleCandidates: ReadonlyArray<string>;
}) {
  for (const candidate of input.titleCandidates) {
    const response = yield* sendAniDbCommandEffect(
      input.socket,
      `ANIME aname=${encodeCommandValue(candidate)}&s=${input.sessionToken}`,
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

    const aid = parseAid(response.lines[0]);

    if (aid !== undefined) {
      return Option.some(aid);
    }
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
    try: () => sendAndReceivePacket(socket, command),
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

const openSocketEffect = Effect.fn("AniDbClient.openSocket")(function* (localPort: number) {
  return yield* Effect.async<Socket, ExternalCallError>((resume) => {
    const socket = createSocket("udp4");

    const cleanup = () => {
      socket.off("error", onError);
      socket.off("listening", onListening);
    };

    const onError = (cause: Error) => {
      cleanup();
      resume(
        Effect.fail(
          ExternalCallError.make({
            cause,
            message: "AniDB socket bind failed",
            operation: "anidb.socket.bind",
          }),
        ),
      );
    };

    const onListening = () => {
      cleanup();
      resume(Effect.succeed(socket));
    };

    socket.once("error", onError);
    socket.once("listening", onListening);
    socket.bind(localPort);

    return Effect.sync(cleanup);
  });
});

const closeSocketEffect = Effect.fn("AniDbClient.closeSocket")(function* (socket: Socket) {
  yield* Effect.sync(() => {
    try {
      socket.close();
    } catch {
      // ignored: socket is already closed
    }
  });
});

function sendAndReceivePacket(socket: Socket, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      socket.off("message", onMessage);
      socket.off("error", onError);
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };

    const settleFailure = (cause: unknown) => {
      if (done) {
        return;
      }

      done = true;
      cleanup();
      reject(cause);
    };

    const onMessage = (message: Buffer) => {
      if (done) {
        return;
      }

      done = true;
      cleanup();
      resolve(message.toString("utf8"));
    };

    const onError = (cause: Error) => {
      settleFailure(cause);
    };

    socket.once("message", onMessage);
    socket.once("error", onError);
    timer = setTimeout(() => {
      settleFailure(new Error("AniDB UDP response timed out"));
    }, ANIDB_PACKET_TIMEOUT_MS);

    socket.send(Buffer.from(command, "utf8"), ANIDB_PORT, ANIDB_HOST, (cause) => {
      if (cause) {
        settleFailure(cause);
      }
    });
  });
}

function encodeCommandValue(value: string) {
  return encodeURIComponent(value);
}

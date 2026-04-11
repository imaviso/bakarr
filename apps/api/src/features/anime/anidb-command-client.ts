import { type Socket } from "node:dgram";

import { Effect, Ref } from "effect";

import { type ClockServiceShape } from "@/lib/clock.ts";
import { parseAniDbResponse } from "@/features/anime/anidb-protocol.ts";
import { sendAndReceiveAniDbPacket } from "@/features/anime/anidb-socket.ts";
import { ExternalCallError } from "@/lib/effect-retry.ts";

const ANIDB_PROTO_VERSION = 3;
const ANIDB_MIN_PACKET_INTERVAL_MS = 2_200;

export const withAniDbSessionEffect = Effect.fn("AniDbClient.withSession")(function* (
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

export const sendAniDbCommandEffect = Effect.fn("AniDbClient.sendCommand")(function* (
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

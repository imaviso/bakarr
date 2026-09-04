import { Clock, Effect, Ref } from "effect";
import { type Socket } from "node:dgram";

import { parseAniDbResponse } from "@/features/media/metadata/anidb-protocol.ts";
import {
  sendAndReceiveAniDbPacketEffect,
  type AniDbPeer,
} from "@/features/media/metadata/anidb-socket.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";

const ANIDB_PROTO_VERSION = 3;
const ANIDB_MIN_PACKET_INTERVAL_MS = 2_200;

/**
 * Per-session request state shared by every socket send: the atomic packet
 * pacing slot, the monotonically increasing response-tag counter, and the
 * validated UDP peer.
 */
export interface AniDbRequestContext {
  readonly lastPacketAtRef: Ref.Ref<number>;
  readonly nextTagRef: Ref.Ref<number>;
  readonly peer: AniDbPeer;
}

export const sendAniDbCommandEffect = Effect.fn("AniDbClient.sendCommand")(function* (
  socket: Socket,
  command: string,
  context: AniDbRequestContext,
  operation: string,
) {
  yield* reservePacketSlot(context.lastPacketAtRef);
  const tag = yield* nextRequestTag(context.nextTagRef);

  const responseRaw = yield* sendAndReceiveAniDbPacketEffect(
    socket,
    `${command}&tag=${tag}`,
    context.peer,
    tag,
  ).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: `AniDB ${operation} request failed`,
        operation: `anidb.${operation}.request`,
      }),
    ),
  );

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

export const authenticateAniDbEffect = Effect.fn("AniDbClient.authenticate")(function* (
  socket: Socket,
  username: string,
  password: string,
  client: string,
  clientVersion: number,
  context: AniDbRequestContext,
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
    context,
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

export const logoutAniDbEffect = Effect.fn("AniDbClient.logout")(function* (
  socket: Socket,
  sessionToken: string,
  context: AniDbRequestContext,
) {
  const response = yield* sendAniDbCommandEffect(
    socket,
    `LOGOUT s=${sessionToken}`,
    context,
    "logout",
  );

  if (response.code === 203 || response.code === 403) {
    return undefined;
  }

  return yield* ExternalCallError.make({
    cause: new Error(`AniDB LOGOUT failed with code ${response.code}`),
    message: "AniDB logout failed",
    operation: "anidb.logout.response",
  });
});

/**
 * Atomically reserve the next ≥2.2s packet slot. The ref holds the timestamp
 * at which the next packet may be sent; `Ref.modify` both computes this
 * caller's wait and advances the reservation, so concurrent callers can never
 * share a window.
 */
const reservePacketSlot = Effect.fn("AniDbClient.reservePacketSlot")(function* (
  lastPacketAtRef: Ref.Ref<number>,
) {
  const now = yield* Clock.currentTimeMillis;
  const waitMs = yield* Ref.modify(lastPacketAtRef, (nextAllowedAt): readonly [number, number] => {
    const startAt = Math.max(now, nextAllowedAt);
    return [startAt - now, startAt + ANIDB_MIN_PACKET_INTERVAL_MS];
  });

  if (waitMs > 0) {
    yield* Effect.sleep(`${waitMs} millis`);
  }
});

const nextRequestTag = Effect.fn("AniDbClient.nextRequestTag")(function* (
  nextTagRef: Ref.Ref<number>,
) {
  return yield* Ref.modify(nextTagRef, (current): readonly [string, number] => [
    globalThis.String(current),
    current + 1,
  ]);
});

function encodeCommandValue(value: string) {
  return encodeURIComponent(value);
}

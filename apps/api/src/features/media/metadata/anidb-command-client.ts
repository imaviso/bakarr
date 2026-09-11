import { Clock, Duration, Effect, Ref, Result, Semaphore } from "effect";
import { type Socket } from "node:dgram";

import { parseAniDbResponse } from "@/features/media/metadata/anidb-protocol.ts";
import {
  isAniDbPacketTimeout,
  sendAndReceiveAniDbPacketEffect,
  type AniDbPeer,
} from "@/features/media/metadata/anidb-socket.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";

const ANIDB_PROTO_VERSION = 3;
// Spec flood protection: 1 packet per 2s short-term (enforced after the
// first 5 packets), 1 packet per 4s sustained long-term.
const ANIDB_SHORT_PACKET_GAP_MS = 2_200;
const ANIDB_LONG_PACKET_GAP_MS = 4_000;
const ANIDB_BURST_PACKETS = 5;
const ANIDB_BURST_WINDOW_MS = 60_000;
const ANIDB_RETRY_BACKOFF = "5 seconds";
const ANIDB_MAX_ATTEMPTS = 2;
const ANIDB_RESUBMIT_CODES: ReadonlySet<number> = new Set([602, 604]);

// Retry policy: packet timeouts may be flood-protection drops, and 602 busy
// / 604 timeout explicitly ask for resubmission — one retry after backoff.
// Anything else, or the second attempt, fails.
export function shouldRetryAniDbCommand(input: {
  readonly attempt: number;
  readonly responseCode?: number | undefined;
  readonly timedOut: boolean;
}): boolean {
  if (input.attempt > 0) {
    return false;
  }

  if (input.timedOut) {
    return true;
  }

  return input.responseCode !== undefined && ANIDB_RESUBMIT_CODES.has(input.responseCode);
}

/**
 * Per-process request state shared by every socket send: the paced packet
 * slot, the monotonically increasing response-tag counter, and the
 * validated UDP peer.
 */
export interface AniDbRequestContext {
  readonly packetGate: Semaphore.Semaphore;
  readonly packetTimestampsRef: Ref.Ref<ReadonlyArray<number>>;
  readonly nextTagRef: Ref.Ref<number>;
  readonly peer: AniDbPeer;
}

export const sendAniDbCommandEffect = Effect.fn("AniDbClient.sendCommand")(function* (
  socket: Socket,
  command: string,
  context: AniDbRequestContext,
  operation: string,
) {
  for (let attempt = 0; attempt < ANIDB_MAX_ATTEMPTS; attempt++) {
    yield* reservePacketSlot(context);
    const tag = yield* nextRequestTag(context.nextTagRef);

    const result = yield* sendAndReceiveAniDbPacketEffect(
      socket,
      `${command}&tag=${tag}`,
      context.peer,
      tag,
    ).pipe(Effect.result);

    if (Result.isFailure(result)) {
      if (!shouldRetryAniDbCommand({ attempt, timedOut: isAniDbPacketTimeout(result.failure) })) {
        return yield* ExternalCallError.make({
          cause: result.failure,
          message: `AniDB ${operation} request failed`,
          operation: `anidb.${operation}.request`,
        });
      }

      yield* Effect.sleep(ANIDB_RETRY_BACKOFF);
      continue;
    }

    const parsed = parseAniDbResponse(result.success);

    if (!parsed) {
      return yield* ExternalCallError.make({
        cause: new Error("AniDB response was not parseable"),
        message: `AniDB ${operation} response decode failed`,
        operation: `anidb.${operation}.decode`,
      });
    }

    // 602 busy / 604 timeout ask for resubmission: one retry after backoff.
    if (shouldRetryAniDbCommand({ attempt, responseCode: parsed.code, timedOut: false })) {
      yield* Effect.sleep(ANIDB_RETRY_BACKOFF);
      continue;
    }

    return parsed;
  }

  return yield* Effect.die(new Error("AniDB command retry loop exhausted"));
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
      `enc=UTF-8`,
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
 * Two-tier flood-protection gate: 2.2s gaps for the first 5 packets of a
 * rolling minute, 4s gaps once the burst is spent. Fibers decide under a
 * single-permit gate and sleep outside it, so TestClock controls the wait.
 */
export const reservePacketSlot = Effect.fn("AniDbClient.reservePacketSlot")(function* (
  context: AniDbRequestContext,
) {
  while (true) {
    const waitMs = yield* context.packetGate.withPermits(1)(
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const windowStart = now - ANIDB_BURST_WINDOW_MS;
        const recent = (yield* Ref.get(context.packetTimestampsRef)).filter(
          (timestamp) => timestamp > windowStart,
        );
        const last = recent.length > 0 ? Math.max(...recent) : Number.NEGATIVE_INFINITY;
        const gap =
          recent.length >= ANIDB_BURST_PACKETS
            ? ANIDB_LONG_PACKET_GAP_MS
            : ANIDB_SHORT_PACKET_GAP_MS;
        const wait = Math.max(last + gap - now, 0);

        if (wait <= 0) {
          yield* Ref.set(context.packetTimestampsRef, [...recent, now]);
          return 0;
        }

        yield* Ref.set(context.packetTimestampsRef, recent);
        return Math.max(wait, 1);
      }),
    );

    if (waitMs <= 0) {
      return;
    }

    yield* Effect.sleep(Duration.millis(waitMs));
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

export function encodeCommandValue(value: string) {
  // Spec content encoding: raw values with & escaped as &amp; and newlines
  // as <br />. Percent-encoding is not decoded server-side.
  return value.replace(/&/gu, "&amp;").replace(/\n/gu, "<br />");
}

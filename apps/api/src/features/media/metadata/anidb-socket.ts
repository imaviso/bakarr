// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { createSocket, type Socket } from "node:dgram";
import { resolve4 } from "node:dns/promises";

import { Cause, Data, Effect } from "effect";

import { ExternalCallError } from "@/infra/effect/retry.ts";
import { parseAniDbResponseTag } from "@/features/media/metadata/anidb-protocol.ts";

export const ANIDB_HOST = "api.anidb.net";
export const ANIDB_PORT = 9000;
const ANIDB_PACKET_TIMEOUT_MS = 10_000;

class AniDbSocketPacketError extends Data.TaggedError("AniDbSocketPacketError")<{
  readonly cause: unknown;
  readonly message: string;
}> {}

/** The UDP peer this client talks to: the resolved addresses of the AniDB host plus its port. */
export interface AniDbPeer {
  readonly addresses: ReadonlySet<string>;
  readonly port: number;
}

/**
 * Resolve the AniDB host to its A records so every response datagram can be
 * validated against the expected source address. The socket is udp4, so only
 * A records apply (AAAA would require udp6). DNS change needs restart — peer
 * is resolved once at client construction.
 */
export const resolveAniDbPeerEffect = Effect.fn("AniDbClient.resolvePeer")(function* () {
  const addresses = yield* Effect.tryPromise({
    try: () => resolve4(ANIDB_HOST),
    catch: (cause) =>
      ExternalCallError.make({
        cause,
        message: "AniDB host could not be resolved",
        operation: "anidb.socket.resolve",
      }),
  });

  return {
    addresses: new Set(addresses),
    port: ANIDB_PORT,
  } satisfies AniDbPeer;
});

export interface OpenAniDbSocketOptions {
  /**
   * Receives socket errors outside any in-flight packet exchange. Node crashes
   * the process on an unhandled dgram `'error'` event, so the idle session
   * socket (between paced commands) must always carry this handler. Errors
   * during an in-flight packet are additionally reported through that packet's
   * own failure channel.
   */
  readonly onBackgroundError?: (cause: Error) => void;
}

export const openAniDbSocketEffect = Effect.fn("AniDbClient.openSocket")(function* (
  localPort: number,
  options: OpenAniDbSocketOptions = {},
) {
  return yield* Effect.async<Socket, ExternalCallError>((resume) => {
    const socket = createSocket("udp4");

    const closeSocket = () => {
      try {
        socket.close();
      } catch {
        // Socket may already be closed by the error path.
      }
    };

    const cleanup = () => {
      socket.off("error", onError);
      socket.off("listening", onListening);
    };

    const onError = (cause: Error) => {
      cleanup();
      closeSocket();
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
      // Permanent crash guard for the idle lifetime of the socket. Kept after
      // the bind phase so bind failures still flow through `onError` above.
      socket.on("error", (cause) => options.onBackgroundError?.(cause));
      resume(Effect.succeed(socket));
    };

    socket.once("error", onError);
    socket.once("listening", onListening);
    socket.bind(localPort);

    return Effect.sync(() => {
      cleanup();
      closeSocket();
    });
  });
});

export const closeAniDbSocketEffect = Effect.fn("AniDbClient.closeSocket")(function* (
  socket: Socket,
) {
  yield* Effect.sync(() => socket.close()).pipe(Effect.ignore);
});

export const sendAndReceiveAniDbPacketEffect = Effect.fn("AniDbClient.sendAndReceivePacket")(
  function* (socket: Socket, command: string, peer: AniDbPeer, expectedTag: string) {
    return yield* Effect.async<string, AniDbSocketPacketError>((resume) => {
      let done = false;

      const cleanup = () => {
        socket.off("message", onMessage);
        socket.off("error", onError);
      };

      const settleFailure = (cause: unknown) => {
        if (done) {
          return;
        }

        done = true;
        cleanup();
        resume(
          Effect.fail(
            new AniDbSocketPacketError({
              cause,
              message: "AniDB UDP request failed",
            }),
          ),
        );
      };

      const onMessage = (message: Buffer, rinfo: { address: string; port: number }) => {
        if (done) {
          return;
        }

        // Drop datagrams from unexpected peers and responses whose echoed tag
        // does not match the pending request — both are noise on the socket.
        if (rinfo.port !== peer.port || !peer.addresses.has(rinfo.address)) {
          return;
        }

        if (parseAniDbResponseTag(message.toString("utf8")) !== expectedTag) {
          return;
        }

        done = true;
        cleanup();
        resume(Effect.succeed(message.toString("utf8")));
      };

      const onError = (cause: Error) => {
        settleFailure(cause);
      };

      socket.on("message", onMessage);
      socket.once("error", onError);

      socket.send(Buffer.from(command, "utf8"), peer.port, ANIDB_HOST, (cause) => {
        if (cause) {
          settleFailure(cause);
        }
      });

      return Effect.sync(cleanup);
    }).pipe(
      // Interruption-safe timeout: the async boundary owns the socket listeners,
      // and `Effect.timeout` interrupts the inner effect so cleanup runs.
      Effect.timeout(`${ANIDB_PACKET_TIMEOUT_MS} millis`),
      Effect.mapError((cause) =>
        cause instanceof Cause.TimeoutException
          ? new AniDbSocketPacketError({
              cause,
              message: "AniDB UDP response timed out",
            })
          : cause,
      ),
    );
  },
);

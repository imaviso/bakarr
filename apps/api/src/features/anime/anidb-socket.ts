import { createSocket, type Socket } from "node:dgram";

import { Effect } from "effect";

import { ExternalCallError } from "@/lib/effect-retry.ts";

const ANIDB_HOST = "api.anidb.net";
const ANIDB_PORT = 9000;
const ANIDB_PACKET_TIMEOUT_MS = 10_000;

export const openAniDbSocketEffect = Effect.fn("AniDbClient.openSocket")(function* (
  localPort: number,
) {
  return yield* Effect.async<Socket, ExternalCallError>((resume) => {
    const socket = createSocket("udp4");

    const closeSocket = () => {
      try {
        socket.close();
      } catch {
        // ignored: socket is already closed
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
  yield* Effect.sync(() => {
    try {
      socket.close();
    } catch {
      // ignored: socket is already closed
    }
  });
});

export function sendAndReceiveAniDbPacket(socket: Socket, command: string): Promise<string> {
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

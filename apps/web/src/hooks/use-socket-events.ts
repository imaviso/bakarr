import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Effect, Fiber, Stream } from "effect";
import { decodeNotificationEventWire, handleSocketEvent } from "~/lib/socket-event-handler";
import { SocketService } from "~/lib/effect/socket-service";
import { appRuntime } from "~/lib/runtime";

export function useSocketEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const fiber = appRuntime.runFork(
      Effect.scoped(
        Effect.gen(function* () {
          const socket = yield* SocketService;
          const stream = yield* socket.messages;
          yield* Stream.runForEach(stream, (event) =>
            Effect.sync(() => {
              const decoded = decodeNotificationEventWire(event.data);
              if (decoded._tag === "Right") {
                handleSocketEvent(queryClient, decoded.right);
              }
            }),
          );
        }),
      ),
    );

    return () => {
      appRuntime.runSync(Fiber.interrupt(fiber));
    };
  }, [queryClient]);
}

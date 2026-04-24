import { Context, Data, Effect, Layer, PubSub, Ref, Scope, Stream } from "effect";
import { AuthService } from "./auth-service";

export class SocketError extends Data.TaggedError("SocketError")<{
  readonly message: string;
}> {}

export class SocketService extends Context.Tag("@bakarr/web/SocketService")<
  SocketService,
  {
    readonly messages: Effect.Effect<Stream.Stream<MessageEvent<string>>, never, Scope.Scope>;
    readonly isConnected: Effect.Effect<boolean>;
  }
>() {
  static readonly Live = Layer.scoped(
    SocketService,
    Effect.gen(function* () {
      const auth = yield* AuthService;
      const messagePubSub = yield* PubSub.unbounded<MessageEvent<string>>();
      const isConnectedRef = yield* Ref.make(false);

      const buildUrl = Effect.sync(() => {
        if (typeof window === "undefined" || !window.location) {
          return "ws://localhost/api/events";
        }
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${window.location.host}/api/events`;
      });

      const connectWebSocket = Effect.sync(() => {
        const url = Effect.runSync(buildUrl);
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        const textDecoder = new TextDecoder();

        ws.addEventListener("open", () => {
          Effect.runSync(Ref.set(isConnectedRef, true));
        });

        ws.addEventListener("message", (event) => {
          const payload =
            typeof event.data === "string"
              ? event.data
              : event.data instanceof ArrayBuffer
                ? textDecoder.decode(new Uint8Array(event.data))
                : undefined;

          if (payload !== undefined) {
            Effect.runSync(
              PubSub.publish(
                messagePubSub,
                new MessageEvent<string>("message", { data: payload }),
              ).pipe(Effect.ignore),
            );
          }
        });

        ws.addEventListener("close", () => {
          Effect.runSync(Ref.set(isConnectedRef, false));
        });

        ws.addEventListener("error", () => {
          Effect.runSync(Ref.set(isConnectedRef, false));
        });

        return ws;
      });

      // Background fiber: maintain connection while authenticated
      yield* Effect.fork(
        Effect.gen(function* () {
          while (true) {
            const state = yield* auth.getState;
            if (!state.isAuthenticated) {
              yield* Effect.sleep("1 second");
              continue;
            }

            yield* Effect.acquireRelease(connectWebSocket, (ws) =>
              Effect.sync(() => ws.close()),
            ).pipe(
              Effect.flatMap((ws) =>
                Effect.async<void>((resume) => {
                  const onClose = () => resume(Effect.void);
                  ws.addEventListener("close", onClose);
                  return Effect.sync(() => ws.removeEventListener("close", onClose));
                }),
              ),
              Effect.catchAll(() => Effect.void),
            );

            yield* Effect.sleep("5 seconds");
          }
        }),
      );

      return SocketService.of({
        messages: PubSub.subscribe(messagePubSub).pipe(
          Effect.map((dequeue) => Stream.fromQueue(dequeue)),
        ),
        isConnected: Ref.get(isConnectedRef),
      });
    }),
  );
}

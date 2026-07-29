import { Effect, Layer, Stream } from "effect";

import { EventBus } from "@/features/events/event-bus.ts";

export function makeUnusedEventBusLayer(message: string) {
  return Layer.succeed(
    EventBus,
    EventBus.of({
      publish: () => Effect.void,
      publishInfo: () => Effect.void,
      withSubscriptionStream: () => Stream.die(message),
    }),
  );
}

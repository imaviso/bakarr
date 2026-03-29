import { Effect, Layer } from "effect";

import { EventBus } from "@/features/events/event-bus.ts";

export function makeUnusedEventBusLayer(message: string) {
  return Layer.succeed(EventBus, {
    publish: () => Effect.void,
    subscribe: () => Effect.die(message),
  });
}

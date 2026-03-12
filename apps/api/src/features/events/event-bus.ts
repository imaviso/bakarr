import { Context, Effect, Layer } from "effect";

import type { NotificationEvent } from "../../../../../packages/shared/src/index.ts";

export interface EventBusShape {
  readonly publish: (event: NotificationEvent) => Effect.Effect<void>;
  readonly stream: () => ReadableStream<Uint8Array>;
}

export class EventBus extends Context.Tag("@bakarr/api/EventBus")<
  EventBus,
  EventBusShape
>() {}

export const EventBusLive = Layer.sync(EventBus, () => {
  const subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const intervals = new WeakMap<
    ReadableStreamDefaultController<Uint8Array>,
    number
  >();

  const encoder = new TextEncoder();

  return {
    publish: (event: NotificationEvent) =>
      Effect.sync(() => {
        const payload = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

        for (const subscriber of subscribers) {
          try {
            subscriber.enqueue(payload);
          } catch {
            subscribers.delete(subscriber);
          }
        }
      }),
    stream: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          subscribers.add(controller);

          const interval = setInterval(() => {
            try {
              controller.enqueue(
                encoder.encode(`: keep-alive ${Date.now()}\n\n`),
              );
            } catch {
              subscribers.delete(controller);
              clearInterval(interval);
            }
          }, 15_000);

          intervals.set(controller, interval);

          controller.enqueue(encoder.encode(`: connected\n\n`));
        },
        cancel() {
          for (const subscriber of subscribers) {
            if (subscriber.desiredSize === null) {
              const interval = intervals.get(subscriber);

              if (interval !== undefined) {
                clearInterval(interval);
              }

              subscribers.delete(subscriber);
            }
          }
        },
      }),
  };
});

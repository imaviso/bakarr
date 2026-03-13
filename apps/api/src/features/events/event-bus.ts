import { Context, Effect, Layer, Queue, Ref } from "effect";

import type { NotificationEvent } from "../../../../../packages/shared/src/index.ts";

type EventQueue = ReturnType<typeof Queue.unbounded<NotificationEvent>> extends
  Effect.Effect<
    infer QueueType,
    unknown,
    unknown
  > ? QueueType
  : never;

export interface EventSubscription {
  readonly close: Effect.Effect<void>;
  readonly take: Effect.Effect<NotificationEvent, unknown>;
}

export interface EventBusShape {
  readonly publish: (event: NotificationEvent) => Effect.Effect<void>;
  readonly subscribe: () => Effect.Effect<EventSubscription>;
}

export class EventBus extends Context.Tag("@bakarr/api/EventBus")<
  EventBus,
  EventBusShape
>() {}

export const EventBusLive = Layer.effect(
  EventBus,
  Effect.gen(function* () {
    const subscribers = yield* Ref.make<Set<EventQueue>>(new Set());

    return {
      publish: (event: NotificationEvent) =>
        Effect.gen(function* () {
          const queues = yield* Ref.get(subscribers);

          for (const queue of queues) {
            yield* Queue.offer(queue, event).pipe(
              Effect.catchAllCause(() =>
                Ref.update(subscribers, (current) => {
                  const next = new Set(current);
                  next.delete(queue);
                  return next;
                })
              ),
            );
          }
        }).pipe(Effect.asVoid),
      subscribe: () =>
        Effect.gen(function* () {
          const queue = yield* Queue.unbounded<NotificationEvent>();

          yield* Ref.update(subscribers, (current) => {
            const next = new Set(current);
            next.add(queue);
            return next;
          });

          return {
            close: Effect.gen(function* () {
              yield* Ref.update(subscribers, (current) => {
                const next = new Set(current);
                next.delete(queue);
                return next;
              });
              yield* Queue.shutdown(queue);
            }),
            take: Queue.take(queue),
          } satisfies EventSubscription;
        }),
    };
  }),
);

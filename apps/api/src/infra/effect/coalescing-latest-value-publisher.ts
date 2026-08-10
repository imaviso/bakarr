import { Deferred, Effect, Fiber, Queue, Ref } from "effect";

/**
 * Latest-value coalescing publisher.
 *
 * Semantics:
 * - Multiple `offer` calls while publishing coalesce to the most recent value.
 * - `flush` waits for the currently active publish cycle to settle.
 * - `shutdown` interrupts the publish fiber and closes the queue.
 *
 * Built on Effect's `Queue.sliding(1)` + a single worker fiber: a sliding queue
 * of capacity 1 keeps only the newest pending value, and the worker drains it.
 * Each publish cycle completes a `Deferred`; `flush` awaits the current cycle's
 * `Deferred`, so it observes the publish settling — not the worker fiber.
 */

export interface LatestValuePublisher<A, E> {
  readonly flush: Effect.Effect<void, E>;
  readonly offer: (value: A) => Effect.Effect<void>;
  readonly shutdown: Effect.Effect<void>;
}

export const makeLatestValuePublisher = Effect.fn("EffectCoalescing.makeLatestValuePublisher")(
  <A, E>(
    publish: (value: A) => Effect.Effect<void, E>,
  ): Effect.Effect<LatestValuePublisher<A, E>> =>
    Effect.gen(function* () {
      const queue = yield* Queue.sliding<A>(1);
      const cycle = yield* Ref.make<Deferred.Deferred<void, E> | null>(null);
      const workerRef = yield* Ref.make<Fiber.Fiber<void, E> | null>(null);

      const runCycle = (value: A): Effect.Effect<void, E> =>
        Effect.gen(function* () {
          const completion = yield* Ref.get(cycle);
          if (completion === null) {
            return;
          }

          const exit = yield* Effect.exit(publish(value));

          if (exit._tag === "Failure") {
            yield* Deferred.failCause(completion, exit.cause);
            return;
          }

          yield* Deferred.succeed(completion, void 0);
        });

      const ensureWorker = Effect.gen(function* () {
        const existing = yield* Ref.get(workerRef);
        if (existing !== null) {
          return;
        }

        const worker = Effect.gen(function* () {
          while (true) {
            const value = yield* Queue.take(queue);
            yield* runCycle(value);
          }
        });

        const fiber = yield* Effect.fork(worker);
        yield* Ref.set(workerRef, fiber);
      });

      const offer = Effect.fn("LatestValuePublisher.offer")((value: A) =>
        Effect.gen(function* () {
          const existing = yield* Ref.get(cycle);
          if (existing === null) {
            yield* Ref.set(cycle, yield* Deferred.make<void, E>());
          }

          yield* Queue.offer(queue, value);
          yield* ensureWorker;
        }),
      );

      const flush = Effect.gen(function* () {
        const completion = yield* Ref.get(cycle);
        if (completion !== null) {
          yield* Deferred.await(completion);
        }
      }).pipe(Effect.withSpan("LatestValuePublisher.flush"));

      const shutdown = Effect.gen(function* () {
        const fiber = yield* Ref.get(workerRef);
        if (fiber !== null) {
          yield* Fiber.interrupt(fiber);
          yield* Ref.set(workerRef, null);
        }
      });

      return { flush, offer, shutdown } satisfies LatestValuePublisher<A, E>;
    }),
);

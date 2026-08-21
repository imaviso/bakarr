import { Deferred, Effect, Fiber, Queue, Ref } from "effect";
import type { Scope } from "effect";

/**
 * Latest-value coalescing publisher.
 *
 * Semantics:
 * - Multiple `offer` calls while a publish cycle is running coalesce to the
 *   most recent value.
 * - `flush` waits for the active publish cycle to settle and for the worker to
 *   drain everything offered before it, then returns. A failed publish fails
 *   `flush` with that error.
 * - `shutdown` interrupts the publish fiber.
 *
 * Built on Effect's `Queue.sliding(1)` + a single worker fiber: a sliding queue
 * of capacity 1 keeps only the newest pending value, and the worker drains it.
 * Each publish cycle owns a `Deferred` held in an open/closed slot; `offer`
 * joins the open cycle or installs a fresh one, and the worker closes the slot
 * once the cycle settles so the next value starts a new cycle.
 *
 * Termination note: `Queue.size` cannot detect quiescence here — a parked
 * taker makes it report `-1`, and it reads `0` while the worker is mid-cycle.
 * The worker therefore maintains an explicit `idle` flag and `flush` returns
 * only when the slot is closed and the worker is parked on `Queue.take`.
 *
 * The worker is forked into the construction scope (`Effect.forkScoped`) so it
 * outlives any individual offering fiber: background workers are interrupted on
 * config reload, but the publisher keeps draining until its own scope closes.
 * Publish failures never kill the loop — they fail only that cycle's
 * `Deferred`, which is what `flush` observes.
 */

interface CycleSlot<E> {
  readonly deferred: Deferred.Deferred<void, E>;
  readonly open: boolean;
}

export interface LatestValuePublisher<A, E> {
  readonly flush: Effect.Effect<void, E>;
  readonly offer: (value: A) => Effect.Effect<void>;
  readonly shutdown: Effect.Effect<void>;
}

export const makeLatestValuePublisher = Effect.fn("EffectCoalescing.makeLatestValuePublisher")(
  <A, E>(
    publish: (value: A) => Effect.Effect<void, E>,
  ): Effect.Effect<LatestValuePublisher<A, E>, never, Scope.Scope> =>
    Effect.gen(function* () {
      const queue = yield* Queue.sliding<A>(1);
      const slot = yield* Ref.make<CycleSlot<E> | null>(null);
      const idle = yield* Ref.make(true);

      const ensureOpenCycle: Effect.Effect<Deferred.Deferred<void, E>> = Effect.gen(function* () {
        const fresh = yield* Deferred.make<void, E>();
        return yield* Ref.modify(
          slot,
          (current): [Deferred.Deferred<void, E>, CycleSlot<E> | null] => {
            if (current === null || !current.open) {
              return [fresh, { deferred: fresh, open: true }];
            }
            return [current.deferred, current];
          },
        );
      });

      const closeCycle = (settled: Deferred.Deferred<void, E>) =>
        Ref.modify(slot, (current): [void, CycleSlot<E> | null] => {
          if (current !== null && current.deferred === settled) {
            return [undefined, { deferred: settled, open: false }];
          }
          return [undefined, current];
        });

      const worker = Effect.gen(function* () {
        while (true) {
          yield* Ref.set(idle, true);
          const value = yield* Queue.take(queue);
          yield* Ref.set(idle, false);

          const completion = yield* ensureOpenCycle;
          const exit = yield* Effect.exit(publish(value));

          if (exit._tag === "Failure") {
            yield* Deferred.failCause(completion, exit.cause);
          } else {
            yield* Deferred.succeed(completion, void 0);
          }

          yield* closeCycle(completion);
        }
      });

      const fiber = yield* Effect.forkScoped(worker);

      const offer = Effect.fn("LatestValuePublisher.offer")((value: A) =>
        Effect.gen(function* () {
          yield* ensureOpenCycle;
          yield* Queue.offer(queue, value);
        }),
      );

      const isQuiescent = Effect.gen(function* () {
        const current = yield* Ref.get(slot);
        return (current === null || !current.open) && (yield* Ref.get(idle));
      });

      const flush: Effect.Effect<void, E> = Effect.gen(function* () {
        while (true) {
          const current = yield* Ref.get(slot);

          if (current !== null && current.open) {
            const exit = yield* Effect.exit(Deferred.await(current.deferred));
            if (exit._tag === "Failure") {
              return yield* Effect.failCause(exit.cause);
            }
            // Let the worker run its post-cycle bookkeeping before re-reading.
            yield* Effect.yieldNow();
            continue;
          }

          if (yield* isQuiescent) {
            // Re-check after a yield: an offer may have landed between the
            // reads above and now.
            yield* Effect.yieldNow();
            if (yield* isQuiescent) {
              return yield* Effect.void;
            }
          }

          yield* Effect.yieldNow();
        }
      }).pipe(Effect.withSpan("LatestValuePublisher.flush"));

      const shutdown = Effect.gen(function* () {
        yield* Queue.shutdown(queue).pipe(Effect.ignore);
        yield* Fiber.interrupt(fiber);
      });

      return { flush, offer, shutdown } satisfies LatestValuePublisher<A, E>;
    }),
);

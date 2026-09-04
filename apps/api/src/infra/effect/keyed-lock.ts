import { Effect, Option, Semaphore } from "effect";

/**
 * Keyed single-flight locks.
 *
 * One module owns the two single-flight behaviors the runtime needs; callers
 * name a key and hand over an effect. Implementations are `Semaphore`-based,
 * so releases ride the semaphore's own uninterruptible onExit — a fiber
 * interrupted while holding a key cannot wedge the lock (upstream
 * `Semaphore.withPermits*` releases on every exit path).
 *
 * - `skipIfBusy`: runs the effect only when the key is free; overlapping
 *   triggers return `Option.none()` instead of waiting.
 * - `serialize`: overlapping runs for the same key wait for the in-flight run
 *   to settle; different keys run concurrently.
 */
export interface KeyedLocks {
  readonly skipIfBusy: <A, E, R>(
    key: string,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<Option.Option<A>, E, R>;
  readonly serialize: <A, E, R>(
    key: string,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}

const lockSemaphoreForKey = (locks: Map<string, Semaphore.Semaphore>, key: string) => {
  const existing = locks.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const fresh = Semaphore.makeUnsafe(1);
  locks.set(key, fresh);
  return fresh;
};

export const makeKeyedLocks = (): KeyedLocks => {
  const locks = new Map<string, Semaphore.Semaphore>();

  const semaphoreForKey = (key: string) => Effect.sync(() => lockSemaphoreForKey(locks, key));

  const skipIfBusy: KeyedLocks["skipIfBusy"] = (key, effect) =>
    Effect.flatMap(semaphoreForKey(key), (semaphore) =>
      semaphore.withPermitsIfAvailable(1)(effect),
    );

  const serialize: KeyedLocks["serialize"] = (key, effect) =>
    Effect.flatMap(semaphoreForKey(key), (semaphore) => semaphore.withPermits(1)(effect));

  return { serialize, skipIfBusy };
};

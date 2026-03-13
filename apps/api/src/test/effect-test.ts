import { Effect, TestContext } from "effect";

export function runTestEffect<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return Effect.runPromise(
    effect.pipe(Effect.provide(TestContext.TestContext)) as Effect.Effect<A, E>,
  );
}

export function runTestEffectExit<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return Effect.runPromiseExit(
    effect.pipe(Effect.provide(TestContext.TestContext)) as Effect.Effect<A, E>,
  );
}

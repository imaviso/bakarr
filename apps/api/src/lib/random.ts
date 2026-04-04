import { Context, Effect, Layer } from "effect";

import { bytesToHex } from "@/lib/hex.ts";

export interface RandomServiceShape {
  readonly randomBytes: (bytes: number) => Effect.Effect<Uint8Array>;
  readonly randomUuid: Effect.Effect<string>;
}

export class RandomService extends Context.Tag("@bakarr/lib/RandomService")<
  RandomService,
  RandomServiceShape
>() {}

export const RandomServiceLive = Layer.succeed(RandomService, {
  randomBytes: (bytes: number) => Effect.sync(() => randomBytesSync(bytes)),
  randomUuid: Effect.sync(() => crypto.randomUUID()),
});

export function hexFromBytes(data: Uint8Array): string {
  return bytesToHex(data);
}

export const randomHexFrom = Effect.fn("Random.randomHexFrom")(
  (random: RandomServiceShape, bytes: number): Effect.Effect<string> =>
    Effect.map(random.randomBytes(bytes), hexFromBytes),
);

/**
 * Generate random hex string. Use in service/orchestration code.
 */
export const randomHex = Effect.fn("Random.randomHex")(
  (bytes: number): Effect.Effect<string> => Effect.sync(() => randomHexSync(bytes)),
);

export const randomBytes = Effect.fn("Random.randomBytes")(
  (bytes: number): Effect.Effect<Uint8Array> => Effect.sync(() => randomBytesSync(bytes)),
);

/**
 * Sync random hex for pure/non-Effect code only (DTO assembly, parsing).
 * Prefer `randomHex` in service/orchestration code.
 */
export function randomHexSync(bytes: number): string {
  const data = randomBytesSync(bytes);
  return hexFromBytes(data);
}

export function randomBytesSync(bytes: number): Uint8Array {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return data;
}

/**
 * Generate random UUID. Use in service/orchestration code.
 */
export const randomUuid: Effect.Effect<string> = Effect.sync(() => crypto.randomUUID());

export function randomUuidSync(): string {
  return crypto.randomUUID();
}

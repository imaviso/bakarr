import { Context, Effect, Encoding, Layer } from "effect";

export interface RandomServiceShape {
  readonly randomBytes: (bytes: number) => Effect.Effect<Uint8Array>;
  readonly randomUuid: Effect.Effect<string>;
}

const makeRandomService: RandomServiceShape = {
  randomBytes: Effect.fn("RandomService.randomBytes")(
    (bytes: number): Effect.Effect<Uint8Array> => Effect.sync(() => randomBytesSync(bytes)),
  ),
  randomUuid: Effect.fn("RandomService.randomUuid")(
    (): Effect.Effect<string> => Effect.sync(() => crypto.randomUUID()),
  )(),
};

export class RandomService extends Context.Service<RandomService, RandomServiceShape>()(
  "@bakarr/lib/RandomService",
) {
  static readonly layer = Layer.sync(RandomService, () => makeRandomService);
}

export const randomHexFrom = Effect.fn("Random.randomHexFrom")(
  (random: RandomServiceShape, bytes: number): Effect.Effect<string> =>
    Effect.map(random.randomBytes(bytes), (data) => Encoding.encodeHex(data)),
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
  return Encoding.encodeHex(data);
}

export function randomBytesSync(bytes: number): Uint8Array {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return data;
}

/**
 * Generate random UUID. Use in service/orchestration code.
 */
export const randomUuid = Effect.fn("Random.randomUuid")(
  (): Effect.Effect<string> =>
    Effect.sync(() => crypto.randomUUID()).pipe(Effect.withSpan("Random.randomUuid")),
);

export function randomUuidSync(): string {
  return crypto.randomUUID();
}

import { Context, Effect, Layer, Option } from "effect";

export interface LocalStorageError {
  readonly _tag: "LocalStorageError";
  readonly message: string;
}

export class LocalStorage extends Context.Tag("@bakarr/web/LocalStorage")<
  LocalStorage,
  {
    readonly getItem: (key: string) => Effect.Effect<Option.Option<string>>;
    readonly setItem: (key: string, value: string) => Effect.Effect<void>;
    readonly removeItem: (key: string) => Effect.Effect<void>;
    readonly parseJson: (key: string) => Effect.Effect<Option.Option<unknown>>;
  }
>() {
  static readonly Live = Layer.succeed(
    LocalStorage,
    LocalStorage.of({
      getItem: (key: string) =>
        Effect.gen(function* () {
          const raw = yield* Effect.sync(() => localStorage.getItem(key)).pipe(
            Effect.catchAll(() => Effect.succeed(null)),
          );
          return raw === null ? Option.none() : Option.some(raw);
        }),

      setItem: (key: string, value: string) =>
        Effect.gen(function* () {
          yield* Effect.sync(() => localStorage.setItem(key, value)).pipe(
            Effect.catchAll(() => Effect.void),
          );
        }),

      removeItem: (key: string) =>
        Effect.gen(function* () {
          yield* Effect.sync(() => localStorage.removeItem(key)).pipe(
            Effect.catchAll(() => Effect.void),
          );
        }),

      parseJson: (key: string) =>
        Effect.gen(function* () {
          const raw = yield* Effect.sync(() => localStorage.getItem(key)).pipe(
            Effect.catchAll(() => Effect.succeed(null)),
          );
          if (raw === null) {
            return Option.none();
          }
          return yield* Effect.sync(() => JSON.parse(raw)).pipe(
            Effect.matchEffect({
              onFailure: () => Effect.succeed(Option.none()),
              onSuccess: (value) => Effect.succeed(Option.some(value)),
            }),
          );
        }),
    }),
  );
}

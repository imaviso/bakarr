import { Effect, Option } from "effect";

export const parseUrlEffect = Effect.fn("Url.parse")(function* <E>(
  input: string,
  onError: (cause: unknown) => E,
  base?: string | URL,
) {
  return yield* Effect.try({
    try: () => new URL(input, base),
    catch: onError,
  });
});

export function parseUrlOption(input: string, base?: string | URL): Option.Option<URL> {
  return Option.liftThrowable(() => new URL(input, base))();
}

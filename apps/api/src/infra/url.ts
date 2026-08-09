// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
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

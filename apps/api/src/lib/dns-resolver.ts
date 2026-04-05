import { resolve4, resolve6 } from "node:dns/promises";
import { Context, Effect, Layer, Schema } from "effect";

export class DnsLookupError extends Schema.TaggedError<DnsLookupError>()("DnsLookupError", {
  cause: Schema.Defect,
  hostname: Schema.String,
  recordType: Schema.Literal("A", "AAAA"),
}) {}

export interface DnsResolverShape {
  readonly resolve: (
    hostname: string,
    recordType: "A" | "AAAA",
  ) => Effect.Effect<readonly string[], DnsLookupError>;
}

export class DnsResolver extends Context.Tag("@bakarr/api/DnsResolver")<
  DnsResolver,
  DnsResolverShape
>() {}

export const DnsResolverLive = Layer.sync(DnsResolver, () => ({
  resolve: Effect.fn("DnsResolver.resolve")(function* (hostname: string, recordType: "A" | "AAAA") {
    return yield* Effect.tryPromise({
      try: () => (recordType === "A" ? resolve4(hostname) : resolve6(hostname)),
      catch: (cause) => new DnsLookupError({ cause, hostname, recordType }),
    });
  }),
}));

export const DnsResolverNoop = Layer.succeed(DnsResolver, {
  resolve: () => Effect.succeed([]),
});

/** Classify a DNS lookup failure as a "no record" condition vs real error. */
export function isDnsNoRecordError(cause: unknown): boolean {
  if (!(cause instanceof Error)) {
    return false;
  }

  const { name } = cause;
  const code = getErrorCode(cause);
  const message = cause.message.toLowerCase();

  return (
    name === "NotFound" ||
    code === "NotFound" ||
    code === "ENOTFOUND" ||
    code === "ENODATA" ||
    message.includes("not found") ||
    message.includes("enodata") ||
    message.includes("enotfound")
  );
}

function getErrorCode(error: Error): string | undefined {
  if (!("code" in error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

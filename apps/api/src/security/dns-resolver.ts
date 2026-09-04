// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { resolve4, resolve6 } from "node:dns/promises";
import { Context, Effect, Layer, Schema } from "effect";

import { getErrorCode } from "@/infra/error-code.ts";

export class DnsLookupError extends Schema.TaggedError<DnsLookupError>()("DnsLookupError", {
  cause: Schema.Defect(),
  hostname: Schema.String,
  recordType: Schema.Literals(["A", "AAAA"]),
}) {}

export interface DnsResolverShape {
  readonly resolve: (
    hostname: string,
    recordType: "A" | "AAAA",
  ) => Effect.Effect<readonly string[], DnsLookupError>;
}

const makeDnsResolver = {
  resolve: Effect.fn("DnsResolver.resolve")(function* (hostname: string, recordType: "A" | "AAAA") {
    return yield* Effect.tryPromise({
      try: () => (recordType === "A" ? resolve4(hostname) : resolve6(hostname)),
      catch: (cause) => new DnsLookupError({ cause, hostname, recordType }),
    });
  }),
} satisfies DnsResolverShape;

export class DnsResolver extends Context.Service<DnsResolver, DnsResolverShape>()(
  "@bakarr/api/DnsResolver",
) {
  static readonly layer = Layer.sync(DnsResolver, () => makeDnsResolver);
}

export const DnsResolverLive = DnsResolver.layer;

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

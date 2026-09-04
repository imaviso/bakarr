// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { Cause } from "effect";

export function formatJobFailureMessage(cause: unknown): string {
  if (Cause.isCause(cause)) {
    return Cause.pretty(cause);
  }

  if (
    typeof cause === "object" &&
    cause !== null &&
    "_tag" in cause &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return `${globalThis.String(cause._tag)}: ${cause.message}`;
  }

  if (cause instanceof Error) {
    return `${cause.name}: ${cause.message}`;
  }

  return globalThis.String(cause);
}

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
    return `${String(cause._tag)}: ${cause.message}`;
  }

  if (cause instanceof Error) {
    return `${cause.name}: ${cause.message}`;
  }

  return String(cause);
}

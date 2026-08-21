import { Option } from "effect";

/**
 * Reconciliation claim tokens mark an in-flight import inside `reconciledAt`.
 * Format: `claim:<isotimestamp>:<uuid>`. The embedded timestamp lets the sync
 * pass detect claims orphaned by a hard crash and release them for retry,
 * while finalization overwrites the token with a plain timestamp.
 */
export const CLAIM_TOKEN_PREFIX = "claim:";

export const STALE_CLAIM_THRESHOLD_MS = 30 * 60 * 1000;

export function buildClaimToken(nowIso: string, uuid: string): string {
  return `${CLAIM_TOKEN_PREFIX}${nowIso}:${uuid}`;
}

export function isClaimToken(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith(CLAIM_TOKEN_PREFIX);
}

/** Embedded ISO timestamp of a claim token; `Option.none` for plain timestamps or malformed tokens. */
export function parseClaimTimestamp(value: string | null | undefined): Option.Option<string> {
  if (!isClaimToken(value)) {
    return Option.none();
  }

  const withoutPrefix = value.slice(CLAIM_TOKEN_PREFIX.length);
  const separatorIndex = withoutPrefix.lastIndexOf(":");
  const timestamp = separatorIndex === -1 ? undefined : withoutPrefix.slice(0, separatorIndex);

  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    return Option.none();
  }

  return Option.some(timestamp);
}

/**
 * A leftover claim older than `STALE_CLAIM_THRESHOLD_MS` (or with an
 * unparseable timestamp) is stale: its reconcile fiber is gone and the row
 * must be released so auto-reconcile can retry.
 */
export function isStaleClaimToken(
  value: string | null | undefined,
  nowIso: string,
  thresholdMs = STALE_CLAIM_THRESHOLD_MS,
): boolean {
  const claimedAt = parseClaimTimestamp(value);

  if (Option.isNone(claimedAt)) {
    return isClaimToken(value);
  }

  const claimedMs = Date.parse(claimedAt.value);
  const nowMs = Date.parse(nowIso);

  return Number.isNaN(nowMs) || nowMs - claimedMs >= thresholdMs;
}

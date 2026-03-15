/**
 * Legacy episode parser facade.
 *
 * Delegates to the canonical media-identity parser so all call sites get
 * consistent behaviour (daily-safe, extras-aware, folder-context-capable)
 * without requiring an immediate migration of every consumer.
 */

import { parseFileSourceIdentity } from "./media-identity.ts";

export function parseEpisodeNumbers(path: string): readonly number[] {
  const result = parseFileSourceIdentity(path);
  if (!result.source_identity) return [];

  if (result.source_identity.scheme === "daily") {
    // Daily identities cannot be represented as numeric episode numbers
    // without resolver context, so return empty for legacy callers.
    return [];
  }

  return result.source_identity.episode_numbers;
}

export function parseEpisodeNumber(path: string): number | undefined {
  return parseEpisodeNumbers(path)[0];
}

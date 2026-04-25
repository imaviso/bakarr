import type { Config, ReleaseProfileRule } from "@packages/shared/index.ts";

import { parseReleaseName } from "@/features/operations/release-ranking-parse.ts";
import type { RankedRelease } from "@/features/operations/release-ranking-types.ts";

export function calculateReleaseScore(
  release: RankedRelease,
  rules: readonly ReleaseProfileRule[],
  config: Config,
): number {
  const titleLower = release.title.toLowerCase();
  let score = 0;

  for (const rule of rules) {
    if (rule.rule_type === "preferred" && titleLower.includes(rule.term.toLowerCase())) {
      score += rule.score;
    }
  }

  if (release.trusted) {
    score += 10;
  }

  score += seaDexScoreAdjustment(release);

  if (release.remake && config.nyaa.filter_remakes) {
    score -= 30;
  }

  const parsed = parseReleaseName(release.title);
  if (parsed.resolution && parsed.resolution === config.nyaa.preferred_resolution) {
    score += 10;
  }

  return score;
}

function seaDexScoreAdjustment(release: RankedRelease): number {
  let score = 0;

  if (release.isSeaDexBest) {
    score += 20;
  } else if (release.isSeaDex) {
    score += 10;
  }

  if (release.seaDexTags?.some((tag) => /best/i.test(tag))) {
    score += 5;
  }

  if (release.seaDexTags?.some((tag) => /alt|fallback/i.test(tag))) {
    score -= 2;
  }

  if (release.seaDexNotes) {
    if (/recommend|recommended|preferred/i.test(release.seaDexNotes)) {
      score += 4;
    }

    if (release.group && seaDexNotesMentionGroup(release.seaDexNotes, release.group)) {
      score += 4;
    }

    if (/avoid|issue|broken|desync|inferior/i.test(release.seaDexNotes)) {
      score -= 5;
    }
  }

  return score;
}

function seaDexNotesMentionGroup(notes: string, group: string) {
  return new RegExp(`\\b${escapeRegex(group)}\\b`, "i").test(notes);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

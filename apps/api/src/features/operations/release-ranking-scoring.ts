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

  if (
    release.group &&
    config.downloads.preferred_groups.some(
      (group: string) => group.toLowerCase() === release.group?.toLowerCase(),
    )
  ) {
    score += 25;
  }

  if (release.trusted) {
    score += 10;
  }

  score += seaDexScoreAdjustment(release, config);
  score += preferredCodecScoreAdjustment(release.title, config);

  if (release.remake && config.nyaa.filter_remakes) {
    score -= 30;
  }

  const parsed = parseReleaseName(release.title);
  if (parsed.resolution && parsed.resolution === config.nyaa.preferred_resolution) {
    score += 10;
  }

  return score;
}

function seaDexScoreAdjustment(release: RankedRelease, config: Config): number {
  if (!config.downloads.use_seadex) {
    return 0;
  }

  let score = 0;

  if (release.isSeaDexBest) {
    score += 20;
  } else if (release.isSeaDex) {
    score += 10;
  }

  if (config.downloads.prefer_dual_audio) {
    if (release.seaDexDualAudio) {
      score += 8;
    } else if (release.isSeaDex) {
      score -= 3;
    }
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

function preferredCodecScoreAdjustment(title: string, config: Config): number {
  const preferredCodec = config.downloads.preferred_codec?.trim().toLowerCase();

  if (!preferredCodec) {
    return 0;
  }

  return titleHasCodec(title, preferredCodec) ? 6 : -1;
}

function titleHasCodec(title: string, codec: string) {
  const lower = title.toLowerCase();

  if (codec === "hevc" || codec === "h265" || codec === "x265") {
    return /\b(?:hevc|h[ .-]?265|x265)\b/i.test(lower);
  }

  if (codec === "avc" || codec === "h264" || codec === "x264") {
    return /\b(?:avc|h[ .-]?264|x264)\b/i.test(lower);
  }

  if (codec === "av1") {
    return /\bav1\b/i.test(lower);
  }

  return lower.includes(codec);
}

function seaDexNotesMentionGroup(notes: string, group: string) {
  return new RegExp(`\\b${escapeRegex(group)}\\b`, "i").test(notes);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

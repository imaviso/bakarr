import type {
  Config,
  DownloadAction,
  Quality,
  QualityProfile,
  ReleaseProfileRule,
} from "@packages/shared/index.ts";
import { Either, Option } from "effect";

import {
  cutoffQuality,
  hasSourceMarkers,
  parseQualityFromTitle,
  parseResolution,
} from "@/features/operations/release-ranking-quality.ts";
import { parseReleaseName } from "@/features/operations/release-ranking-parse.ts";
import { calculateReleaseScore } from "@/features/operations/release-ranking-scoring.ts";
import { parseSizeLabelToBytes } from "@/features/operations/release-ranking-size.ts";
import type {
  RankedCurrentEpisode,
  RankedRelease,
} from "@/features/operations/release-ranking-types.ts";

export function decideDownloadAction(
  profile: QualityProfile,
  rules: readonly ReleaseProfileRule[],
  current: Option.Option<RankedCurrentEpisode>,
  release: RankedRelease,
  config: Config,
): DownloadAction {
  const sizeGuard = evaluateSizeGuard(profile, release.sizeBytes);

  if (sizeGuard._tag === "Reject") {
    return reject(sizeGuard.reason);
  }

  const ruleGuard = evaluateRuleGuard(rules, release.title);

  if (ruleGuard._tag === "Reject") {
    return ruleGuard.action;
  }

  const parsed = parseReleaseName(release.title);
  const releaseQuality = parsed.quality;

  if (!isQualityAllowed(profile, releaseQuality)) {
    return reject("quality not allowed in profile");
  }

  const score = calculateReleaseScore(release, rules, config);

  if (Option.isNone(current) || !current.value.downloaded) {
    return accept(release, releaseQuality, score);
  }

  const currentEpisode = current.value;

  if (!profile.upgrade_allowed) {
    return reject("upgrades disabled");
  }

  const currentAssessment = assessCurrentEpisode(currentEpisode, rules, config);
  const cutoffRank = cutoffQuality(profile.cutoff).rank;
  const currentMeetsCutoff = currentAssessment.quality.rank <= cutoffRank;
  const seadexPreferred = profile.seadex_preferred;

  if (seadexPreferred && release.isSeaDex && !currentAssessment.isSeaDex) {
    return upgrade(release, releaseQuality, score, currentAssessment, "SeaDex release available");
  }

  if (currentMeetsCutoff) {
    return reject("already at quality cutoff");
  }

  if (releaseQuality.rank < currentAssessment.quality.rank) {
    return upgrade(release, releaseQuality, score, currentAssessment, "better quality available");
  }

  if (releaseQuality.rank === currentAssessment.quality.rank && score > currentAssessment.score) {
    return upgrade(
      release,
      releaseQuality,
      score,
      currentAssessment,
      `Score upgrade (+${score} vs +${currentAssessment.score})`,
    );
  }

  return reject("no quality improvement");
}

function evaluateSizeGuard(profile: QualityProfile, releaseSizeBytes: number) {
  const minSizeBytes = parseSizeLabelToBytes(profile.min_size);
  if (Either.isLeft(minSizeBytes)) {
    return { _tag: "Pass" as const };
  }

  const maxSizeBytes = parseSizeLabelToBytes(profile.max_size);
  if (Either.isLeft(maxSizeBytes)) {
    return { _tag: "Pass" as const };
  }

  const minBytesValue = minSizeBytes.right;
  const maxBytesValue = maxSizeBytes.right;
  const min = Option.isSome(minBytesValue) ? minBytesValue.value : null;
  const max = Option.isSome(maxBytesValue) ? maxBytesValue.value : null;

  if (min !== null && releaseSizeBytes < min) {
    return { _tag: "Reject" as const, reason: "size too small" };
  }

  if (max !== null && releaseSizeBytes > max) {
    return { _tag: "Reject" as const, reason: "size too big" };
  }

  return { _tag: "Pass" as const };
}

function evaluateRuleGuard(rules: readonly ReleaseProfileRule[], title: string) {
  const titleLower = title.toLowerCase();

  for (const rule of rules) {
    const term = rule.term.toLowerCase();

    if (rule.rule_type === "must" && !titleLower.includes(term)) {
      return { _tag: "Reject" as const, action: reject(`Missing required term: ${rule.term}`) };
    }

    if (rule.rule_type === "must_not" && titleLower.includes(term)) {
      return { _tag: "Reject" as const, action: reject(`Contains forbidden term: ${rule.term}`) };
    }
  }

  return { _tag: "Pass" as const };
}

function assessCurrentEpisode(
  current: RankedCurrentEpisode,
  rules: readonly ReleaseProfileRule[],
  config: Config,
) {
  const currentFilePath = current.filePath ?? "";
  const currentHasQualityInfo =
    Boolean(parseResolution(currentFilePath)) || hasSourceMarkers(currentFilePath);
  const quality = currentHasQualityInfo
    ? parseQualityFromTitle(currentFilePath)
    : parseQualityFromTitle("unknown");
  const parsed = parseReleaseName(currentFilePath);
  const score = calculateReleaseScore(
    {
      group: parsed.group,
      isSeaDex: current.isSeaDex ?? false,
      isSeaDexBest: current.isSeaDexBest ?? false,
      remake: false,
      seeders: 0,
      sizeBytes: 0,
      title: currentFilePath,
      trusted: false,
    },
    rules,
    config,
  );

  return {
    filePath: current.filePath,
    isSeaDex: current.isSeaDex ?? false,
    isSeaDexBest: current.isSeaDexBest ?? false,
    quality,
    score,
  };
}

function accept(release: RankedRelease, quality: Quality, score: number): DownloadAction {
  return {
    Accept: {
      quality,
      is_seadex: release.isSeaDex,
      is_seadex_best: release.isSeaDexBest || undefined,
      score,
    },
  };
}

function upgrade(
  release: RankedRelease,
  quality: Quality,
  score: number,
  current: {
    filePath?: string | undefined;
    quality: Quality;
    score: number;
  },
  reason: string,
): DownloadAction {
  return {
    Upgrade: {
      quality,
      is_seadex: release.isSeaDex,
      is_seadex_best: release.isSeaDexBest || undefined,
      score,
      reason,
      old_file_path: current.filePath,
      old_quality: current.quality,
      old_score: current.score,
    },
  };
}

function reject(reason: string): DownloadAction {
  return { Reject: { reason } };
}

function isQualityAllowed(profile: QualityProfile, quality: Quality): boolean {
  return (
    profile.allowed_qualities.length === 0 ||
    profile.allowed_qualities.includes(quality.name) ||
    profile.allowed_qualities.includes(`${quality.resolution}p`) ||
    profile.allowed_qualities.includes(String(quality.resolution))
  );
}

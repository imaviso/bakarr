import { Effect } from "effect";

import type {
  Config,
  DownloadAction,
  EpisodeSearchResult,
  Quality,
  QualityProfile,
  ReleaseProfileRule,
} from "@packages/shared/index.ts";

import {
  cutoffQuality,
  hasSourceMarkers,
  parseQualityFromTitle,
  parseResolution,
} from "@/features/operations/release-ranking-quality.ts";
import { OperationsInputError } from "@/features/operations/errors.ts";
import { parseReleaseName } from "@/features/operations/release-ranking-parse.ts";
import type {
  RankedCurrentEpisode,
  RankedRelease,
} from "@/features/operations/release-ranking-types.ts";

export function decideDownloadAction(
  profile: QualityProfile,
  rules: readonly ReleaseProfileRule[],
  current: RankedCurrentEpisode | null,
  release: RankedRelease,
  config: Config,
): DownloadAction {
  const minSizeBytesResult = parseSizeLabelToBytes(profile.min_size);
  if (minSizeBytesResult._tag === "Left") {
    return { Reject: { reason: minSizeBytesResult.left.message } };
  }

  const maxSizeBytesResult = parseSizeLabelToBytes(profile.max_size);
  if (maxSizeBytesResult._tag === "Left") {
    return { Reject: { reason: maxSizeBytesResult.left.message } };
  }

  const minSizeBytes = minSizeBytesResult.right;
  const maxSizeBytes = maxSizeBytesResult.right;

  const parsed = parseReleaseName(release.title);
  const releaseQuality = parsed.quality;

  for (const rule of rules) {
    const term = rule.term.toLowerCase();
    const titleLower = release.title.toLowerCase();
    if (rule.rule_type === "must" && !titleLower.includes(term)) {
      return { Reject: { reason: `Missing required term: ${rule.term}` } };
    }
    if (rule.rule_type === "must_not" && titleLower.includes(term)) {
      return { Reject: { reason: `Contains forbidden term: ${rule.term}` } };
    }
  }

  if (!isQualityAllowed(profile, releaseQuality)) {
    return { Reject: { reason: "quality not allowed in profile" } };
  }

  if (minSizeBytes !== null && release.sizeBytes < minSizeBytes) {
    return { Reject: { reason: "size too small" } };
  }

  if (maxSizeBytes !== null && release.sizeBytes > maxSizeBytes) {
    return { Reject: { reason: "size too big" } };
  }

  const score = calculateScore(release, rules, config);

  if (!current || !current.downloaded) {
    return {
      Accept: {
        quality: releaseQuality,
        is_seadex: release.isSeaDex,
        is_seadex_best: release.isSeaDexBest || undefined,
        score,
      },
    };
  }

  if (!profile.upgrade_allowed) {
    return { Reject: { reason: "upgrades disabled" } };
  }

  const currentFilePath = current.filePath ?? "";
  const currentHasQualityInfo =
    Boolean(parseResolution(currentFilePath)) || hasSourceMarkers(currentFilePath);
  const currentQuality = currentHasQualityInfo
    ? parseQualityFromTitle(currentFilePath)
    : parseQualityFromTitle("unknown");
  const currentScore = calculateScore(
    {
      group: parseReleaseName(currentFilePath).group,
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

  const cutoffRank = cutoffQuality(profile.cutoff).rank;
  const currentMeetsCutoff = currentQuality.rank <= cutoffRank;
  const seadexPreferred = profile.seadex_preferred && config.downloads.use_seadex;

  if (seadexPreferred && release.isSeaDex && !current.isSeaDex) {
    return {
      Upgrade: {
        quality: releaseQuality,
        is_seadex: release.isSeaDex,
        is_seadex_best: release.isSeaDexBest || undefined,
        score,
        reason: "SeaDex release available",
        old_file_path: current.filePath,
        old_quality: currentQuality,
        old_score: currentScore,
      },
    };
  }

  if (currentMeetsCutoff) {
    if (release.isSeaDex && !current.isSeaDex && seadexPreferred) {
      return {
        Upgrade: {
          quality: releaseQuality,
          is_seadex: release.isSeaDex,
          is_seadex_best: release.isSeaDexBest || undefined,
          score,
          reason: "SeaDex release available",
          old_file_path: current.filePath,
          old_quality: currentQuality,
          old_score: currentScore,
        },
      };
    }

    return { Reject: { reason: "already at quality cutoff" } };
  }

  if (releaseQuality.rank < currentQuality.rank) {
    return {
      Upgrade: {
        quality: releaseQuality,
        is_seadex: release.isSeaDex,
        is_seadex_best: release.isSeaDexBest || undefined,
        score,
        reason: "better quality available",
        old_file_path: current.filePath,
        old_quality: currentQuality,
        old_score: currentScore,
      },
    };
  }

  if (releaseQuality.rank === currentQuality.rank && score > currentScore) {
    return {
      Upgrade: {
        quality: releaseQuality,
        is_seadex: release.isSeaDex,
        is_seadex_best: release.isSeaDexBest || undefined,
        score,
        reason: `Score upgrade (+${score} vs +${currentScore})`,
        old_file_path: current.filePath,
        old_quality: currentQuality,
        old_score: currentScore,
      },
    };
  }

  return { Reject: { reason: "no quality improvement" } };
}

export const validateQualityProfileSizeLabels = Effect.fn(
  "Operations.validateQualityProfileSizeLabels",
)(function* (profile: QualityProfile) {
  const minSizeBytesResult = parseSizeLabelToBytes(profile.min_size);
  if (minSizeBytesResult._tag === "Left") {
    return yield* minSizeBytesResult.left;
  }

  const maxSizeBytesResult = parseSizeLabelToBytes(profile.max_size);
  if (maxSizeBytesResult._tag === "Left") {
    return yield* maxSizeBytesResult.left;
  }
});

export function compareEpisodeSearchResults(
  left: EpisodeSearchResult,
  right: EpisodeSearchResult,
): number {
  return (
    actionWeight(right.download_action) - actionWeight(left.download_action) ||
    actionScore(right.download_action) - actionScore(left.download_action) ||
    actionQualityRank(left.download_action) - actionQualityRank(right.download_action) ||
    right.seeders - left.seeders ||
    right.size - left.size
  );
}

function actionWeight(action: DownloadAction): number {
  if (action.Accept) return 3;
  if (action.Upgrade) return 2;
  return 1;
}

function actionScore(action: DownloadAction): number {
  return action.Accept?.score ?? action.Upgrade?.score ?? Number.NEGATIVE_INFINITY;
}

function actionQualityRank(action: DownloadAction): number {
  return action.Accept?.quality.rank ?? action.Upgrade?.quality.rank ?? Number.POSITIVE_INFINITY;
}

function calculateScore(
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

  if (release.trusted) score += 10;
  if (config.downloads.use_seadex) {
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
  }

  const preferredCodec = config.downloads.preferred_codec?.trim().toLowerCase();
  if (preferredCodec) {
    if (titleHasCodec(release.title, preferredCodec)) {
      score += 6;
    } else {
      score -= 1;
    }
  }

  if (release.remake && config.nyaa.filter_remakes) score -= 30;

  const parsed = parseReleaseName(release.title);
  if (parsed.resolution && parsed.resolution === config.nyaa.preferred_resolution) {
    score += 10;
  }

  return score;
}

function isQualityAllowed(profile: QualityProfile, quality: Quality): boolean {
  return (
    profile.allowed_qualities.length === 0 ||
    profile.allowed_qualities.includes(quality.name) ||
    profile.allowed_qualities.includes(`${quality.resolution}p`) ||
    profile.allowed_qualities.includes(String(quality.resolution))
  );
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

function parseSizeLabelToBytes(
  value: string | null | undefined,
): { _tag: "Left"; left: OperationsInputError } | { _tag: "Right"; right: number | null } {
  if (!value || value.trim().length === 0) {
    return { _tag: "Right", right: null };
  }

  const match = value.match(/([0-9.]+)\s*(KiB|MiB|GiB|TiB|KB|MB|GB|TB|B)/i);
  if (!match) {
    return {
      _tag: "Left",
      left: new OperationsInputError({
        message: `Invalid quality profile size label: ${value}`,
      }),
    };
  }
  const amount = Number.parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  if (!Number.isFinite(amount) || amount < 0) {
    return {
      _tag: "Left",
      left: new OperationsInputError({
        message: `Invalid quality profile size label: ${value}`,
      }),
    };
  }

  let multiplier = 1024 ** 4;

  if (unit === "B") {
    multiplier = 1;
  } else if (unit === "KIB" || unit === "KB") {
    multiplier = 1024;
  } else if (unit === "MIB" || unit === "MB") {
    multiplier = 1024 ** 2;
  } else if (unit === "GIB" || unit === "GB") {
    multiplier = 1024 ** 3;
  }
  return { _tag: "Right", right: Math.round(amount * multiplier) };
}

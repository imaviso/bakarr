import type {
  Config,
  DownloadAction,
  EpisodeSearchResult,
  Quality,
  QualityProfile,
  ReleaseProfileRule,
} from "../../../../../packages/shared/src/index.ts";
import { parseReleaseSourceIdentity } from "../../lib/media-identity.ts";

export interface ParsedReleaseName {
  readonly episodeNumber?: number;
  readonly episodeNumbers: readonly number[];
  readonly group?: string;
  readonly isBatch: boolean;
  readonly isSeaDex: boolean;
  readonly isSeaDexBest: boolean;
  readonly quality: Quality;
  readonly resolution?: string;
}

export interface RankedCurrentEpisode {
  readonly downloaded: boolean;
  readonly filePath?: string;
  readonly isSeaDex?: boolean;
  readonly isSeaDexBest?: boolean;
}

export interface RankedRelease {
  readonly group?: string;
  readonly isSeaDex: boolean;
  readonly isSeaDexBest: boolean;
  readonly seaDexDualAudio?: boolean;
  readonly seaDexNotes?: string;
  readonly seaDexTags?: readonly string[];
  readonly remake: boolean;
  readonly seeders: number;
  readonly sizeBytes: number;
  readonly title: string;
  readonly trusted: boolean;
}

type QualitySource =
  | "BluRayRemux"
  | "BluRay"
  | "WebDl"
  | "WebRip"
  | "HDTV"
  | "DVD"
  | "SDTV"
  | "Unknown";

const QUALITY_ID = {
  BLURAY_2160P: 1,
  WEBDL_2160P: 2,
  BLURAY_1080P: 3,
  WEBDL_1080P: 4,
  BLURAY_720P: 5,
  WEBDL_720P: 6,
  HDTV_1080P: 7,
  HDTV_720P: 8,
  DVD_576P: 9,
  SDTV_480P: 10,
  BLURAY_2160P_REMUX: 11,
  BLURAY_1080P_REMUX: 12,
  WEBRIP_2160P: 13,
  WEBRIP_1080P: 14,
  WEBRIP_720P: 15,
  UNKNOWN: 99,
} as const;

const QUALITY_DEFS: ReadonlyArray<Quality & { readonly sourceKind: QualitySource }> = [
  makeQuality(QUALITY_ID.BLURAY_2160P_REMUX, "BluRay 2160p Remux", "remux", 2160, 1, "BluRayRemux"),
  makeQuality(QUALITY_ID.BLURAY_2160P, "BluRay 2160p", "bluray", 2160, 2, "BluRay"),
  makeQuality(QUALITY_ID.WEBDL_2160P, "WEB-DL 2160p", "web", 2160, 3, "WebDl"),
  makeQuality(QUALITY_ID.WEBRIP_2160P, "WEBRip 2160p", "webrip", 2160, 4, "WebRip"),
  makeQuality(QUALITY_ID.BLURAY_1080P_REMUX, "BluRay 1080p Remux", "remux", 1080, 5, "BluRayRemux"),
  makeQuality(QUALITY_ID.BLURAY_1080P, "BluRay 1080p", "bluray", 1080, 6, "BluRay"),
  makeQuality(QUALITY_ID.WEBDL_1080P, "WEB-DL 1080p", "web", 1080, 7, "WebDl"),
  makeQuality(QUALITY_ID.WEBRIP_1080P, "WEBRip 1080p", "webrip", 1080, 8, "WebRip"),
  makeQuality(QUALITY_ID.BLURAY_720P, "BluRay 720p", "bluray", 720, 9, "BluRay"),
  makeQuality(QUALITY_ID.WEBDL_720P, "WEB-DL 720p", "web", 720, 10, "WebDl"),
  makeQuality(QUALITY_ID.WEBRIP_720P, "WEBRip 720p", "webrip", 720, 11, "WebRip"),
  makeQuality(QUALITY_ID.HDTV_1080P, "HDTV 1080p", "hdtv", 1080, 12, "HDTV"),
  makeQuality(QUALITY_ID.HDTV_720P, "HDTV 720p", "hdtv", 720, 13, "HDTV"),
  makeQuality(QUALITY_ID.DVD_576P, "DVD 576p", "dvd", 576, 14, "DVD"),
  makeQuality(QUALITY_ID.SDTV_480P, "SDTV 480p", "sdtv", 480, 15, "SDTV"),
  makeQuality(QUALITY_ID.UNKNOWN, "Unknown", "unknown", 0, 99, "Unknown"),
];

export function parseReleaseName(title: string): ParsedReleaseName {
  const lower = title.toLowerCase();
  const groupMatch = title.match(/^\[(.*?)\]/);
  const resolution = parseResolution(title);
  const quality = parseQualityFromTitle(title);
  const batchTerms = [" batch", "complete", "全集", "season pack", "box", "collection"];
  const episodeNumbers = parseEpisodeNumbersFromTitle(title);
  const seasonPack = looksLikeSeasonPack(title);

  return {
    episodeNumber: episodeNumbers[0],
    episodeNumbers,
    group: groupMatch?.[1],
    isBatch:
      episodeNumbers.length > 1 || batchTerms.some((term) => lower.includes(term)) || seasonPack,
    isSeaDex: false,
    isSeaDexBest: false,
    quality,
    resolution,
  };
}

function looksLikeSeasonPack(title: string) {
  return [
    /(?:^|[\s._-])s(\d{1,2})(?![\s._-]*e\d)(?:[\s._-]|\(|\[|$)/i,
    /(?:^|[\s._-])season[\s._-]*(\d{1,2})(?![\s._-]*(?:e|ep|episode)\d)(?:[\s._-]|\(|\[|$)/i,
    /(?:^|[\s._-])(\d{1,2})(?:st|nd|rd|th)[\s._-]+season(?:[\s._-]|\(|\[|$)/i,
  ].some((pattern) => pattern.test(title));
}

export function parseEpisodeFromTitle(title: string): number | undefined {
  return parseEpisodeNumbersFromTitle(title)[0];
}

export function parseEpisodeNumbersFromTitle(title: string): readonly number[] {
  const result = parseReleaseSourceIdentity(title);
  if (!result.source_identity) return [];

  if (result.source_identity.scheme === "daily") {
    // Daily identities cannot be represented as numeric episode numbers
    return [];
  }

  return result.source_identity.episode_numbers;
}

export function parseResolution(title: string): string | undefined {
  const lower = title.toLowerCase();

  if (lower.includes("2160") || lower.includes("4k")) return "2160p";
  if (lower.includes("1080")) return "1080p";
  if (lower.includes("720")) return "720p";
  if (lower.includes("576")) return "576p";
  if (lower.includes("480")) return "480p";

  return undefined;
}

export function parseQualityFromTitle(title: string): Quality {
  const lower = title.toLowerCase();
  const resolution = parseResolution(title)
    ? Number(parseResolution(title)!.replace("p", ""))
    : 1080;
  const source = inferSource(lower);

  const exact = QUALITY_DEFS.find(
    (quality) => quality.sourceKind === source && quality.resolution === resolution,
  );
  if (exact) {
    return stripSourceKind(exact);
  }

  return stripSourceKind(QUALITY_DEFS[QUALITY_DEFS.length - 1]);
}

export function decideDownloadAction(
  profile: QualityProfile,
  rules: readonly ReleaseProfileRule[],
  current: RankedCurrentEpisode | null,
  release: RankedRelease,
  config: Config,
): DownloadAction {
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

  if (profile.min_size && release.sizeBytes < parseSizeLabelToBytes(profile.min_size)) {
    return { Reject: { reason: "size too small" } };
  }

  if (profile.max_size && release.sizeBytes > parseSizeLabelToBytes(profile.max_size)) {
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
    : stripSourceKind(QUALITY_DEFS[QUALITY_DEFS.length - 1]);
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

function cutoffQuality(label: string): Quality {
  const parsed = parseQualityFromTitle(label);
  if (parsed.id !== QUALITY_ID.UNKNOWN) {
    return parsed;
  }

  const resolution = parseResolution(label)
    ? Number(parseResolution(label)!.replace("p", ""))
    : 1080;
  const exact = QUALITY_DEFS.find(
    (quality) => quality.resolution === resolution && quality.sourceKind === "BluRay",
  );
  return stripSourceKind(exact ?? QUALITY_DEFS[5]);
}

const SOURCE_MARKERS = [
  "remux",
  "bluray",
  "blu-ray",
  "bdremux",
  "bdmv",
  "bdrip",
  "webrip",
  "amzn",
  "amazon",
  "crunchyroll",
  "dsnp",
  "disney",
  "netflix",
  "hmax",
  "hulu",
  "web-dl",
  "webdl",
  "hdtv",
  "dvd",
  "sdtv",
];

function hasSourceMarkers(title: string): boolean {
  const lower = title.toLowerCase();
  return SOURCE_MARKERS.some((marker) => lower.includes(marker));
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

function inferSource(lower: string): QualitySource {
  if (lower.includes("remux")) return "BluRayRemux";
  if (
    lower.includes("bluray") ||
    lower.includes("blu-ray") ||
    lower.includes("bdremux") ||
    lower.includes("bdrip") ||
    lower.includes("bdmv") ||
    /(?:^|[\s._\-[\]()])bd(?:$|[\s._\-[\]()])/i.test(lower)
  )
    return "BluRay";
  if (lower.includes("webrip")) return "WebRip";
  if (
    lower.includes("amzn") ||
    lower.includes("amazon") ||
    /\bcr\b/i.test(lower) ||
    lower.includes("crunchyroll") ||
    lower.includes("dsnp") ||
    lower.includes("disney") ||
    /\bnf\b/i.test(lower) ||
    lower.includes("netflix") ||
    lower.includes("hmax") ||
    lower.includes("hulu") ||
    lower.includes("web")
  )
    return "WebDl";
  if (lower.includes("hdtv")) return "HDTV";
  if (lower.includes("dvd")) return "DVD";
  if (lower.includes("sdtv")) return "SDTV";
  return "WebDl";
}

function parseSizeLabelToBytes(value: string): number {
  const match = value.match(/([0-9.]+)\s*(KiB|MiB|GiB|TiB|KB|MB|GB|TB|B)/i);
  if (!match) {
    return Number.parseFloat(value) || 0;
  }
  const amount = Number.parseFloat(match[1]);
  const unit = match[2].toUpperCase();
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
  return Math.round(amount * multiplier);
}

function stripSourceKind(quality: Quality & { readonly sourceKind?: QualitySource }): Quality {
  return {
    id: quality.id,
    name: quality.name,
    rank: quality.rank,
    resolution: quality.resolution,
    source: quality.source,
  };
}

function makeQuality(
  id: number,
  name: string,
  source: string,
  resolution: number,
  rank: number,
  sourceKind: QualitySource,
) {
  return {
    id,
    name,
    rank,
    resolution,
    source,
    sourceKind,
  } as const;
}

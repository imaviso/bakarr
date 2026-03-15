import type {
  Config,
  DownloadAction,
  EpisodeSearchResult,
  Quality,
  QualityProfile,
  ReleaseProfileRule,
} from "../../../../../packages/shared/src/index.ts";

export interface ParsedReleaseName {
  readonly episodeNumber?: number;
  readonly episodeNumbers: readonly number[];
  readonly group?: string;
  readonly isBatch: boolean;
  readonly isSeaDex: boolean;
  readonly quality: Quality;
  readonly resolution?: string;
}

export interface RankedCurrentEpisode {
  readonly downloaded: boolean;
  readonly filePath?: string;
  readonly isSeaDex?: boolean;
}

export interface RankedRelease {
  readonly group?: string;
  readonly isSeaDex: boolean;
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

const QUALITY_DEFS: ReadonlyArray<
  Quality & { readonly sourceKind: QualitySource }
> = [
  makeQuality(11, "BluRay 2160p Remux", "remux", 2160, 1, "BluRayRemux"),
  makeQuality(1, "BluRay 2160p", "bluray", 2160, 2, "BluRay"),
  makeQuality(2, "WEB-DL 2160p", "web", 2160, 3, "WebDl"),
  makeQuality(13, "WEBRip 2160p", "webrip", 2160, 4, "WebRip"),
  makeQuality(12, "BluRay 1080p Remux", "remux", 1080, 5, "BluRayRemux"),
  makeQuality(3, "BluRay 1080p", "bluray", 1080, 6, "BluRay"),
  makeQuality(4, "WEB-DL 1080p", "web", 1080, 7, "WebDl"),
  makeQuality(14, "WEBRip 1080p", "webrip", 1080, 8, "WebRip"),
  makeQuality(5, "BluRay 720p", "bluray", 720, 9, "BluRay"),
  makeQuality(6, "WEB-DL 720p", "web", 720, 10, "WebDl"),
  makeQuality(15, "WEBRip 720p", "webrip", 720, 11, "WebRip"),
  makeQuality(7, "HDTV 1080p", "hdtv", 1080, 12, "HDTV"),
  makeQuality(8, "HDTV 720p", "hdtv", 720, 13, "HDTV"),
  makeQuality(9, "DVD 576p", "dvd", 576, 14, "DVD"),
  makeQuality(10, "SDTV 480p", "sdtv", 480, 15, "SDTV"),
  makeQuality(99, "Unknown", "unknown", 0, 99, "Unknown"),
];

export function parseReleaseName(title: string): ParsedReleaseName {
  const lower = title.toLowerCase();
  const groupMatch = title.match(/^\[(.*?)\]/);
  const resolution = parseResolution(title);
  const quality = parseQualityFromTitle(title);
  const batchTerms = [
    " batch",
    "complete",
    "全集",
    "season pack",
    "box",
    "collection",
  ];
  const episodeNumbers = parseEpisodeNumbersFromTitle(title);

  return {
    episodeNumber: episodeNumbers[0],
    episodeNumbers,
    group: groupMatch?.[1],
    isBatch: episodeNumbers.length > 1 ||
      batchTerms.some((term) => lower.includes(term)),
    isSeaDex: /seadex|subsplease/i.test(title),
    quality,
    resolution,
  };
}

export function parseEpisodeFromTitle(title: string): number | undefined {
  return parseEpisodeNumbersFromTitle(title)[0];
}

export function parseEpisodeNumbersFromTitle(title: string): readonly number[] {
  const expandedRange = parseEpisodeRange(title);

  if (expandedRange.length > 0) {
    return expandedRange;
  }

  const stripped = title.replace(/\b\d{3,4}p\b/gi, "");

  const patterns = [
    /(?:^|[^a-z0-9])s\d{1,2}e(\d{1,3})(?:[^a-z0-9]|$)/i,
    /(?:^|[^a-z0-9])ep?(\d{1,3})(?:[^a-z0-9]|$)/i,
    /(?:^|[^a-z0-9])-(\d{1,3})(?:[^a-z0-9]|$)/,
    /(?:^|[^0-9])(\d{1,3})(?:[^0-9]|$)/,
  ];

  for (const pattern of patterns) {
    const match = stripped.match(pattern);
    if (!match) {
      continue;
    }

    const value = Number(match[1]);
    if (Number.isInteger(value) && value > 0 && value < 2000) {
      return [value];
    }
  }

  return [];
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

  const exact = QUALITY_DEFS.find((quality) =>
    quality.sourceKind === source && quality.resolution === resolution
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

  if (
    profile.min_size &&
    release.sizeBytes < parseSizeLabelToBytes(profile.min_size)
  ) {
    return { Reject: { reason: "size too small" } };
  }

  if (
    profile.max_size &&
    release.sizeBytes > parseSizeLabelToBytes(profile.max_size)
  ) {
    return { Reject: { reason: "size too big" } };
  }

  const score = calculateScore(release, rules, config);

  if (!current || !current.downloaded) {
    return {
      Accept: { quality: releaseQuality, is_seadex: release.isSeaDex, score },
    };
  }

  if (!profile.upgrade_allowed) {
    return { Reject: { reason: "upgrades disabled" } };
  }

  const currentFilePath = current.filePath ?? "";
  const currentHasQualityInfo = Boolean(parseResolution(currentFilePath)) ||
    hasSourceMarkers(currentFilePath);
  const currentQuality = currentHasQualityInfo
    ? parseQualityFromTitle(currentFilePath)
    : stripSourceKind(QUALITY_DEFS[QUALITY_DEFS.length - 1]);
  const currentScore = calculateScore(
    {
      group: parseReleaseName(currentFilePath).group,
      isSeaDex: current.isSeaDex ?? false,
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

  if (profile.seadex_preferred && release.isSeaDex && !current.isSeaDex) {
    return {
      Upgrade: {
        quality: releaseQuality,
        is_seadex: release.isSeaDex,
        score,
        reason: "SeaDex release available",
        old_file_path: current.filePath,
        old_quality: currentQuality,
        old_score: currentScore,
      },
    };
  }

  if (currentMeetsCutoff) {
    if (release.isSeaDex && !current.isSeaDex && profile.seadex_preferred) {
      return {
        Upgrade: {
          quality: releaseQuality,
          is_seadex: release.isSeaDex,
          score,
          reason: "SeaDex release available",
          old_file_path: current.filePath,
          old_quality: currentQuality,
          old_score: currentScore,
        },
      };
    }

    if (releaseQuality.rank < currentQuality.rank) {
      return {
        Upgrade: {
          quality: releaseQuality,
          is_seadex: release.isSeaDex,
          score,
          reason: "better quality available",
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
  return actionWeight(right.download_action) -
      actionWeight(left.download_action) ||
    right.seeders - left.seeders ||
    right.size - left.size;
}

function actionWeight(action: DownloadAction): number {
  if (action.Accept) return 3;
  if (action.Upgrade) return 2;
  return 1;
}

function calculateScore(
  release: RankedRelease,
  rules: readonly ReleaseProfileRule[],
  config: Config,
): number {
  const titleLower = release.title.toLowerCase();
  let score = 0;

  for (const rule of rules) {
    if (
      rule.rule_type === "preferred" &&
      titleLower.includes(rule.term.toLowerCase())
    ) {
      score += rule.score;
    }
  }

  if (
    release.group &&
    config.downloads.preferred_groups.some((group: string) =>
      group.toLowerCase() === release.group?.toLowerCase()
    )
  ) {
    score += 25;
  }

  if (release.trusted) score += 10;
  if (release.isSeaDex) score += 15;
  if (release.remake && config.nyaa.filter_remakes) score -= 30;

  const parsed = parseReleaseName(release.title);
  if (
    parsed.resolution && parsed.resolution === config.nyaa.preferred_resolution
  ) {
    score += 10;
  }

  score += Math.min(release.seeders, 50);

  return score;
}

function isQualityAllowed(profile: QualityProfile, quality: Quality): boolean {
  return profile.allowed_qualities.length === 0 ||
    profile.allowed_qualities.includes(quality.name) ||
    profile.allowed_qualities.includes(`${quality.resolution}p`) ||
    profile.allowed_qualities.includes(String(quality.resolution));
}

function cutoffQuality(label: string): Quality {
  const parsed = parseQualityFromTitle(label);
  if (parsed.id !== 99) {
    return parsed;
  }

  const resolution = parseResolution(label)
    ? Number(parseResolution(label)!.replace("p", ""))
    : 1080;
  const exact = QUALITY_DEFS.find((quality) =>
    quality.resolution === resolution && quality.sourceKind === "BluRay"
  );
  return stripSourceKind(exact ?? QUALITY_DEFS[5]);
}

const SOURCE_MARKERS = [
  "remux",
  "bluray",
  "blu-ray",
  "bdremux",
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

function inferSource(lower: string): QualitySource {
  if (lower.includes("remux")) return "BluRayRemux";
  if (
    lower.includes("bluray") || lower.includes("blu-ray") ||
    lower.includes("bdremux") || lower.includes("bdrip")
  ) return "BluRay";
  if (lower.includes("webrip")) return "WebRip";
  if (
    lower.includes("amzn") || lower.includes("amazon") ||
    lower.includes("cr") || lower.includes("crunchyroll") ||
    lower.includes("dsnp") || lower.includes("disney") ||
    lower.includes("nf") || lower.includes("netflix") ||
    lower.includes("hmax") || lower.includes("hulu") || lower.includes("web")
  ) return "WebDl";
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
  const multiplier = unit === "B"
    ? 1
    : unit === "KIB" || unit === "KB"
    ? 1024
    : unit === "MIB" || unit === "MB"
    ? 1024 ** 2
    : unit === "GIB" || unit === "GB"
    ? 1024 ** 3
    : 1024 ** 4;
  return Math.round(amount * multiplier);
}

function parseEpisodeRange(title: string): readonly number[] {
  const patterns = [
    /(?:^|[^0-9])(\d{1,3})\s*[-~]\s*(\d{1,3})(?:[^0-9]|$)/,
    /s\d{1,2}e(\d{1,3})\s*[-~]\s*e?(\d{1,3})(?:[^0-9]|$)/i,
    /episodes?\s*(\d{1,3})\s*[-~]\s*(\d{1,3})/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);

    if (!match) {
      continue;
    }

    const start = Number(match[1]);
    const end = Number(match[2]);

    if (
      !Number.isInteger(start) || !Number.isInteger(end) || start <= 0 ||
      end <= 0 || end < start
    ) {
      continue;
    }

    if (end - start > 500) {
      continue;
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  return [];
}

function stripSourceKind(
  quality: Quality & { readonly sourceKind?: QualitySource },
): Quality {
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

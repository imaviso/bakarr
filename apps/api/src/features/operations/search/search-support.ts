import type { NyaaSearchResult } from "@packages/shared/index.ts";

import type { ParsedRelease } from "@/features/operations/rss/rss-client-parse.ts";
import { parseReleaseSourceIdentity } from "@/infra/media/identity/identity.ts";
import { parseReleaseName } from "@/features/operations/search/release-ranking.ts";

export function mapSearchCategory(category: string | undefined, fallback: string) {
  switch (category) {
    case "all_anime":
      return "1_0";
    case "anime_english":
      return "1_2";
    case "anime_non_english":
      return "1_3";
    case "anime_raw":
      return "1_4";
    case "all_literature":
      return "3_0";
    case "literature_english":
      return "3_1";
    case "literature_non_english":
      return "3_2";
    case "literature_raw":
      return "3_3";
    default:
      return category !== undefined && /^\d+_\d+$/u.test(category) ? category : fallback;
  }
}

export function mapSearchCategoryForMediaKind(
  category: string | undefined,
  fallback: string,
  mediaKind: string | undefined,
) {
  const resolvedFallback =
    mediaKind === "anime" ? fallback : mapAnimeCategoryToLiterature(fallback);
  return mapSearchCategory(category, resolvedFallback);
}

function mapAnimeCategoryToLiterature(category: string) {
  switch (category) {
    case "1_0":
      return "3_0";
    case "1_2":
      return "3_1";
    case "1_3":
      return "3_2";
    case "1_4":
      return "3_3";
    default:
      return category;
  }
}

export function mapSearchFilter(filter: string | undefined, fallback: string) {
  switch (filter) {
    case "trusted_only":
      return "2";
    case "no_remakes":
      return "1";
    case "no_filter":
      return "0";
    default:
      return fallback;
  }
}

export function toNyaaSearchResult(item: ParsedRelease): NyaaSearchResult {
  const parsed = parseReleaseSourceIdentity(item.title);
  const parsedRelease = parseReleaseName(item.title);
  const identity = parsed.source_identity;
  let parsedEpisode: string | undefined;
  let parsedEpisodeNumbers: number[] | undefined;
  let parsedEpisodeLabel: string | undefined;
  let parsedAirDate: string | undefined;

  if (identity) {
    parsedEpisodeLabel = identity.label;
    if (identity.scheme === "daily") {
      [parsedAirDate] = identity.air_dates;
    } else {
      parsedEpisodeNumbers = [...identity.unit_numbers];
      parsedEpisode = identity.unit_numbers[0]?.toString();
    }
  }

  return {
    indexer: "Nyaa",
    info_hash: item.infoHash,
    is_seadex: item.isSeaDex,
    is_seadex_best: item.isSeaDexBest,
    leechers: item.leechers,
    magnet: item.magnet,
    parsed_unit: parsedEpisode,
    parsed_group: item.group,
    parsed_quality: parsedRelease.quality.name,
    parsed_resolution: item.resolution,
    parsed_unit_label: parsedEpisodeLabel,
    parsed_unit_numbers: parsedEpisodeNumbers,
    parsed_air_date: parsedAirDate,
    pub_date: item.pubDate,
    remake: item.remake,
    seadex_comparison: item.seaDexComparison,
    seadex_dual_audio: item.seaDexDualAudio,
    seadex_notes: item.seaDexNotes,
    seadex_release_group: item.seaDexReleaseGroup,
    seadex_tags: item.seaDexTags ? [...item.seaDexTags] : undefined,
    seeders: item.seeders,
    size: item.size,
    title: item.title,
    trusted: item.trusted,
    view_url: item.viewUrl,
  };
}

export function fallbackReleases(query: string, title?: string): ParsedRelease[] {
  const base = title || query || "Media";
  const infoHash = fallbackSearchInfoHash(base);
  return [
    {
      group: "SubsPlease",
      infoHash,
      isSeaDex: false,
      isSeaDexBest: false,
      leechers: 3,
      magnet: `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(base)}`,
      pubDate: "1970-01-01T00:00:00.000Z",
      remake: false,
      resolution: "1080p",
      seeders: 50,
      size: "1.4 GiB",
      sizeBytes: Math.round(1.4 * 1024 * 1024 * 1024),
      title: `[SubsPlease] ${base} - 01 (1080p)`,
      trusted: true,
      viewUrl: "https://nyaa.si",
    },
  ];
}

function fallbackSearchInfoHash(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) >>> 0;
  }

  const hex = hash.toString(16).padStart(8, "0");
  return hex.repeat(5).slice(0, 40);
}

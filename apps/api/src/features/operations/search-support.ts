import type { NyaaSearchResult } from "../../../../../packages/shared/src/index.ts";

import type { ParsedRelease } from "./rss-client.ts";
import { parseReleaseSourceIdentity } from "../../lib/media-identity.ts";
import { nowIso, randomHex } from "./job-support.ts";
import { parseReleaseName } from "./release-ranking.ts";

export function mapSearchCategory(
  category: string | undefined,
  fallback: string,
) {
  switch (category) {
    case "anime_english":
      return "1_2";
    case "anime_non_english":
      return "1_3";
    case "anime_raw":
      return "1_4";
    case "all_anime":
      return "1_0";
    default:
      return fallback;
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
      parsedAirDate = identity.air_dates[0];
    } else {
      parsedEpisodeNumbers = [...identity.episode_numbers];
      parsedEpisode = identity.episode_numbers[0]?.toString();
    }
  }

  return {
    indexer: "Nyaa",
    info_hash: item.infoHash,
    is_seadex: item.isSeaDex,
    is_seadex_best: item.isSeaDexBest,
    leechers: item.leechers,
    magnet: item.magnet,
    parsed_episode: parsedEpisode,
    parsed_group: item.group,
    parsed_quality: parsedRelease.quality.name,
    parsed_resolution: item.resolution,
    parsed_episode_label: parsedEpisodeLabel,
    parsed_episode_numbers: parsedEpisodeNumbers,
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

export function fallbackReleases(
  query: string,
  title?: string,
): ParsedRelease[] {
  const base = title || query || "Anime";
  return [
    {
      group: "SubsPlease",
      infoHash: randomHex(20),
      isSeaDex: false,
      isSeaDexBest: false,
      leechers: 3,
      magnet: `magnet:?xt=urn:btih:${randomHex(20)}&dn=${
        encodeURIComponent(base)
      }`,
      pubDate: nowIso(),
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

import type { NyaaSearchResult } from "../../../../../packages/shared/src/index.ts";

import type { ParsedRelease } from "./rss-client.ts";
import { parseEpisodeNumber } from "./library-import.ts";
import { nowIso, randomHex } from "./job-support.ts";

export function mapSearchCategory(category: string | undefined, fallback: string) {
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
  return {
    info_hash: item.infoHash,
    is_seadex: item.isSeaDex,
    is_seadex_best: item.isSeaDex,
    leechers: item.leechers,
    magnet: item.magnet,
    parsed_episode: parseEpisodeNumber(item.title)?.toString(),
    parsed_group: item.group,
    parsed_resolution: item.resolution,
    pub_date: item.pubDate,
    remake: item.remake,
    seeders: item.seeders,
    size: item.size,
    title: item.title,
    trusted: item.trusted,
    view_url: item.viewUrl,
  };
}

export function fallbackReleases(query: string, title?: string): ParsedRelease[] {
  const base = title || query || "Anime";
  return [
    {
      group: "SubsPlease",
      infoHash: randomHex(20),
      isSeaDex: true,
      leechers: 3,
      magnet: `magnet:?xt=urn:btih:${randomHex(20)}&dn=${encodeURIComponent(base)}`,
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

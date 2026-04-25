import type {
  Config,
  EpisodeSearchResult,
  QualityProfile,
  ReleaseProfileRule,
} from "@packages/shared/index.ts";
import { Option } from "effect";

import type { ParsedRelease } from "@/features/operations/rss-client-parse.ts";
import { parseReleaseSourceIdentity } from "@/infra/media/identity/identity.ts";
import { decideDownloadAction, parseReleaseName } from "@/features/operations/release-ranking.ts";

export function toEpisodeSearchResult(input: {
  currentEpisode: Option.Option<{
    downloaded: boolean;
    filePath?: string;
    isSeaDex?: boolean;
    isSeaDexBest?: boolean;
  }>;
  item: ParsedRelease;
  profile: QualityProfile;
  rules: readonly ReleaseProfileRule[];
  runtimeConfig: Config;
}) {
  const { currentEpisode, item, profile, rules, runtimeConfig } = input;
  const parsedIdentity = parseReleaseSourceIdentity(item.title).source_identity;

  return {
    download_action: decideDownloadAction(profile, rules, currentEpisode, item, runtimeConfig),
    group: item.group,
    indexer: "Nyaa",
    info_hash: item.infoHash,
    is_seadex: item.isSeaDex || undefined,
    is_seadex_best: item.isSeaDexBest || undefined,
    leechers: item.leechers,
    link: item.magnet,
    parsed_air_date: parsedIdentity?.scheme === "daily" ? parsedIdentity.air_dates[0] : undefined,
    parsed_episode_label: parsedIdentity?.label,
    parsed_episode_numbers:
      parsedIdentity && parsedIdentity.scheme !== "daily"
        ? [...parsedIdentity.episode_numbers]
        : undefined,
    parsed_resolution: item.resolution,
    publish_date: item.pubDate,
    quality: parseReleaseName(item.title).quality.name,
    remake: item.remake,
    seadex_comparison: item.seaDexComparison,
    seadex_dual_audio: item.seaDexDualAudio,
    seadex_notes: item.seaDexNotes,
    seadex_release_group: item.seaDexReleaseGroup,
    seadex_tags: item.seaDexTags ? [...item.seaDexTags] : undefined,
    seeders: item.seeders,
    size: item.sizeBytes,
    title: item.title,
    trusted: item.trusted,
    view_url: item.viewUrl,
  } satisfies EpisodeSearchResult;
}

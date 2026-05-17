import type {
  Config,
  UnitSearchResult,
  QualityProfile,
  ReleaseProfileRule,
} from "@packages/shared/index.ts";
import { Option } from "effect";

import type { ParsedRelease } from "@/features/operations/rss/rss-client-parse.ts";
import { parseReleaseSourceIdentity } from "@/infra/media/identity/identity.ts";
import {
  decideDownloadAction,
  parseReleaseName,
} from "@/features/operations/search/release-ranking.ts";

export function toUnitSearchResult(input: {
  currentUnit: Option.Option<{
    downloaded: boolean;
    filePath?: string;
    isSeaDex?: boolean;
    isSeaDexBest?: boolean;
  }>;
  item: ParsedRelease;
  profile: QualityProfile;
  rules: readonly ReleaseProfileRule[];
  runtimeConfig: Config;
  unitKind?: "episode" | "volume";
}) {
  const { currentUnit, item, profile, rules, runtimeConfig } = input;
  const parsedIdentity = parseReleaseSourceIdentity(item.title).source_identity;

  return {
    unit_kind: input.unitKind,
    download_action: decideDownloadAction(profile, rules, currentUnit, item, runtimeConfig, {
      allowUnknownQuality: input.unitKind === "volume",
    }),
    group: item.group,
    indexer: "Nyaa",
    info_hash: item.infoHash,
    is_seadex: item.isSeaDex || undefined,
    is_seadex_best: item.isSeaDexBest || undefined,
    leechers: item.leechers,
    link: item.magnet,
    parsed_air_date: parsedIdentity?.scheme === "daily" ? parsedIdentity.air_dates[0] : undefined,
    parsed_unit_label: parsedIdentity?.label,
    parsed_unit_numbers:
      parsedIdentity && parsedIdentity.scheme !== "daily"
        ? [...parsedIdentity.unit_numbers]
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
  } satisfies UnitSearchResult;
}

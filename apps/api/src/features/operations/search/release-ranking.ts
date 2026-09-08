import type {
  Config,
  QualityProfile,
  ReleaseProfileRule,
  UnitSearchResult,
} from "@packages/shared/index.ts";
import type { Option } from "effect";

import type { ParsedRelease } from "@/features/operations/rss/rss-client-parse.ts";
import { parseReleaseSourceIdentity } from "@/features/media/identity/identity.ts";

export type {
  ParsedReleaseName,
  RankedCurrentUnit,
  RankedRelease,
} from "@/features/operations/search/release-ranking-types.ts";
import {
  parseReleaseName,
  parseUnitFromTitle,
  parseUnitNumbersFromTitle,
} from "@/features/operations/search/release-ranking-parse.ts";
import {
  parseQualityFromTitle,
  parseResolution,
} from "@/features/operations/search/release-ranking-quality.ts";
import {
  compareUnitSearchResults,
  decideDownloadAction,
  validateQualityProfileSizeLabels,
} from "@/features/operations/search/release-ranking-policy.ts";

export function rankUnitReleases(input: {
  readonly releases: readonly ParsedRelease[];
  readonly currentUnit: Option.Option<{
    downloaded: boolean;
    filePath?: string;
    isSeaDex?: boolean;
    isSeaDexBest?: boolean;
  }>;
  readonly profile: QualityProfile;
  readonly rules: readonly ReleaseProfileRule[];
  readonly runtimeConfig: Config;
  readonly unitKind?: "episode" | "volume";
}): UnitSearchResult[] {
  return input.releases
    .map((item) =>
      toUnitSearchResult({
        currentUnit: input.currentUnit,
        item,
        profile: input.profile,
        rules: input.rules,
        runtimeConfig: input.runtimeConfig,
        ...(input.unitKind === undefined ? {} : { unitKind: input.unitKind }),
      }),
    )
    .toSorted(compareUnitSearchResults);
}

function toUnitSearchResult(input: {
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

export {
  compareUnitSearchResults,
  decideDownloadAction,
  parseQualityFromTitle,
  parseReleaseName,
  parseResolution,
  parseUnitFromTitle,
  parseUnitNumbersFromTitle,
  validateQualityProfileSizeLabels,
};

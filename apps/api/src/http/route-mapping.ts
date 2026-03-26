import type { Schema } from "effect";

import type { Config, QualityProfile } from "../../../../packages/shared/src/index.ts";
import type { AddAnimeInput } from "../features/anime/service.ts";
import {
  AddAnimeInputSchema,
  ConfigSchema,
  CreateReleaseProfileSchema,
  QualityProfileSchema,
  UpdateReleaseProfileSchema,
} from "./request-schemas.ts";

export function toAddAnimeInput(
  body: Schema.Schema.Type<typeof AddAnimeInputSchema>,
): AddAnimeInput {
  return {
    id: body.id,
    monitor_and_search: body.monitor_and_search,
    monitored: body.monitored,
    profile_name: body.profile_name,
    release_profile_ids: [...body.release_profile_ids],
    root_folder: body.root_folder,
    use_existing_root: body.use_existing_root,
  };
}

export function toQualityProfile(
  body: Schema.Schema.Type<typeof QualityProfileSchema>,
): QualityProfile {
  return structuredClone(body) as QualityProfile;
}

export function toCreateReleaseProfileInput(
  body: Schema.Schema.Type<typeof CreateReleaseProfileSchema>,
) {
  return {
    is_global: body.is_global,
    name: body.name,
    rules: body.rules.map((rule) => ({
      rule_type: rule.rule_type,
      score: rule.score,
      term: rule.term,
    })),
  };
}

export function toUpdateReleaseProfileInput(
  body: Schema.Schema.Type<typeof UpdateReleaseProfileSchema>,
) {
  return {
    enabled: body.enabled,
    is_global: body.is_global,
    name: body.name,
    rules: body.rules.map((rule) => ({
      rule_type: rule.rule_type,
      score: rule.score,
      term: rule.term,
    })),
  };
}

export function toConfig(body: Schema.Schema.Type<typeof ConfigSchema>): Config {
  return {
    downloads: {
      ...body.downloads,
      preferred_groups: [...body.downloads.preferred_groups],
      remote_path_mappings: body.downloads.remote_path_mappings.map((mapping) => [...mapping]),
    },
    general: { ...body.general },
    library: { ...body.library },
    nyaa: { ...body.nyaa },
    profiles: body.profiles.map(toQualityProfile),
    qbittorrent: { ...body.qbittorrent },
    scheduler: { ...body.scheduler },
  };
}

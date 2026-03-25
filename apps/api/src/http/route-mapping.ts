import type { Schema } from "effect";

import type { Config, QualityProfile } from "../../../../packages/shared/src/index.ts";
import { nowIso } from "../lib/clock.ts";
import type { AddAnimeInput } from "../features/anime/service.ts";
import {
  AddAnimeInputSchema,
  ConfigSchema,
  CreateReleaseProfileSchema,
  QualityProfileSchema,
  UpdateReleaseProfileSchema,
} from "./request-schemas.ts";

export { nowIso };

export function toAddAnimeInput(
  body: Schema.Schema.Type<typeof AddAnimeInputSchema>,
): AddAnimeInput {
  return {
    ...body,
    release_profile_ids: [...body.release_profile_ids],
    use_existing_root: body.use_existing_root,
  };
}

export function toQualityProfile(
  body: Schema.Schema.Type<typeof QualityProfileSchema>,
): QualityProfile {
  return {
    ...body,
    allowed_qualities: [...body.allowed_qualities],
  };
}

export function toCreateReleaseProfileInput(
  body: Schema.Schema.Type<typeof CreateReleaseProfileSchema>,
) {
  return {
    ...body,
    rules: body.rules.map((rule) => ({ ...rule })),
  };
}

export function toUpdateReleaseProfileInput(
  body: Schema.Schema.Type<typeof UpdateReleaseProfileSchema>,
) {
  return {
    ...body,
    rules: body.rules.map((rule) => ({ ...rule })),
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

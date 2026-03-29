import { Schema } from "effect";

import type { ParsedEpisodeIdentity as SharedParsedEpisodeIdentity } from "@packages/shared/index.ts";

const EpisodeNumberListSchema = Schema.Array(Schema.Number);
const AirDateListSchema = Schema.Array(Schema.String);

export class SeasonEpisodeIdentity extends Schema.Class<SeasonEpisodeIdentity>(
  "SeasonEpisodeIdentity",
)({
  episode_numbers: EpisodeNumberListSchema,
  label: Schema.String,
  scheme: Schema.Literal("season"),
  season: Schema.Number,
}) {}

export class AbsoluteEpisodeIdentity extends Schema.Class<AbsoluteEpisodeIdentity>(
  "AbsoluteEpisodeIdentity",
)({
  episode_numbers: EpisodeNumberListSchema,
  label: Schema.String,
  scheme: Schema.Literal("absolute"),
}) {}

export class DailyEpisodeIdentity extends Schema.Class<DailyEpisodeIdentity>(
  "DailyEpisodeIdentity",
)({
  air_dates: AirDateListSchema,
  label: Schema.String,
  scheme: Schema.Literal("daily"),
}) {}

export const ParsedEpisodeIdentitySchema = Schema.Union(
  SeasonEpisodeIdentity,
  AbsoluteEpisodeIdentity,
  DailyEpisodeIdentity,
);

export type ParsedEpisodeIdentity = Schema.Schema.Type<typeof ParsedEpisodeIdentitySchema>;

export function getEpisodeNumbersFromSourceIdentity(
  identity?: ParsedEpisodeIdentity | SharedParsedEpisodeIdentity,
): number[] {
  if (!identity || identity.scheme === "daily") {
    return [];
  }

  return [...(identity.episode_numbers ?? [])];
}

export function getSourceIdentityAirDate(
  identity?: ParsedEpisodeIdentity | SharedParsedEpisodeIdentity,
): string | undefined {
  if (!identity || identity.scheme !== "daily") {
    return undefined;
  }

  return identity.air_dates?.[0];
}

export function getSourceIdentitySeason(
  identity?: ParsedEpisodeIdentity | SharedParsedEpisodeIdentity,
): number | undefined {
  return identity?.scheme === "season" ? identity.season : undefined;
}

export function toSharedParsedEpisodeIdentity(
  identity?: ParsedEpisodeIdentity | SharedParsedEpisodeIdentity,
): SharedParsedEpisodeIdentity | undefined {
  if (!identity) {
    return undefined;
  }

  switch (identity.scheme) {
    case "season":
      return {
        episode_numbers: [...(identity.episode_numbers ?? [])],
        label: identity.label,
        scheme: "season",
        season: identity.season,
      };
    case "absolute":
      return {
        episode_numbers: [...(identity.episode_numbers ?? [])],
        label: identity.label,
        scheme: "absolute",
      };
    case "daily":
      return {
        air_dates: [...(identity.air_dates ?? [])],
        label: identity.label,
        scheme: "daily",
      };
  }
}

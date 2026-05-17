import { Schema } from "effect";

import type { ParsedUnitIdentity as SharedParsedEpisodeIdentity } from "@packages/shared/index.ts";

const EpisodeNumberListSchema = Schema.Array(Schema.Number);
const AirDateListSchema = Schema.Array(Schema.String);

export class SeasonEpisodeIdentity extends Schema.Class<SeasonEpisodeIdentity>(
  "SeasonEpisodeIdentity",
)({
  unit_numbers: EpisodeNumberListSchema,
  label: Schema.String,
  scheme: Schema.Literal("season"),
  season: Schema.Number,
}) {}

export class AbsoluteEpisodeIdentity extends Schema.Class<AbsoluteEpisodeIdentity>(
  "AbsoluteEpisodeIdentity",
)({
  unit_numbers: EpisodeNumberListSchema,
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

export const ParsedUnitIdentitySchema = Schema.Union(
  SeasonEpisodeIdentity,
  AbsoluteEpisodeIdentity,
  DailyEpisodeIdentity,
);

export type ParsedUnitIdentity = Schema.Schema.Type<typeof ParsedUnitIdentitySchema>;

export function getEpisodeNumbersFromSourceIdentity(
  identity?: ParsedUnitIdentity | SharedParsedEpisodeIdentity,
): number[] {
  if (!identity || identity.scheme === "daily") {
    return [];
  }

  return [...(identity.unit_numbers ?? [])];
}

export function getSourceIdentityAirDate(
  identity?: ParsedUnitIdentity | SharedParsedEpisodeIdentity,
): string | undefined {
  if (!identity || identity.scheme !== "daily") {
    return undefined;
  }

  return identity.air_dates?.[0];
}

export function getSourceIdentitySeason(
  identity?: ParsedUnitIdentity | SharedParsedEpisodeIdentity,
): number | undefined {
  return identity?.scheme === "season" ? identity.season : undefined;
}

export function toSharedParsedEpisodeIdentity(
  identity?: ParsedUnitIdentity | SharedParsedEpisodeIdentity,
): SharedParsedEpisodeIdentity | undefined {
  if (!identity) {
    return undefined;
  }

  switch (identity.scheme) {
    case "season":
      return {
        unit_numbers: [...(identity.unit_numbers ?? [])],
        label: identity.label,
        scheme: "season",
        season: identity.season,
      };
    case "absolute":
      return {
        unit_numbers: [...(identity.unit_numbers ?? [])],
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

  return undefined;
}

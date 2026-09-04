import { Schema, SchemaTransformation } from "effect";
import { getCurrentSeasonWindow } from "@/domain/seasonal-navigation";

export const DEFAULT_SEASON_WINDOW = getCurrentSeasonWindow();

const TabSchema = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Literals(["search", "seasonal"]),
    SchemaTransformation.transform({
      decode: (s) => (s === "seasonal" ? "seasonal" : "search"),
      encode: (s) => s,
    }),
  ),
);

const SeasonSchema = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Literals(["winter", "spring", "summer", "fall"]),
    SchemaTransformation.transform({
      decode: (s) => {
        if (s === "winter" || s === "spring" || s === "summer" || s === "fall") return s;
        return DEFAULT_SEASON_WINDOW.season;
      },
      encode: (s) => s,
    }),
  ),
);

const YearSchema = Schema.Union([Schema.String, Schema.Number]).pipe(
  Schema.decodeTo(
    Schema.Number,
    SchemaTransformation.transform({
      decode: (value) => {
        const n = typeof value === "number" ? value : Number(value);
        return Number.isInteger(n) ? n : DEFAULT_SEASON_WINDOW.year;
      },
      encode: (n) => n,
    }),
  ),
);

const IdSchema = Schema.Union([Schema.Number, Schema.NumberFromString]).pipe(
  Schema.check(Schema.isInt()),
);

const MediaKindSchema = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Literals(["anime", "manga", "light_novel"]),
    SchemaTransformation.transform({
      decode: (value) =>
        value === "manga" || value === "light_novel" || value === "anime" ? value : "anime",
      encode: (value) => value,
    }),
  ),
);

export const addAnimeSearchSchema = Schema.Struct({
  id: Schema.optionalKey(IdSchema),
  media_kind: Schema.optionalKey(MediaKindSchema),
  q: Schema.optionalKey(Schema.String),
  tab: Schema.optionalKey(TabSchema),
  season: Schema.optionalKey(SeasonSchema),
  year: Schema.optionalKey(YearSchema),
});

export type AddMediaSearch = Schema.Schema.Type<typeof addAnimeSearchSchema>;

export function parseAddMediaSearch(search: Record<string, unknown>) {
  return Schema.decodeUnknownSync(addAnimeSearchSchema)(search);
}

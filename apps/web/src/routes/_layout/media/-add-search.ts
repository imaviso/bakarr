import { Schema } from "effect";
import { getCurrentSeasonWindow } from "~/domain/seasonal-navigation";

export const DEFAULT_SEASON_WINDOW = getCurrentSeasonWindow();

const TabSchema = Schema.transform(Schema.String, Schema.Literal("search", "seasonal"), {
  decode: (s) => (s === "seasonal" ? "seasonal" : "search"),
  encode: (s) => s,
});

const SeasonSchema = Schema.transform(
  Schema.String,
  Schema.Literal("winter", "spring", "summer", "fall"),
  {
    decode: (s) => {
      if (s === "winter" || s === "spring" || s === "summer" || s === "fall") return s;
      return DEFAULT_SEASON_WINDOW.season;
    },
    encode: (s) => s,
  },
);

const YearSchema = Schema.transform(Schema.Union(Schema.String, Schema.Number), Schema.Number, {
  decode: (value) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isInteger(n) ? n : DEFAULT_SEASON_WINDOW.year;
  },
  encode: (n) => n,
});

const IdSchema = Schema.Union(Schema.Number, Schema.NumberFromString).pipe(Schema.int());

const MediaKindSchema = Schema.transform(
  Schema.String,
  Schema.Literal("anime", "manga", "light_novel"),
  {
    decode: (value) =>
      value === "manga" || value === "light_novel" || value === "anime" ? value : "anime",
    encode: (value) => value,
  },
);

export const addAnimeSearchSchema = Schema.Struct({
  id: Schema.optional(IdSchema),
  media_kind: Schema.optional(MediaKindSchema),
  q: Schema.optional(Schema.String),
  tab: Schema.optional(TabSchema),
  season: Schema.optional(SeasonSchema),
  year: Schema.optional(YearSchema),
});

export type AddMediaSearch = Schema.Schema.Type<typeof addAnimeSearchSchema>;

export function parseAddMediaSearch(search: Record<string, unknown>) {
  return Schema.decodeUnknownSync(addAnimeSearchSchema)(search);
}

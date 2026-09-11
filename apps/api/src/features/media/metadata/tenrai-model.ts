import { Schema, SchemaGetter } from "effect";

import type { MediaSeason } from "@packages/shared/index.ts";
import type {
  AnimeMetadata,
  ProviderMediaSearchResult,
} from "@/features/media/metadata/metadata-model.ts";

const TenraiTitleVariantSchema = Schema.Struct({
  title: Schema.String,
  type: Schema.optional(Schema.NullOr(Schema.String)),
});

const TenraiMalUrlSchema = Schema.Struct({
  mal_id: Schema.Number,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  type: Schema.optional(Schema.NullOr(Schema.String)),
  url: Schema.optional(Schema.NullOr(Schema.String)),
});

const TenraiRelationEntrySchema = Schema.Struct({
  mal_id: Schema.Number,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  type: Schema.optional(Schema.NullOr(Schema.String)),
  url: Schema.optional(Schema.NullOr(Schema.String)),
});

const TenraiRelationSchema = Schema.Struct({
  entry: Schema.Array(TenraiRelationEntrySchema),
  relation: Schema.optional(Schema.NullOr(Schema.String)),
});

const TenraiImageVariantSchema = Schema.Struct({
  image_url: Schema.optional(Schema.NullOr(Schema.String)),
  large_image_url: Schema.optional(Schema.NullOr(Schema.String)),
  small_image_url: Schema.optional(Schema.NullOr(Schema.String)),
});

const TenraiImagesSchema = Schema.Struct({
  jpg: Schema.optional(Schema.NullOr(TenraiImageVariantSchema)),
  webp: Schema.optional(Schema.NullOr(TenraiImageVariantSchema)),
});

const TenraiTrailerSchema = Schema.Struct({
  embed_url: Schema.optional(Schema.NullOr(Schema.String)),
  url: Schema.optional(Schema.NullOr(Schema.String)),
  youtube_id: Schema.optional(Schema.NullOr(Schema.String)),
});

const TenraiAiredSchema = Schema.Struct({
  from: Schema.optional(Schema.NullOr(Schema.String)),
  string: Schema.optional(Schema.NullOr(Schema.String)),
  to: Schema.optional(Schema.NullOr(Schema.String)),
});

const TenraiBroadcastSchema = Schema.Struct({
  day: Schema.optional(Schema.NullOr(Schema.String)),
  string: Schema.optional(Schema.NullOr(Schema.String)),
  time: Schema.optional(Schema.NullOr(Schema.String)),
  timezone: Schema.optional(Schema.NullOr(Schema.String)),
});

const TenraiRecommendationEntrySchema = Schema.Struct({
  entry: Schema.Struct({
    mal_id: Schema.Number,
    title: Schema.optional(Schema.NullOr(Schema.String)),
    url: Schema.optional(Schema.NullOr(Schema.String)),
  }),
});

const TenraiAnimeDetailBaseSchema = Schema.Struct({
  aired: Schema.optional(Schema.NullOr(TenraiAiredSchema)),
  airing: Schema.optional(Schema.NullOr(Schema.Boolean)),
  approved: Schema.optional(Schema.NullOr(Schema.Boolean)),
  background: Schema.optional(Schema.NullOr(Schema.String)),
  broadcast: Schema.optional(Schema.NullOr(TenraiBroadcastSchema)),
  demographics: Schema.optional(Schema.NullOr(Schema.Array(TenraiMalUrlSchema))),
  duration: Schema.optional(Schema.NullOr(Schema.String)),
  episodes: Schema.optional(Schema.NullOr(Schema.Number)),
  explicit_genres: Schema.optional(Schema.NullOr(Schema.Array(TenraiMalUrlSchema))),
  favorites: Schema.optional(Schema.NullOr(Schema.Number)),
  genres: Schema.optional(Schema.NullOr(Schema.Array(TenraiMalUrlSchema))),
  images: Schema.optional(Schema.NullOr(TenraiImagesSchema)),
  licensors: Schema.optional(Schema.NullOr(Schema.Array(TenraiMalUrlSchema))),
  mal_id: Schema.Number,
  members: Schema.optional(Schema.NullOr(Schema.Number)),
  popularity: Schema.optional(Schema.NullOr(Schema.Number)),
  producers: Schema.optional(Schema.NullOr(Schema.Array(TenraiMalUrlSchema))),
  rank: Schema.optional(Schema.NullOr(Schema.Number)),
  rating: Schema.optional(Schema.NullOr(Schema.String)),
  score: Schema.optional(Schema.NullOr(Schema.Number)),
  scored_by: Schema.optional(Schema.NullOr(Schema.Number)),
  season: Schema.optional(Schema.NullOr(Schema.String)),
  source: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.optional(Schema.NullOr(Schema.String)),
  studios: Schema.optional(Schema.NullOr(Schema.Array(TenraiMalUrlSchema))),
  synopsis: Schema.optional(Schema.NullOr(Schema.String)),
  themes: Schema.optional(Schema.NullOr(Schema.Array(TenraiMalUrlSchema))),
  title: Schema.optional(Schema.NullOr(Schema.String)),
  title_english: Schema.optional(Schema.NullOr(Schema.String)),
  title_japanese: Schema.optional(Schema.NullOr(Schema.String)),
  title_synonyms: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  titles: Schema.optional(Schema.NullOr(Schema.Array(TenraiTitleVariantSchema))),
  trailer: Schema.optional(Schema.NullOr(TenraiTrailerSchema)),
  type: Schema.optional(Schema.NullOr(Schema.String)),
  url: Schema.optional(Schema.NullOr(Schema.String)),
  year: Schema.optional(Schema.NullOr(Schema.Number)),
});

export const TenraiAnimeDetailFullSchema = Schema.Struct({
  ...TenraiAnimeDetailBaseSchema.fields,
  relations: Schema.optional(Schema.NullOr(Schema.Array(TenraiRelationSchema))),
});

export const TenraiAnimeDetailSchema = Schema.Struct({
  ...TenraiAnimeDetailBaseSchema.fields,
});

export const TenraiAnimeDetailFullPayloadSchema = Schema.Struct({
  data: TenraiAnimeDetailFullSchema,
});

export const TenraiAnimeDetailPayloadSchema = Schema.Struct({
  data: TenraiAnimeDetailSchema,
});

export const TenraiAnimeRecommendationsPayloadSchema = Schema.Struct({
  data: Schema.Array(TenraiRecommendationEntrySchema),
});

export const TenraiRelationTargetSchema = Schema.Struct({
  malId: Schema.Int,
  relation: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

export const TenraiRecommendationTargetSchema = Schema.Struct({
  malId: Schema.Int,
  title: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

const TenraiNormalizedNamedLinkSchema = Schema.Struct({
  malId: Schema.Int,
  name: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

const TenraiNormalizedImageVariantSchema = Schema.Struct({
  imageUrl: Schema.optional(Schema.String),
  largeImageUrl: Schema.optional(Schema.String),
  smallImageUrl: Schema.optional(Schema.String),
});

const TenraiNormalizedImagesSchema = Schema.Struct({
  jpg: Schema.optional(TenraiNormalizedImageVariantSchema),
  webp: Schema.optional(TenraiNormalizedImageVariantSchema),
});

const TenraiNormalizedTrailerSchema = Schema.Struct({
  embedUrl: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  youtubeId: Schema.optional(Schema.String),
});

const TenraiNormalizedBroadcastSchema = Schema.Struct({
  day: Schema.optional(Schema.String),
  raw: Schema.optional(Schema.String),
  time: Schema.optional(Schema.String),
  timezone: Schema.optional(Schema.String),
});

export const TenraiNormalizedAnimeSchema = Schema.Struct({
  airing: Schema.optional(Schema.Boolean),
  approved: Schema.optional(Schema.Boolean),
  background: Schema.optional(Schema.String),
  broadcast: TenraiNormalizedBroadcastSchema,
  demographics: Schema.Array(Schema.String),
  duration: Schema.optional(Schema.String),
  endDate: Schema.optional(Schema.String),
  endYear: Schema.optional(Schema.Number),
  unitCount: Schema.optional(Schema.Number),
  explicitGenres: Schema.Array(Schema.String),
  favorites: Schema.optional(Schema.Number),
  format: Schema.optional(Schema.String),
  genres: Schema.Array(Schema.String),
  images: TenraiNormalizedImagesSchema,
  licensors: Schema.Array(TenraiNormalizedNamedLinkSchema),
  malId: Schema.Int,
  members: Schema.optional(Schema.Number),
  popularity: Schema.optional(Schema.Number),
  producers: Schema.Array(TenraiNormalizedNamedLinkSchema),
  rank: Schema.optional(Schema.Number),
  rating: Schema.optional(Schema.String),
  recommendations: Schema.Array(TenraiRecommendationTargetSchema),
  relations: Schema.Array(TenraiRelationTargetSchema),
  score: Schema.optional(Schema.Number),
  scoredBy: Schema.optional(Schema.Number),
  season: Schema.optional(Schema.String),
  source: Schema.optional(Schema.String),
  startDate: Schema.optional(Schema.String),
  startYear: Schema.optional(Schema.Number),
  status: Schema.optional(Schema.String),
  studios: Schema.Array(Schema.String),
  synopsis: Schema.optional(Schema.String),
  themes: Schema.Array(Schema.String),
  title: Schema.Struct({
    english: Schema.optional(Schema.String),
    native: Schema.optional(Schema.String),
    romaji: Schema.optional(Schema.String),
  }),
  titleVariants: Schema.Array(Schema.String),
  trailer: TenraiNormalizedTrailerSchema,
  url: Schema.optional(Schema.String),
  year: Schema.optional(Schema.Number),
});

export type TenraiNormalizedAnime = Schema.Schema.Type<typeof TenraiNormalizedAnimeSchema>;

type TenraiRecommendationEntry = Schema.Schema.Type<typeof TenraiRecommendationEntrySchema>;

export function normalizeTenraiRecommendations(
  recommendations: ReadonlyArray<TenraiRecommendationEntry>,
) {
  const seen = new Set<number>();

  return recommendations.flatMap((recommendation) => {
    const malId = recommendation.entry.mal_id;

    if (seen.has(malId)) {
      return [];
    }

    seen.add(malId);

    return [
      {
        malId,
        title: recommendation.entry.title ?? undefined,
        url: recommendation.entry.url ?? undefined,
      },
    ];
  });
}

export const TenraiNormalizedAnimeFromFullSchema = TenraiAnimeDetailFullSchema.pipe(
  Schema.decodeTo(TenraiNormalizedAnimeSchema, {
    decode: SchemaGetter.transform((data) => normalizeTenraiAnime(data)),
    encode: SchemaGetter.transform((normalized) => ({
      aired: {
        from: normalized.startDate,
        string: undefined,
        to: normalized.endDate,
      },
      airing: normalized.airing,
      approved: normalized.approved,
      background: normalized.background,
      broadcast: {
        day: normalized.broadcast.day,
        string: normalized.broadcast.raw,
        time: normalized.broadcast.time,
        timezone: normalized.broadcast.timezone,
      },
      demographics: normalized.demographics.map((name) => ({ mal_id: 0, name })),
      duration: normalized.duration,
      mediaUnits: normalized.unitCount,
      explicit_genres: normalized.explicitGenres.map((name) => ({ mal_id: 0, name })),
      favorites: normalized.favorites,
      genres: normalized.genres.map((name) => ({ mal_id: 0, name })),
      images: {
        jpg: normalized.images.jpg
          ? {
              image_url: normalized.images.jpg.imageUrl,
              large_image_url: normalized.images.jpg.largeImageUrl,
              small_image_url: normalized.images.jpg.smallImageUrl,
            }
          : undefined,
        webp: normalized.images.webp
          ? {
              image_url: normalized.images.webp.imageUrl,
              large_image_url: normalized.images.webp.largeImageUrl,
              small_image_url: normalized.images.webp.smallImageUrl,
            }
          : undefined,
      },
      licensors: normalized.licensors.map((entry) => ({
        mal_id: entry.malId,
        name: entry.name,
        type: entry.type,
        url: entry.url,
      })),
      mal_id: normalized.malId,
      members: normalized.members,
      popularity: normalized.popularity,
      producers: normalized.producers.map((entry) => ({
        mal_id: entry.malId,
        name: entry.name,
        type: entry.type,
        url: entry.url,
      })),
      rank: normalized.rank,
      rating: normalized.rating,
      relations: normalized.relations.map((relation) => ({
        entry: [
          {
            mal_id: relation.malId,
            name: relation.title,
            type: "media",
            url: relation.url,
          },
        ],
        relation: relation.relation,
      })),
      score: normalized.score,
      scored_by: normalized.scoredBy,
      season: normalized.season,
      source: normalized.source,
      status: normalized.status,
      studios: normalized.studios.map((name) => ({ mal_id: 0, name })),
      synopsis: normalized.synopsis,
      themes: normalized.themes.map((name) => ({ mal_id: 0, name })),
      title: normalized.title.romaji,
      title_english: normalized.title.english,
      title_japanese: normalized.title.native,
      title_synonyms: normalized.titleVariants,
      titles: normalized.titleVariants.map((title) => ({ title, type: "Synonym" })),
      trailer: {
        embed_url: normalized.trailer.embedUrl,
        url: normalized.trailer.url,
        youtube_id: normalized.trailer.youtubeId,
      },
      type: normalized.format,
      url: normalized.url,
      year: normalized.year,
    })),
  }),
);

export const TenraiNormalizedAnimeFromDetailSchema = TenraiAnimeDetailSchema.pipe(
  Schema.decodeTo(TenraiNormalizedAnimeSchema, {
    decode: SchemaGetter.transform((data) => normalizeTenraiAnime(data)),
    encode: SchemaGetter.transform((normalized) => ({
      aired: {
        from: normalized.startDate,
        string: undefined,
        to: normalized.endDate,
      },
      airing: normalized.airing,
      approved: normalized.approved,
      background: normalized.background,
      broadcast: {
        day: normalized.broadcast.day,
        string: normalized.broadcast.raw,
        time: normalized.broadcast.time,
        timezone: normalized.broadcast.timezone,
      },
      demographics: normalized.demographics.map((name) => ({ mal_id: 0, name })),
      duration: normalized.duration,
      mediaUnits: normalized.unitCount,
      explicit_genres: normalized.explicitGenres.map((name) => ({ mal_id: 0, name })),
      favorites: normalized.favorites,
      genres: normalized.genres.map((name) => ({ mal_id: 0, name })),
      images: {
        jpg: normalized.images.jpg
          ? {
              image_url: normalized.images.jpg.imageUrl,
              large_image_url: normalized.images.jpg.largeImageUrl,
              small_image_url: normalized.images.jpg.smallImageUrl,
            }
          : undefined,
        webp: normalized.images.webp
          ? {
              image_url: normalized.images.webp.imageUrl,
              large_image_url: normalized.images.webp.largeImageUrl,
              small_image_url: normalized.images.webp.smallImageUrl,
            }
          : undefined,
      },
      licensors: normalized.licensors.map((entry) => ({
        mal_id: entry.malId,
        name: entry.name,
        type: entry.type,
        url: entry.url,
      })),
      mal_id: normalized.malId,
      members: normalized.members,
      popularity: normalized.popularity,
      producers: normalized.producers.map((entry) => ({
        mal_id: entry.malId,
        name: entry.name,
        type: entry.type,
        url: entry.url,
      })),
      rank: normalized.rank,
      rating: normalized.rating,
      score: normalized.score,
      scored_by: normalized.scoredBy,
      season: normalized.season,
      source: normalized.source,
      status: normalized.status,
      studios: normalized.studios.map((name) => ({ mal_id: 0, name })),
      synopsis: normalized.synopsis,
      themes: normalized.themes.map((name) => ({ mal_id: 0, name })),
      title: normalized.title.romaji,
      title_english: normalized.title.english,
      title_japanese: normalized.title.native,
      title_synonyms: normalized.titleVariants,
      titles: normalized.titleVariants.map((title) => ({ title, type: "Synonym" })),
      trailer: {
        embed_url: normalized.trailer.embedUrl,
        url: normalized.trailer.url,
        youtube_id: normalized.trailer.youtubeId,
      },
      type: normalized.format,
      url: normalized.url,
      year: normalized.year,
    })),
  }),
);

type TenraiAnimeInput =
  | Schema.Schema.Type<typeof TenraiAnimeDetailSchema>
  | Schema.Schema.Type<typeof TenraiAnimeDetailFullSchema>;

function normalizeUnitCountForFormat(
  format: string | null | undefined,
  episodes: number | null | undefined,
): number | undefined {
  if (format === "Movie") return 1;
  return episodes ?? undefined;
}

// Tenrai returns 0 for unknown score fields; treat as missing so merges and
// scaling do not turn "unknown" into a real 0/1 score.
function normalizeScore(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined || value <= 0) {
    return undefined;
  }

  return value;
}

function normalizeCount(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined || value <= 0) {
    return undefined;
  }

  return value;
}

function normalizeTenraiAnime(data: TenraiAnimeInput): TenraiNormalizedAnime {
  const relations = Schema.is(TenraiAnimeDetailFullSchema)(data) ? data.relations : undefined;
  const genreNames = normalizeEntryNames(data.genres);
  const explicitGenres = normalizeEntryNames(data.explicit_genres);
  const themes = normalizeEntryNames(data.themes);
  const demographics = normalizeEntryNames(data.demographics);

  return {
    airing: data.airing ?? undefined,
    approved: data.approved ?? undefined,
    background: data.background ?? undefined,
    broadcast: {
      day: data.broadcast?.day ?? undefined,
      raw: data.broadcast?.string ?? undefined,
      time: data.broadcast?.time ?? undefined,
      timezone: data.broadcast?.timezone ?? undefined,
    },
    demographics,
    duration: data.duration ?? undefined,
    endDate: toIsoDate(data.aired?.to),
    endYear: toIsoYear(data.aired?.to),
    unitCount: normalizeUnitCountForFormat(data.type, data.episodes),
    explicitGenres,
    favorites: data.favorites ?? undefined,
    format: data.type ?? undefined,
    genres: dedupeStrings([...genreNames, ...explicitGenres, ...themes, ...demographics]),
    images: {
      jpg: toNormalizedImageVariant(data.images?.jpg),
      webp: toNormalizedImageVariant(data.images?.webp),
    },
    licensors: normalizeLinks(data.licensors),
    malId: data.mal_id,
    members: data.members ?? undefined,
    popularity: data.popularity ?? undefined,
    producers: normalizeLinks(data.producers),
    rank: data.rank ?? undefined,
    rating: data.rating ?? undefined,
    recommendations: [],
    relations: normalizeRelations(relations),
    score: normalizeScore(data.score),
    scoredBy: normalizeCount(data.scored_by),
    season: data.season ?? undefined,
    source: data.source ?? undefined,
    startDate: toIsoDate(data.aired?.from),
    startYear: data.year ?? toIsoYear(data.aired?.from),
    status: data.status ?? undefined,
    studios: normalizeEntryNames(data.studios),
    synopsis: data.synopsis ?? undefined,
    themes,
    title: {
      english: data.title_english ?? undefined,
      native: data.title_japanese ?? undefined,
      romaji: data.title ?? undefined,
    },
    titleVariants: normalizeTitleVariants(data),
    trailer: {
      embedUrl: data.trailer?.embed_url ?? undefined,
      url: data.trailer?.url ?? undefined,
      youtubeId: data.trailer?.youtube_id ?? undefined,
    },
    url: data.url ?? undefined,
    year: data.year ?? undefined,
  };
}

function normalizeLinks(
  entries: ReadonlyArray<Schema.Schema.Type<typeof TenraiMalUrlSchema>> | null | undefined,
) {
  const seen = new Set<number>();

  return (entries ?? []).flatMap((entry) => {
    const malId = Math.trunc(entry.mal_id);

    if (seen.has(malId)) {
      return [];
    }

    seen.add(malId);

    return [
      {
        malId,
        name: entry.name ?? undefined,
        type: entry.type ?? undefined,
        url: entry.url ?? undefined,
      },
    ];
  });
}

function normalizeEntryNames(
  entries: ReadonlyArray<Schema.Schema.Type<typeof TenraiMalUrlSchema>> | null | undefined,
) {
  return dedupeStrings((entries ?? []).flatMap((entry) => (entry.name ? [entry.name] : [])));
}

function normalizeRelations(
  relations:
    | ReadonlyArray<{
        readonly entry: ReadonlyArray<{
          readonly mal_id: number;
          readonly name?: string | null | undefined;
          readonly type?: string | null | undefined;
          readonly url?: string | null | undefined;
        }>;
        readonly relation?: string | null | undefined;
      }>
    | null
    | undefined,
) {
  if (!Array.isArray(relations) || relations.length === 0) {
    return [];
  }

  const entries: Array<{ malId: number; relation?: string; title?: string; url?: string }> =
    relations.flatMap((relation) =>
      relation.entry.flatMap((entry: (typeof relation.entry)[number]) => {
        // Tenrai v4 relation entries are typed "anime" | "manga"; only anime
        // relations are relevant to this library.
        if (entry.type !== "anime") {
          return [];
        }

        return [
          {
            malId: entry.mal_id,
            relation: relation.relation ?? undefined,
            title: entry.name ?? undefined,
            url: entry.url ?? undefined,
          },
        ];
      }),
    );

  const seen = new Set<number>();

  return entries.flatMap((entry) => {
    if (seen.has(entry.malId)) {
      return [];
    }

    seen.add(entry.malId);
    return [entry];
  });
}

function normalizeTitleVariants(data: TenraiAnimeInput) {
  return dedupeStrings([
    ...(data.title_synonyms ?? []),
    ...(Array.isArray(data.titles) ? data.titles.map((entry) => entry.title) : []),
    ...(data.title ? [data.title] : []),
    ...(data.title_english ? [data.title_english] : []),
    ...(data.title_japanese ? [data.title_japanese] : []),
  ]);
}

function dedupeStrings(values: ReadonlyArray<string>) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function toNormalizedImageVariant(
  input: Schema.Schema.Type<typeof TenraiImageVariantSchema> | null | undefined,
) {
  if (!input) {
    return undefined;
  }

  return {
    imageUrl: input.image_url ?? undefined,
    largeImageUrl: input.large_image_url ?? undefined,
    smallImageUrl: input.small_image_url ?? undefined,
  };
}

function toIsoDate(input: string | null | undefined) {
  if (!input) {
    return undefined;
  }

  const datePart = input.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : undefined;
}

function toIsoYear(input: string | null | undefined) {
  const date = toIsoDate(input);

  return date ? globalThis.Number.parseInt(date.slice(0, 4), 10) : undefined;
}

// Tenrai-primary converters: AniList down must not block search, detail, or
// seasonal. MAL IDs are canonical in Tenrai-served payloads; AniList
// enrichment merges over them when upstream is alive.

export function mapTenraiStatusToAniListStatus(status: string | undefined): string {
  switch (status) {
    case "Finished Airing":
      return "FINISHED";
    case "Currently Airing":
      return "RELEASING";
    case "Not yet aired":
      return "NOT_YET_RELEASED";
    default:
      return "UNKNOWN";
  }
}

export function mapTenraiFormatToAniListFormat(format: string | undefined): string {
  if (!format) {
    return "TV";
  }

  const upper = format.toUpperCase();
  return upper.length > 0 ? upper : "TV";
}

export function scaleTenraiScoreToAniList(tenraiScore?: number) {
  if (tenraiScore === undefined) {
    return undefined;
  }

  const scaled = Math.round(tenraiScore * 10);
  return clampInteger(scaled, 1, 100);
}

export function tenraiAnimeToMetadata(normalized: TenraiNormalizedAnime): AnimeMetadata {
  const coverImage =
    normalized.images.webp?.largeImageUrl ??
    normalized.images.webp?.imageUrl ??
    normalized.images.jpg?.largeImageUrl ??
    normalized.images.jpg?.imageUrl;
  const romaji =
    normalized.title.romaji ??
    normalized.title.english ??
    normalized.title.native ??
    `MAL ${normalized.malId}`;

  return {
    coverImage: coverImage ?? undefined,
    description: normalized.synopsis ?? normalized.background ?? undefined,
    duration: normalized.duration ?? undefined,
    endDate: normalized.endDate ?? undefined,
    endYear: normalized.endYear ?? undefined,
    favorites: normalized.favorites ?? undefined,
    format: mapTenraiFormatToAniListFormat(normalized.format),
    genres: normalized.genres.length > 0 ? [...normalized.genres] : undefined,
    id: normalized.malId,
    malId: normalized.malId,
    members: normalized.members ?? undefined,
    popularity: normalized.popularity ?? undefined,
    rank: normalized.rank ?? undefined,
    score: scaleTenraiScoreToAniList(normalized.score),
    source: normalized.source ?? undefined,
    startDate: normalized.startDate ?? undefined,
    startYear: normalized.startYear ?? undefined,
    status: mapTenraiStatusToAniListStatus(normalized.status),
    studios: normalized.studios.length > 0 ? [...normalized.studios] : undefined,
    synonyms: normalized.titleVariants.length > 0 ? [...normalized.titleVariants] : undefined,
    title: {
      english: normalized.title.english ?? undefined,
      native: normalized.title.native ?? undefined,
      romaji,
    },
    unitCount: normalized.unitCount ?? undefined,
  };
}

export function tenraiSeasonalEntryToSearchResult(
  entry: TenraiNormalizedSeasonalEntry,
  fallback?: { season?: MediaSeason | undefined; year?: number | undefined },
): ProviderMediaSearchResult {
  const season = toAnimeSeason(entry.season) ?? fallback?.season;
  const seasonYear = entry.seasonYear ?? fallback?.year;

  return {
    already_in_library: false,
    cover_image: entry.coverImage ?? undefined,
    unit_count: entry.unitCount ?? undefined,
    format: mapTenraiFormatToAniListFormat(entry.format),
    genres: entry.genres ? [...entry.genres] : undefined,
    id: entry.malId,
    id_space: "mal",
    media_kind: "anime",
    season,
    season_year: seasonYear,
    start_year: entry.startYear ?? seasonYear,
    status: mapTenraiStatusToAniListStatus(entry.status),
    title: {
      english: entry.title.english ?? undefined,
      native: entry.title.native ?? undefined,
      romaji: entry.title.romaji ?? undefined,
    },
  };
}

function toAnimeSeason(value: string | undefined): MediaSeason | undefined {
  if (value === undefined) {
    return undefined;
  }

  const lower = value.toLowerCase();

  if (lower === "winter" || lower === "spring" || lower === "summer" || lower === "fall") {
    return lower;
  }

  return undefined;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// Seasonal support

export const TenraiSeasonalPayloadSchema = Schema.Struct({
  data: Schema.Array(TenraiAnimeDetailBaseSchema),
  pagination: Schema.optional(
    Schema.Struct({
      has_next_page: Schema.optional(Schema.NullOr(Schema.Boolean)),
      last_visible_page: Schema.optional(Schema.NullOr(Schema.Number)),
    }),
  ),
});

export const TenraiNormalizedSeasonalEntrySchema = Schema.Struct({
  malId: Schema.Int,
  title: Schema.Struct({
    english: Schema.optional(Schema.String),
    native: Schema.optional(Schema.String),
    romaji: Schema.optional(Schema.String),
  }),
  format: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  season: Schema.optional(Schema.String),
  seasonYear: Schema.optional(Schema.Number),
  startYear: Schema.optional(Schema.Number),
  coverImage: Schema.optional(Schema.String),
  genres: Schema.optional(Schema.Array(Schema.String)),
  unitCount: Schema.optional(Schema.Number),
});

export type TenraiNormalizedSeasonalEntry = Schema.Schema.Type<
  typeof TenraiNormalizedSeasonalEntrySchema
>;

export const TenraiSeasonalEntryFromDetailSchema = TenraiAnimeDetailBaseSchema.pipe(
  Schema.decodeTo(TenraiNormalizedSeasonalEntrySchema, {
    decode: SchemaGetter.transform((data) => normalizeTenraiSeasonalEntry(data)),
    encode: SchemaGetter.transform((entry) => ({
      aired: entry.seasonYear
        ? { from: `${entry.seasonYear}-01-01`, string: undefined, to: undefined }
        : undefined,
      airing: undefined,
      approved: undefined,
      background: undefined,
      broadcast: undefined,
      demographics: undefined,
      duration: undefined,
      mediaUnits: entry.unitCount,
      explicit_genres: undefined,
      favorites: undefined,
      genres: entry.genres?.map((name) => ({ mal_id: 0, name })),
      images: entry.coverImage
        ? {
            jpg: { image_url: entry.coverImage },
            webp: undefined,
          }
        : undefined,
      licensors: undefined,
      mal_id: entry.malId,
      members: undefined,
      popularity: undefined,
      producers: undefined,
      rank: undefined,
      rating: undefined,
      score: undefined,
      scored_by: undefined,
      season: entry.season,
      source: undefined,
      status: entry.status,
      studios: undefined,
      synopsis: undefined,
      themes: undefined,
      title: entry.title.romaji,
      title_english: entry.title.english,
      title_japanese: entry.title.native,
      title_synonyms: undefined,
      titles: undefined,
      trailer: undefined,
      type: entry.format,
      url: undefined,
      year: entry.seasonYear ?? entry.startYear,
    })),
  }),
);

function normalizeTenraiSeasonalEntry(
  data: Schema.Schema.Type<typeof TenraiAnimeDetailBaseSchema>,
): TenraiNormalizedSeasonalEntry {
  return {
    coverImage: data.images?.jpg?.image_url ?? data.images?.webp?.image_url ?? undefined,
    unitCount: normalizeUnitCountForFormat(data.type, data.episodes),
    format: data.type ?? undefined,
    genres: normalizeEntryNames(data.genres),
    malId: data.mal_id,
    season: data.season ?? undefined,
    seasonYear: data.year ?? undefined,
    startYear: data.year ?? toIsoYear(data.aired?.from) ?? undefined,
    status: data.status ?? undefined,
    title: {
      english: data.title_english ?? undefined,
      native: data.title_japanese ?? undefined,
      romaji: data.title ?? undefined,
    },
  };
}

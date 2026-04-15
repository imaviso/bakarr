import { Schema } from "effect";

const JikanTitleVariantSchema = Schema.Struct({
  title: Schema.String,
  type: Schema.optional(Schema.NullOr(Schema.String)),
});

const JikanMalUrlSchema = Schema.Struct({
  mal_id: Schema.Number,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  type: Schema.optional(Schema.NullOr(Schema.String)),
  url: Schema.optional(Schema.NullOr(Schema.String)),
});

const JikanRelationEntrySchema = Schema.Struct({
  mal_id: Schema.Number,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  type: Schema.optional(Schema.NullOr(Schema.String)),
  url: Schema.optional(Schema.NullOr(Schema.String)),
});

const JikanRelationSchema = Schema.Struct({
  entry: Schema.Array(JikanRelationEntrySchema),
  relation: Schema.optional(Schema.NullOr(Schema.String)),
});

const JikanImageVariantSchema = Schema.Struct({
  image_url: Schema.optional(Schema.NullOr(Schema.String)),
  large_image_url: Schema.optional(Schema.NullOr(Schema.String)),
  small_image_url: Schema.optional(Schema.NullOr(Schema.String)),
});

const JikanImagesSchema = Schema.Struct({
  jpg: Schema.optional(Schema.NullOr(JikanImageVariantSchema)),
  webp: Schema.optional(Schema.NullOr(JikanImageVariantSchema)),
});

const JikanTrailerSchema = Schema.Struct({
  embed_url: Schema.optional(Schema.NullOr(Schema.String)),
  url: Schema.optional(Schema.NullOr(Schema.String)),
  youtube_id: Schema.optional(Schema.NullOr(Schema.String)),
});

const JikanAiredSchema = Schema.Struct({
  from: Schema.optional(Schema.NullOr(Schema.String)),
  string: Schema.optional(Schema.NullOr(Schema.String)),
  to: Schema.optional(Schema.NullOr(Schema.String)),
});

const JikanBroadcastSchema = Schema.Struct({
  day: Schema.optional(Schema.NullOr(Schema.String)),
  string: Schema.optional(Schema.NullOr(Schema.String)),
  time: Schema.optional(Schema.NullOr(Schema.String)),
  timezone: Schema.optional(Schema.NullOr(Schema.String)),
});

const JikanRecommendationEntrySchema = Schema.Struct({
  entry: Schema.Struct({
    mal_id: Schema.Number,
    title: Schema.optional(Schema.NullOr(Schema.String)),
    url: Schema.optional(Schema.NullOr(Schema.String)),
  }),
});

const JikanAnimeDetailBaseSchema = Schema.Struct({
  aired: Schema.optional(Schema.NullOr(JikanAiredSchema)),
  airing: Schema.optional(Schema.NullOr(Schema.Boolean)),
  approved: Schema.optional(Schema.NullOr(Schema.Boolean)),
  background: Schema.optional(Schema.NullOr(Schema.String)),
  broadcast: Schema.optional(Schema.NullOr(JikanBroadcastSchema)),
  demographics: Schema.optional(Schema.NullOr(Schema.Array(JikanMalUrlSchema))),
  duration: Schema.optional(Schema.NullOr(Schema.String)),
  episodes: Schema.optional(Schema.NullOr(Schema.Number)),
  explicit_genres: Schema.optional(Schema.NullOr(Schema.Array(JikanMalUrlSchema))),
  favorites: Schema.optional(Schema.NullOr(Schema.Number)),
  genres: Schema.optional(Schema.NullOr(Schema.Array(JikanMalUrlSchema))),
  images: Schema.optional(Schema.NullOr(JikanImagesSchema)),
  licensors: Schema.optional(Schema.NullOr(Schema.Array(JikanMalUrlSchema))),
  mal_id: Schema.Number,
  members: Schema.optional(Schema.NullOr(Schema.Number)),
  popularity: Schema.optional(Schema.NullOr(Schema.Number)),
  producers: Schema.optional(Schema.NullOr(Schema.Array(JikanMalUrlSchema))),
  rank: Schema.optional(Schema.NullOr(Schema.Number)),
  rating: Schema.optional(Schema.NullOr(Schema.String)),
  score: Schema.optional(Schema.NullOr(Schema.Number)),
  scored_by: Schema.optional(Schema.NullOr(Schema.Number)),
  season: Schema.optional(Schema.NullOr(Schema.String)),
  source: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.optional(Schema.NullOr(Schema.String)),
  studios: Schema.optional(Schema.NullOr(Schema.Array(JikanMalUrlSchema))),
  synopsis: Schema.optional(Schema.NullOr(Schema.String)),
  themes: Schema.optional(Schema.NullOr(Schema.Array(JikanMalUrlSchema))),
  title: Schema.optional(Schema.NullOr(Schema.String)),
  title_english: Schema.optional(Schema.NullOr(Schema.String)),
  title_japanese: Schema.optional(Schema.NullOr(Schema.String)),
  title_synonyms: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  titles: Schema.optional(Schema.NullOr(Schema.Array(JikanTitleVariantSchema))),
  trailer: Schema.optional(Schema.NullOr(JikanTrailerSchema)),
  type: Schema.optional(Schema.NullOr(Schema.String)),
  url: Schema.optional(Schema.NullOr(Schema.String)),
  year: Schema.optional(Schema.NullOr(Schema.Number)),
});

export const JikanAnimeDetailFullSchema = Schema.Struct({
  ...JikanAnimeDetailBaseSchema.fields,
  relations: Schema.optional(Schema.NullOr(Schema.Array(JikanRelationSchema))),
});

export const JikanAnimeDetailSchema = Schema.Struct({
  ...JikanAnimeDetailBaseSchema.fields,
});

export const JikanAnimeDetailFullPayloadSchema = Schema.Struct({
  data: JikanAnimeDetailFullSchema,
});

export const JikanAnimeDetailPayloadSchema = Schema.Struct({
  data: JikanAnimeDetailSchema,
});

export const JikanAnimeRecommendationsPayloadSchema = Schema.Struct({
  data: Schema.Array(JikanRecommendationEntrySchema),
});

export const JikanRelationTargetSchema = Schema.Struct({
  malId: Schema.Int,
  relation: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

export const JikanRecommendationTargetSchema = Schema.Struct({
  malId: Schema.Int,
  title: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

const JikanNormalizedNamedLinkSchema = Schema.Struct({
  malId: Schema.Int,
  name: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

const JikanNormalizedImageVariantSchema = Schema.Struct({
  imageUrl: Schema.optional(Schema.String),
  largeImageUrl: Schema.optional(Schema.String),
  smallImageUrl: Schema.optional(Schema.String),
});

const JikanNormalizedImagesSchema = Schema.Struct({
  jpg: Schema.optional(JikanNormalizedImageVariantSchema),
  webp: Schema.optional(JikanNormalizedImageVariantSchema),
});

const JikanNormalizedTrailerSchema = Schema.Struct({
  embedUrl: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  youtubeId: Schema.optional(Schema.String),
});

const JikanNormalizedBroadcastSchema = Schema.Struct({
  day: Schema.optional(Schema.String),
  raw: Schema.optional(Schema.String),
  time: Schema.optional(Schema.String),
  timezone: Schema.optional(Schema.String),
});

export const JikanNormalizedAnimeSchema = Schema.Struct({
  airing: Schema.optional(Schema.Boolean),
  approved: Schema.optional(Schema.Boolean),
  background: Schema.optional(Schema.String),
  broadcast: JikanNormalizedBroadcastSchema,
  demographics: Schema.Array(Schema.String),
  duration: Schema.optional(Schema.String),
  endDate: Schema.optional(Schema.String),
  endYear: Schema.optional(Schema.Number),
  episodeCount: Schema.optional(Schema.Number),
  explicitGenres: Schema.Array(Schema.String),
  favorites: Schema.optional(Schema.Number),
  format: Schema.optional(Schema.String),
  genres: Schema.Array(Schema.String),
  images: JikanNormalizedImagesSchema,
  licensors: Schema.Array(JikanNormalizedNamedLinkSchema),
  malId: Schema.Int,
  members: Schema.optional(Schema.Number),
  popularity: Schema.optional(Schema.Number),
  producers: Schema.Array(JikanNormalizedNamedLinkSchema),
  rank: Schema.optional(Schema.Number),
  rating: Schema.optional(Schema.String),
  recommendations: Schema.Array(JikanRecommendationTargetSchema),
  relations: Schema.Array(JikanRelationTargetSchema),
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
  trailer: JikanNormalizedTrailerSchema,
  url: Schema.optional(Schema.String),
  year: Schema.optional(Schema.Number),
});

export type JikanNormalizedAnime = Schema.Schema.Type<typeof JikanNormalizedAnimeSchema>;

type JikanRecommendationEntry = Schema.Schema.Type<typeof JikanRecommendationEntrySchema>;

export function normalizeJikanRecommendations(
  recommendations: ReadonlyArray<JikanRecommendationEntry>,
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

export const JikanNormalizedAnimeFromFullSchema = Schema.transform(
  JikanAnimeDetailFullSchema,
  JikanNormalizedAnimeSchema,
  {
    decode: (data) => normalizeJikanAnime(data),
    encode: (normalized) => ({
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
      episodes: normalized.episodeCount,
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
            type: "anime",
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
    }),
  },
);

export const JikanNormalizedAnimeFromDetailSchema = Schema.transform(
  JikanAnimeDetailSchema,
  JikanNormalizedAnimeSchema,
  {
    decode: (data) => normalizeJikanAnime(data),
    encode: (normalized) => ({
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
      episodes: normalized.episodeCount,
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
    }),
  },
);

type JikanAnimeInput =
  | Schema.Schema.Type<typeof JikanAnimeDetailSchema>
  | Schema.Schema.Type<typeof JikanAnimeDetailFullSchema>;

function normalizeJikanAnime(data: JikanAnimeInput): JikanNormalizedAnime {
  const relations = "relations" in data ? data.relations : undefined;
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
    episodeCount: data.episodes ?? undefined,
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
    score: data.score ?? undefined,
    scoredBy: data.scored_by ?? undefined,
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
  entries: ReadonlyArray<Schema.Schema.Type<typeof JikanMalUrlSchema>> | null | undefined,
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
  entries: ReadonlyArray<Schema.Schema.Type<typeof JikanMalUrlSchema>> | null | undefined,
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

function normalizeTitleVariants(data: JikanAnimeInput) {
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
  input: Schema.Schema.Type<typeof JikanImageVariantSchema> | null | undefined,
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

  return date ? Number.parseInt(date.slice(0, 4), 10) : undefined;
}

// Seasonal support

export const JikanSeasonalPayloadSchema = Schema.Struct({
  data: Schema.Array(JikanAnimeDetailBaseSchema),
  pagination: Schema.optional(
    Schema.Struct({
      has_next_page: Schema.optional(Schema.NullOr(Schema.Boolean)),
      last_visible_page: Schema.optional(Schema.NullOr(Schema.Number)),
    }),
  ),
});

export const JikanNormalizedSeasonalEntrySchema = Schema.Struct({
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
  episodeCount: Schema.optional(Schema.Number),
});

export type JikanNormalizedSeasonalEntry = Schema.Schema.Type<
  typeof JikanNormalizedSeasonalEntrySchema
>;

export const JikanSeasonalEntryFromDetailSchema = Schema.transform(
  JikanAnimeDetailBaseSchema,
  JikanNormalizedSeasonalEntrySchema,
  {
    decode: (data) => normalizeJikanSeasonalEntry(data),
    encode: (entry) => ({
      aired: entry.seasonYear
        ? { from: `${entry.seasonYear}-01-01`, string: undefined, to: undefined }
        : undefined,
      airing: undefined,
      approved: undefined,
      background: undefined,
      broadcast: undefined,
      demographics: undefined,
      duration: undefined,
      episodes: entry.episodeCount,
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
    }),
  },
);

function normalizeJikanSeasonalEntry(
  data: Schema.Schema.Type<typeof JikanAnimeDetailBaseSchema>,
): JikanNormalizedSeasonalEntry {
  return {
    coverImage: data.images?.jpg?.image_url ?? data.images?.webp?.image_url ?? undefined,
    episodeCount: data.episodes ?? undefined,
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

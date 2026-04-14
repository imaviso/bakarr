import { Schema } from "effect";

const JikanTitleVariantSchema = Schema.Struct({
  title: Schema.String,
  type: Schema.optional(Schema.NullOr(Schema.String)),
});

const JikanNamedEntrySchema = Schema.Struct({
  name: Schema.String,
});

const JikanRelationEntrySchema = Schema.Struct({
  mal_id: Schema.Number,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  type: Schema.optional(Schema.NullOr(Schema.String)),
});

const JikanRelationSchema = Schema.Struct({
  entry: Schema.Array(JikanRelationEntrySchema),
  relation: Schema.optional(Schema.NullOr(Schema.String)),
});

const JikanAiredSchema = Schema.Struct({
  from: Schema.optional(Schema.NullOr(Schema.String)),
  to: Schema.optional(Schema.NullOr(Schema.String)),
});

const JikanAnimeDetailBaseSchema = Schema.Struct({
  aired: Schema.optional(Schema.NullOr(JikanAiredSchema)),
  demographics: Schema.optional(Schema.NullOr(Schema.Array(JikanNamedEntrySchema))),
  episodes: Schema.optional(Schema.NullOr(Schema.Number)),
  genres: Schema.optional(Schema.NullOr(Schema.Array(JikanNamedEntrySchema))),
  mal_id: Schema.Number,
  score: Schema.optional(Schema.NullOr(Schema.Number)),
  status: Schema.optional(Schema.NullOr(Schema.String)),
  studios: Schema.optional(Schema.NullOr(Schema.Array(JikanNamedEntrySchema))),
  synopsis: Schema.optional(Schema.NullOr(Schema.String)),
  themes: Schema.optional(Schema.NullOr(Schema.Array(JikanNamedEntrySchema))),
  title: Schema.optional(Schema.NullOr(Schema.String)),
  title_english: Schema.optional(Schema.NullOr(Schema.String)),
  title_japanese: Schema.optional(Schema.NullOr(Schema.String)),
  title_synonyms: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  titles: Schema.optional(Schema.NullOr(Schema.Array(JikanTitleVariantSchema))),
  type: Schema.optional(Schema.NullOr(Schema.String)),
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

export const JikanRelationTargetSchema = Schema.Struct({
  malId: Schema.Int,
  relation: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
});

export const JikanNormalizedAnimeSchema = Schema.Struct({
  endDate: Schema.optional(Schema.String),
  episodeCount: Schema.optional(Schema.Number),
  format: Schema.optional(Schema.String),
  genres: Schema.Array(Schema.String),
  malId: Schema.Int,
  relations: Schema.Array(JikanRelationTargetSchema),
  score: Schema.optional(Schema.Number),
  startDate: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  studios: Schema.Array(Schema.String),
  synopsis: Schema.optional(Schema.String),
  title: Schema.Struct({
    english: Schema.optional(Schema.String),
    native: Schema.optional(Schema.String),
    romaji: Schema.optional(Schema.String),
  }),
  titleVariants: Schema.Array(Schema.String),
});

export type JikanNormalizedAnime = Schema.Schema.Type<typeof JikanNormalizedAnimeSchema>;

export const JikanNormalizedAnimeFromFullSchema = Schema.transform(
  JikanAnimeDetailFullSchema,
  JikanNormalizedAnimeSchema,
  {
    decode: (data) => normalizeJikanAnime(data),
    encode: (normalized) => ({
      aired: undefined,
      demographics: undefined,
      episodes: normalized.episodeCount,
      genres: normalized.genres.map((name) => ({ name })),
      mal_id: normalized.malId,
      relations: normalized.relations.map((relation) => ({
        entry: [
          {
            mal_id: relation.malId,
            name: relation.title,
            type: "anime",
          },
        ],
        relation: relation.relation,
      })),
      score: normalized.score,
      status: normalized.status,
      studios: normalized.studios.map((name) => ({ name })),
      synopsis: normalized.synopsis,
      themes: undefined,
      title: normalized.title.romaji,
      title_english: normalized.title.english,
      title_japanese: normalized.title.native,
      title_synonyms: normalized.titleVariants,
      titles: normalized.titleVariants.map((title) => ({ title, type: undefined })),
      type: normalized.format,
    }),
  },
);

export const JikanNormalizedAnimeFromDetailSchema = Schema.transform(
  JikanAnimeDetailSchema,
  JikanNormalizedAnimeSchema,
  {
    decode: (data) => normalizeJikanAnime(data),
    encode: (normalized) => ({
      aired: undefined,
      demographics: undefined,
      episodes: normalized.episodeCount,
      genres: normalized.genres.map((name) => ({ name })),
      mal_id: normalized.malId,
      score: normalized.score,
      status: normalized.status,
      studios: normalized.studios.map((name) => ({ name })),
      synopsis: normalized.synopsis,
      themes: undefined,
      title: normalized.title.romaji,
      title_english: normalized.title.english,
      title_japanese: normalized.title.native,
      title_synonyms: normalized.titleVariants,
      titles: normalized.titleVariants.map((title) => ({ title, type: undefined })),
      type: normalized.format,
    }),
  },
);

type JikanAnimeInput =
  | Schema.Schema.Type<typeof JikanAnimeDetailSchema>
  | Schema.Schema.Type<typeof JikanAnimeDetailFullSchema>;

function normalizeJikanAnime(data: JikanAnimeInput): JikanNormalizedAnime {
  const relations = "relations" in data ? data.relations : undefined;

  return {
    endDate: toIsoDate(data.aired?.to),
    episodeCount: data.episodes ?? undefined,
    format: data.type ?? undefined,
    genres: normalizeNames(data.genres, data.themes, data.demographics),
    malId: data.mal_id,
    relations: normalizeRelations(relations),
    score: data.score ?? undefined,
    startDate: toIsoDate(data.aired?.from),
    status: data.status ?? undefined,
    studios: normalizeNames(data.studios),
    synopsis: data.synopsis ?? undefined,
    title: {
      english: data.title_english ?? undefined,
      native: data.title_japanese ?? undefined,
      romaji: data.title ?? undefined,
    },
    titleVariants: normalizeTitleVariants(data),
  };
}

function normalizeNames(
  ...groups: ReadonlyArray<ReadonlyArray<{ name: string }> | null | undefined>
) {
  const values = groups.flatMap((group) =>
    Array.isArray(group) ? group.map((entry) => entry.name) : [],
  );

  return dedupeStrings(values);
}

function normalizeRelations(
  relations:
    | ReadonlyArray<{
        readonly entry: ReadonlyArray<{
          readonly mal_id: number;
          readonly name?: string | null | undefined;
          readonly type?: string | null | undefined;
        }>;
        readonly relation?: string | null | undefined;
      }>
    | null
    | undefined,
) {
  if (!Array.isArray(relations) || relations.length === 0) {
    return [];
  }

  const entries: Array<{ malId: number; relation?: string; title?: string }> = relations.flatMap(
    (relation) =>
      relation.entry.flatMap((entry: (typeof relation.entry)[number]) => {
        if (entry.type !== "anime") {
          return [];
        }

        return [
          {
            malId: entry.mal_id,
            relation: relation.relation ?? undefined,
            title: entry.name ?? undefined,
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

function toIsoDate(input: string | null | undefined) {
  if (!input) {
    return undefined;
  }

  const datePart = input.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : undefined;
}

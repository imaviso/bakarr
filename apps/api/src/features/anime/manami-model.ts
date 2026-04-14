import { Schema } from "effect";

const HttpUrlStringSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.pattern(/^https?:\/\/[^\s]+$/),
);

const DatasetDateStringSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.pattern(/^\d{4}-\d{2}-\d{2}$/),
);

export const ManamiAnimeEntrySchema = Schema.Struct({
  relatedAnime: Schema.optional(Schema.Array(HttpUrlStringSchema)),
  sources: Schema.Array(HttpUrlStringSchema),
  studios: Schema.optional(Schema.Array(Schema.String)),
  synonyms: Schema.optional(Schema.Array(Schema.String)),
  tags: Schema.optional(Schema.Array(Schema.String)),
  title: Schema.String,
});

export type ManamiAnimeEntry = Schema.Schema.Type<typeof ManamiAnimeEntrySchema>;

export const ManamiDatasetSchema = Schema.Struct({
  data: Schema.Array(ManamiAnimeEntrySchema),
  lastUpdate: DatasetDateStringSchema,
  license: Schema.String,
  repository: HttpUrlStringSchema,
});

export type ManamiDataset = Schema.Schema.Type<typeof ManamiDatasetSchema>;

import { Schema } from "effect";

import {
  MediaIdFromStringSchema,
  UnitNumberFromStringSchema,
  PositiveIntFromStringSchema,
} from "@/domain/domain-schema.ts";

export const FilesystemPathStringSchema = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.makeFilter((value) => !value.includes("\u0000"))),
  Schema.brand("FilesystemPath"),
);

export const AbsoluteFilesystemPathStringSchema = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.makeFilter((value) => value.startsWith("/") && !value.includes("\u0000"))),
  Schema.brand("AbsoluteFilesystemPath"),
);

export const HttpUrlStringSchema = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isPattern(/^https?:\/\/[^\s]+$/)),
  Schema.brand("HttpUrl"),
);

export const IsoDateTimeStringSchema = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/),
  ),
  Schema.brand("IsoDateTime"),
);

export class IdParamsSchema extends Schema.Class<IdParamsSchema>("IdParamsSchema")({
  id: PositiveIntFromStringSchema,
}) {}

export class SearchUnitParamsSchema extends Schema.Class<SearchUnitParamsSchema>(
  "SearchUnitParamsSchema",
)({
  mediaId: MediaIdFromStringSchema,
  unitNumber: UnitNumberFromStringSchema,
}) {}

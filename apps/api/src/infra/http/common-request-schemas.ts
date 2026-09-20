import { Schema, SchemaTransformation } from "effect";

import {
  MediaIdFromStringSchema,
  UnitNumberFromStringSchema,
  PositiveIntFromStringSchema,
} from "@/infra/schema.ts";
import { httpUrlTargetsPrivateHost } from "@/security/private-host.ts";

export const FilesystemPathStringSchema = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.makeFilter((value: string) => !value.includes("\u0000"))),
  Schema.brand("FilesystemPath"),
);

export const AbsoluteFilesystemPathStringSchema = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(
    Schema.makeFilter((value: string) => value.startsWith("/") && !value.includes("\u0000")),
  ),
  Schema.brand("AbsoluteFilesystemPath"),
);

// SSRF boundary: feed URLs must not target loopback, private, or link-local
// hosts (same guard as the qBittorrent URL config).
export const HttpUrlStringSchema = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isPattern(/^https?:\/\/[^\s]+$/)),
  Schema.check(
    Schema.makeFilter((value: string) => !httpUrlTargetsPrivateHost(value), {
      message: "URL must not target loopback, private, or link-local hosts",
    }),
  ),
  Schema.brand("HttpUrl"),
);

export const IsoDateTimeStringSchema = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/),
  ),
  Schema.brand("IsoDateTime"),
);

/**
 * Query-schema date that owns day-boundary semantics server-side: a date-only
 * value (`YYYY-MM-DD`) decodes to an inclusive whole-UTC-day bound, so clients
 * never append ` 00:00:00` / ` 23:59:59` themselves. Full timestamps pass
 * through unchanged.
 */
const DayBoundaryPatternSchema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/),
  ),
);

export const DayStartStringSchema = DayBoundaryPatternSchema.pipe(
  Schema.decodeTo(
    Schema.brand("IsoDateTime")(Schema.String),
    SchemaTransformation.transform({
      decode: (value) => (value.includes("T") ? value : `${value}T00:00:00.000Z`),
      encode: (value) => value,
    }),
  ),
);

export const DayEndStringSchema = DayBoundaryPatternSchema.pipe(
  Schema.decodeTo(
    Schema.brand("IsoDateTime")(Schema.String),
    SchemaTransformation.transform({
      decode: (value) => (value.includes("T") ? value : `${value}T23:59:59.999Z`),
      encode: (value) => value,
    }),
  ),
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

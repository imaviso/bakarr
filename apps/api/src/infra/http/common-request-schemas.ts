import { Schema } from "effect";

import {
  MediaIdFromStringSchema,
  UnitNumberFromStringSchema,
  PositiveIntFromStringSchema,
} from "@/infra/schema.ts";
import { httpUrlTargetsPrivateHost } from "@/security/private-host.ts";

export const FilesystemPathStringSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.filter((value) => !value.includes("\u0000")),
  Schema.brand("FilesystemPath"),
);

export const AbsoluteFilesystemPathStringSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.filter((value) => value.startsWith("/") && !value.includes("\u0000")),
  Schema.brand("AbsoluteFilesystemPath"),
);

// SSRF boundary: feed URLs must not target loopback, private, or link-local
// hosts (same guard as the qBittorrent URL config).
export const HttpUrlStringSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.pattern(/^https?:\/\/[^\s]+$/),
  Schema.filter((value) => !httpUrlTargetsPrivateHost(value), {
    message: () => "URL must not target loopback, private, or link-local hosts",
  }),
  Schema.brand("HttpUrl"),
);

export const IsoDateTimeStringSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.pattern(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/),
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

import { Schema } from "effect";

export const PositiveIntSchema = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
);

export const PositiveIntFromStringSchema = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isGreaterThan(0)),
);

export const NonNegativeIntFromStringSchema = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
);

export const MediaIdSchema = PositiveIntSchema.pipe(Schema.brand("MediaId"));
export const MediaIdFromStringSchema = PositiveIntFromStringSchema.pipe(Schema.brand("MediaId"));

export const DownloadIdSchema = PositiveIntSchema.pipe(Schema.brand("DownloadId"));
export const DownloadIdFromStringSchema = PositiveIntFromStringSchema.pipe(
  Schema.brand("DownloadId"),
);

export const UnitNumberSchema = PositiveIntSchema.pipe(Schema.brand("UnitNumber"));
export const UnitNumberFromStringSchema = PositiveIntFromStringSchema.pipe(
  Schema.brand("UnitNumber"),
);

export const ReleaseProfileIdSchema = PositiveIntSchema.pipe(Schema.brand("ReleaseProfileId"));

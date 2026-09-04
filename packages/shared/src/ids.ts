// Shared branded IDs and shared primitive unions.
import { Schema } from "effect";

export const RULE_TYPE_VALUES = ["preferred", "must", "must_not"] as const;
export type RuleType = (typeof RULE_TYPE_VALUES)[number];
export const RuleTypeSchema = Schema.Literals([...RULE_TYPE_VALUES]);

export const IMPORT_MODE_VALUES = ["copy", "move"] as const;
export type ImportMode = (typeof IMPORT_MODE_VALUES)[number];
export const ImportModeSchema = Schema.Literals([...IMPORT_MODE_VALUES]);

export const PREFERRED_TITLE_VALUES = ["romaji", "english", "native"] as const;
export type PreferredTitle = (typeof PREFERRED_TITLE_VALUES)[number];
export const PreferredTitleSchema = Schema.Literals([...PREFERRED_TITLE_VALUES]);

export const MEDIA_KIND_VALUES = ["anime", "manga", "light_novel"] as const;
export type MediaKind = (typeof MEDIA_KIND_VALUES)[number];
export const MediaKindSchema = Schema.Literals([...MEDIA_KIND_VALUES]);

export const MEDIA_UNIT_KIND_VALUES = ["episode", "volume"] as const;
export type MediaUnitKind = (typeof MEDIA_UNIT_KIND_VALUES)[number];
export const MediaUnitKindSchema = Schema.Literals([...MEDIA_UNIT_KIND_VALUES]);

const PositiveEntityIdSchema = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
);

export const MediaIdSchema = PositiveEntityIdSchema.pipe(Schema.brand("MediaId"));
export type MediaId = Schema.Schema.Type<typeof MediaIdSchema>;

export const UserIdSchema = PositiveEntityIdSchema.pipe(Schema.brand("UserId"));
export type UserId = Schema.Schema.Type<typeof UserIdSchema>;

export const DownloadIdSchema = PositiveEntityIdSchema.pipe(Schema.brand("DownloadId"));
export type DownloadId = Schema.Schema.Type<typeof DownloadIdSchema>;

export const DownloadEventIdSchema = PositiveEntityIdSchema.pipe(Schema.brand("DownloadEventId"));
export type DownloadEventId = Schema.Schema.Type<typeof DownloadEventIdSchema>;

export const RssFeedIdSchema = PositiveEntityIdSchema.pipe(Schema.brand("RssFeedId"));
export type RssFeedId = Schema.Schema.Type<typeof RssFeedIdSchema>;

export const LibraryRootIdSchema = PositiveEntityIdSchema.pipe(Schema.brand("LibraryRootId"));
export type LibraryRootId = Schema.Schema.Type<typeof LibraryRootIdSchema>;

export const ActivityIdSchema = PositiveEntityIdSchema.pipe(Schema.brand("ActivityId"));
export type ActivityId = Schema.Schema.Type<typeof ActivityIdSchema>;

export const QualityIdSchema = PositiveEntityIdSchema.pipe(Schema.brand("QualityId"));
export type QualityId = Schema.Schema.Type<typeof QualityIdSchema>;

export const ReleaseProfileIdSchema = PositiveEntityIdSchema.pipe(Schema.brand("ReleaseProfileId"));
export type ReleaseProfileId = Schema.Schema.Type<typeof ReleaseProfileIdSchema>;

export const SystemLogIdSchema = PositiveEntityIdSchema.pipe(Schema.brand("SystemLogId"));
export type SystemLogId = Schema.Schema.Type<typeof SystemLogIdSchema>;

export const OperationTaskIdSchema = PositiveEntityIdSchema.pipe(Schema.brand("OperationTaskId"));
export type OperationTaskId = Schema.Schema.Type<typeof OperationTaskIdSchema>;

export const brandMediaId: (id: number) => MediaId = Schema.decodeUnknownSync(MediaIdSchema);
export const brandUserId: (id: number) => UserId = Schema.decodeUnknownSync(UserIdSchema);
export const brandDownloadId: (id: number) => DownloadId =
  Schema.decodeUnknownSync(DownloadIdSchema);
export const brandDownloadEventId: (id: number) => DownloadEventId =
  Schema.decodeUnknownSync(DownloadEventIdSchema);
export const brandRssFeedId: (id: number) => RssFeedId = Schema.decodeUnknownSync(RssFeedIdSchema);
export const brandLibraryRootId: (id: number) => LibraryRootId =
  Schema.decodeUnknownSync(LibraryRootIdSchema);
export const brandActivityId: (id: number) => ActivityId =
  Schema.decodeUnknownSync(ActivityIdSchema);
export const brandQualityId: (id: number) => QualityId = Schema.decodeUnknownSync(QualityIdSchema);
export const brandReleaseProfileId: (id: number) => ReleaseProfileId =
  Schema.decodeUnknownSync(ReleaseProfileIdSchema);
export const brandSystemLogId: (id: number) => SystemLogId =
  Schema.decodeUnknownSync(SystemLogIdSchema);
export const brandOperationTaskId: (id: number) => OperationTaskId =
  Schema.decodeUnknownSync(OperationTaskIdSchema);

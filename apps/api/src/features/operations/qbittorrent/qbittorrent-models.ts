import { Redacted, Schema } from "effect";

export class QBitConfigModel extends Schema.Class<QBitConfigModel>("QBitConfigModel")({
  baseUrl: Schema.String,
  category: Schema.optional(Schema.String),
  password: Schema.Redacted(Schema.String),
  ratioLimit: Schema.optional(Schema.Number),
  savePath: Schema.optional(Schema.String),
  username: Schema.String,
}) {}

export type QBitConfig = Schema.Schema.Type<typeof QBitConfigModel>;

export function qbitPasswordValue(config: QBitConfig): string {
  return Redacted.value(config.password);
}

export class QBitTorrentClientError extends Schema.TaggedError<QBitTorrentClientError>()(
  "QBitTorrentClientError",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
  },
) {}

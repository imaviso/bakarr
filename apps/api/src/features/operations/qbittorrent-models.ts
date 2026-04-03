import { Schema } from "effect";

export class QBitConfigModel extends Schema.Class<QBitConfigModel>("QBitConfigModel")({
  baseUrl: Schema.String,
  category: Schema.optional(Schema.String),
  password: Schema.String,
  username: Schema.String,
}) {}

export type QBitConfig = Schema.Schema.Type<typeof QBitConfigModel>;

export class QBitTorrentClientError extends Schema.TaggedError<QBitTorrentClientError>()(
  "QBitTorrentClientError",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
  },
) {}

import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { Context, Effect, Layer, Schema } from "effect";

import { ExternalCallError, tryExternalEffect } from "../../lib/effect-retry.ts";

interface SeaDexClientShape {
  readonly getEntryByAniListId: (
    aniListId: number,
  ) => Effect.Effect<SeaDexEntry | null, ExternalCallError>;
}

export class SeaDexClient extends Context.Tag("@bakarr/api/SeaDexClient")<
  SeaDexClient,
  SeaDexClientShape
>() {}

const SEADEX_API_BASE = "https://releases.moe/api/collections";

class SeaDexTorrentSchema extends Schema.Class<SeaDexTorrentSchema>("SeaDexTorrentSchema")({
  dualAudio: Schema.Boolean,
  groupedUrl: Schema.String,
  infoHash: Schema.optional(Schema.String),
  isBest: Schema.Boolean,
  releaseGroup: Schema.String,
  tags: Schema.Array(Schema.String),
  tracker: Schema.String,
  url: Schema.String,
}) {}

class SeaDexApiEntryExpandSchema extends Schema.Class<SeaDexApiEntryExpandSchema>(
  "SeaDexApiEntryExpandSchema",
)({
  trs: Schema.Array(SeaDexTorrentSchema),
}) {}

class SeaDexApiEntrySchema extends Schema.Class<SeaDexApiEntrySchema>("SeaDexApiEntrySchema")({
  alID: Schema.Number,
  comparison: Schema.optional(Schema.String),
  incomplete: Schema.Boolean,
  notes: Schema.optional(Schema.String),
  expand: SeaDexApiEntryExpandSchema,
}) {}

class SeaDexApiEntryListSchema extends Schema.Class<SeaDexApiEntryListSchema>(
  "SeaDexApiEntryListSchema",
)({
  items: Schema.Array(SeaDexApiEntrySchema),
}) {}

export type SeaDexRelease = Schema.Schema.Type<typeof SeaDexTorrentSchema>;

export const SeaDexEntrySchema = Schema.Struct({
  alID: Schema.Number,
  comparison: Schema.optional(Schema.String),
  incomplete: Schema.Boolean,
  notes: Schema.optional(Schema.String),
  releases: Schema.Array(SeaDexTorrentSchema),
});

export type SeaDexEntry = Schema.Schema.Type<typeof SeaDexEntrySchema>;

export const SeaDexClientLive = Layer.effect(
  SeaDexClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    const getEntryByAniListId = Effect.fn("SeaDexClient.getEntryByAniListId")(function* (
      aniListId: number,
    ) {
      const params = new URLSearchParams({
        filter: `alID=${aniListId}`,
        perPage: "1",
        expand: "trs",
        fields: [
          "id",
          "alID",
          "comparison",
          "incomplete",
          "notes",
          "expand.trs.id",
          "expand.trs.infoHash",
          "expand.trs.isBest",
          "expand.trs.releaseGroup",
          "expand.trs.tags",
          "expand.trs.tracker",
          "expand.trs.url",
          "expand.trs.groupedUrl",
          "expand.trs.dualAudio",
        ].join(","),
      });

      const request = HttpClientRequest.get(
        `${SEADEX_API_BASE}/entries/records?${params.toString()}`,
      );
      const response = yield* tryExternalEffect("seadex.entry", client.execute(request))();

      if (response.status < 200 || response.status >= 300) {
        return yield* ExternalCallError.make({
          cause: new Error(`SeaDex request failed with status ${response.status}`),
          message: "SeaDex request failed",
          operation: "seadex.entry.response",
        });
      }

      const decoded = yield* HttpClientResponse.schemaBodyJson(SeaDexApiEntryListSchema)(
        response,
      ).pipe(
        Effect.mapError((cause) =>
          ExternalCallError.make({
            cause,
            message: "SeaDex response decode failed",
            operation: "seadex.entry.json",
          }),
        ),
      );

      const entry = decoded.items.at(0);
      if (!entry) {
        return null;
      }

      return {
        alID: entry.alID,
        comparison: entry.comparison,
        incomplete: entry.incomplete,
        notes: entry.notes,
        releases: entry.expand.trs,
      } satisfies SeaDexEntry;
    });

    return {
      getEntryByAniListId,
    } satisfies SeaDexClientShape;
  }),
);

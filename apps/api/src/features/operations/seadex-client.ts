import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Context, Effect, Layer, Schema } from "effect";

import {
  ExternalCallError,
  tryExternalEffect,
} from "../../lib/effect-retry.ts";

export interface SeaDexRelease {
  readonly dualAudio: boolean;
  readonly groupedUrl: string;
  readonly infoHash?: string;
  readonly isBest: boolean;
  readonly releaseGroup: string;
  readonly tags: readonly string[];
  readonly tracker: string;
  readonly url: string;
}

export interface SeaDexEntry {
  readonly alID: number;
  readonly comparison?: string;
  readonly incomplete: boolean;
  readonly notes?: string;
  readonly releases: readonly SeaDexRelease[];
}

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

class SeaDexTorrentSchema
  extends Schema.Class<SeaDexTorrentSchema>("SeaDexTorrentSchema")({
    dualAudio: Schema.Boolean,
    groupedUrl: Schema.String,
    infoHash: Schema.optional(Schema.String),
    isBest: Schema.Boolean,
    releaseGroup: Schema.String,
    tags: Schema.Array(Schema.String),
    tracker: Schema.String,
    url: Schema.String,
  }) {}

class SeaDexEntryExpandSchema
  extends Schema.Class<SeaDexEntryExpandSchema>("SeaDexEntryExpandSchema")({
    trs: Schema.Array(SeaDexTorrentSchema),
  }) {}

class SeaDexEntrySchema
  extends Schema.Class<SeaDexEntrySchema>("SeaDexEntrySchema")({
    alID: Schema.Number,
    comparison: Schema.optional(Schema.String),
    incomplete: Schema.Boolean,
    notes: Schema.optional(Schema.String),
    expand: SeaDexEntryExpandSchema,
  }) {}

class SeaDexEntryListSchema
  extends Schema.Class<SeaDexEntryListSchema>("SeaDexEntryListSchema")({
    items: Schema.Array(SeaDexEntrySchema),
  }) {}

export const SeaDexClientLive = Layer.effect(
  SeaDexClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    const getEntryByAniListId = Effect.fn("SeaDexClient.getEntryByAniListId")(
      function* (aniListId: number) {
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
        const response = yield* tryExternalEffect(
          "seadex.entry",
          client.execute(request),
        )();

        if (response.status < 200 || response.status >= 300) {
          return yield* ExternalCallError.make({
            cause: new Error(
              `SeaDex request failed with status ${response.status}`,
            ),
            message: "SeaDex request failed",
            operation: "seadex.entry.response",
          });
        }

        const payload = yield* response.json.pipe(
          Effect.mapError((cause) =>
            ExternalCallError.make({
              cause,
              message: "Failed to decode SeaDex JSON response",
              operation: "seadex.entry.json",
            })
          ),
        );

        const decoded = Schema.decodeUnknownEither(SeaDexEntryListSchema)(
          payload,
        );
        if (decoded._tag === "Left") {
          return yield* ExternalCallError.make({
            cause: decoded.left,
            message: "SeaDex response schema mismatch",
            operation: "seadex.entry.schema",
          });
        }

        const entry = decoded.right.items.at(0);
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
      },
    );

    return {
      getEntryByAniListId,
    } satisfies SeaDexClientShape;
  }),
);

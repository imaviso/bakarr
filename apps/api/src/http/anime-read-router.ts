import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { Database } from "@/db/database.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { listAnimeFilesEffect } from "@/features/anime/anime-file-list.ts";
import { AnimeQueryService } from "@/features/anime/query-service.ts";
import { CatalogDownloadService } from "@/features/operations/catalog-download-orchestration.ts";
import { CatalogLibraryReadService } from "@/features/operations/catalog-library-read-support.ts";
import {
  ListAnimeQuerySchema,
  SearchAnimeQuerySchema,
  StreamUrlQuerySchema,
} from "@/http/anime-request-schemas.ts";
import { IdParamsSchema } from "@/http/common-request-schemas.ts";
import { ClockService } from "@/lib/clock.ts";
import { EpisodeStreamAccessError } from "@/http/streaming-errors.ts";
import { StreamTokenSigner } from "@/http/stream-token-signer.ts";
import {
  authedRouteResponse,
  decodePathParams,
  decodeQuery,
  jsonResponse,
} from "@/http/router-helpers.ts";

const STREAM_EXPIRY_MS = 6 * 60 * 60 * 1000;

export const animeReadRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/anime",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(ListAnimeQuerySchema);
        return yield* (yield* AnimeQueryService).listAnime({
          limit: query.limit,
          monitored: query.monitored,
          offset: query.offset,
        });
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/search",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(SearchAnimeQuerySchema);
        return yield* (yield* AnimeQueryService).searchAnime(query.q ?? "");
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/anilist/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* AnimeQueryService).getAnimeByAnilistId(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* AnimeQueryService).getAnime(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/episodes",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* AnimeQueryService).listEpisodes(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/files",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const { db } = yield* Database;
        const fs = yield* FileSystem;
        const mediaProbe = yield* MediaProbe;
        return yield* listAnimeFilesEffect({
          animeId: params.id,
          db,
          fs,
          mediaProbe,
        });
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/rss",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogDownloadService).listAnimeRssFeeds(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/rename-preview",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        return yield* (yield* CatalogLibraryReadService).getRenamePreview(params.id);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/anime/:id/stream-url",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const query = yield* decodeQuery(StreamUrlQuerySchema);
        const clock = yield* ClockService;
        const now = yield* clock.currentTimeMillis;
        const expiresAt = now + STREAM_EXPIRY_MS;
        const signer = yield* StreamTokenSigner;
        const signature = yield* signer
          .sign({
            animeId: params.id,
            episodeNumber: query.episodeNumber,
            expiresAt,
          })
          .pipe(
            Effect.mapError(
              () =>
                new EpisodeStreamAccessError({ message: "Failed to sign stream URL", status: 400 }),
            ),
          );

        return {
          url: `/api/stream/${params.id}/${query.episodeNumber}?exp=${expiresAt}&sig=${signature}`,
        };
      }),
      jsonResponse,
    ),
  ),
);

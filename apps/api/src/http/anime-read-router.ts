import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { AnimeFileService } from "../features/anime/file-service.ts";
import { AnimeQueryService } from "../features/anime/query-service.ts";
import { CatalogDownloadService } from "../features/operations/catalog-service-tags.ts";
import { CatalogLibraryService } from "../features/operations/catalog-library-service.ts";
import {
  ListAnimeQuerySchema,
  SearchAnimeQuerySchema,
  StreamUrlQuerySchema,
} from "./anime-request-schemas.ts";
import { IdParamsSchema } from "./common-request-schemas.ts";
import { ClockService } from "../lib/clock.ts";
import { EpisodeStreamAccessError } from "./streaming-errors.ts";
import { StreamTokenSigner } from "./stream-token-signer.ts";
import {
  authedRouteResponse,
  decodePathParams,
  decodeQuery,
  jsonResponse,
} from "./router-helpers.ts";

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
        return yield* (yield* AnimeFileService).listFiles(params.id);
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
        return yield* (yield* CatalogLibraryService).getRenamePreview(params.id);
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

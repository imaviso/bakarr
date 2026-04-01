import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { AnimeMaintenanceService } from "@/features/anime/anime-maintenance-service.ts";
import { CatalogLibraryScanService } from "@/features/operations/catalog-library-scan-service.ts";
import { SearchBackgroundRssService } from "@/features/operations/background-search-rss-support.ts";
import { authedRouteResponse, successResponse } from "@/http/router-helpers.ts";

export const systemTasksRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/api/system/tasks/scan",
    authedRouteResponse(
      Effect.flatMap(CatalogLibraryScanService, (service) => service.runLibraryScan()),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/api/system/tasks/rss",
    authedRouteResponse(
      Effect.flatMap(SearchBackgroundRssService, (service) => service.runRssCheck()),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/api/system/tasks/metadata-refresh",
    authedRouteResponse(
      Effect.flatMap(AnimeMaintenanceService, (service) =>
        service.refreshMetadataForMonitoredAnime(),
      ),
      successResponse,
    ),
  ),
);

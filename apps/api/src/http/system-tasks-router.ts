import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { AnimeMutationService } from "../features/anime/service.ts";
import { CatalogLibraryService } from "../features/operations/catalog-service-tags.ts";
import { SearchWorkerService } from "../features/operations/worker-services.ts";
import { authedRouteResponse, successResponse } from "./router-helpers.ts";

export const systemTasksRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/api/system/tasks/scan",
    authedRouteResponse(
      Effect.flatMap(CatalogLibraryService, (service) => service.runLibraryScan()),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/api/system/tasks/rss",
    authedRouteResponse(
      Effect.flatMap(SearchWorkerService, (service) => service.runRssCheck()),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/api/system/tasks/metadata-refresh",
    authedRouteResponse(
      Effect.flatMap(AnimeMutationService, (service) => service.refreshMetadataForMonitoredAnime()),
      successResponse,
    ),
  ),
);

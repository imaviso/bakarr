import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { AnimeMutationService } from "../features/anime/mutation-service.ts";
import { CatalogLibraryService } from "../features/operations/catalog-library-service.ts";
import { SearchWorkflow } from "../features/operations/search-service-tags.ts";
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
      Effect.flatMap(SearchWorkflow, (service) => service.runRssCheck()),
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

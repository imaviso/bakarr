import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { AnimeMutationService } from "../features/anime/service.ts";
import {
  CatalogOrchestration,
  SearchOrchestration,
} from "../features/operations/operations-orchestration.ts";
import { authedRouteResponse, successResponse } from "./router-helpers.ts";

export const systemTasksRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/api/system/tasks/scan",
    authedRouteResponse(
      Effect.flatMap(CatalogOrchestration, (service) => service.runLibraryScan()),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/api/system/tasks/rss",
    authedRouteResponse(
      Effect.flatMap(SearchOrchestration, (service) => service.runRssCheck()),
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

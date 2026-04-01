import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { SystemReadService } from "@/features/system/system-read-service.ts";
import { authedRouteResponse, jsonResponse } from "@/http/router-helpers.ts";

export const infoRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/system/dashboard",
    authedRouteResponse(
      Effect.flatMap(SystemReadService, (service) => service.getDashboard()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/system/jobs",
    authedRouteResponse(
      Effect.flatMap(SystemReadService, (service) => service.getJobs()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/library/stats",
    authedRouteResponse(
      Effect.flatMap(SystemReadService, (service) => service.getLibraryStats()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/library/activity",
    authedRouteResponse(
      Effect.flatMap(SystemReadService, (service) => service.getActivity()),
      jsonResponse,
    ),
  ),
);

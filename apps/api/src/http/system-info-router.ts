import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { SystemDashboardService } from "@/features/system/system-dashboard-service.ts";
import { SystemStatusService } from "@/features/system/system-status-service.ts";
import { authedRouteResponse, jsonResponse } from "@/http/router-helpers.ts";

export const infoRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/system/dashboard",
    authedRouteResponse(
      Effect.flatMap(SystemDashboardService, (service) => service.getDashboard()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/system/jobs",
    authedRouteResponse(
      Effect.flatMap(SystemStatusService, (service) => service.getJobs()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/library/stats",
    authedRouteResponse(
      Effect.flatMap(SystemStatusService, (service) => service.getLibraryStats()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/library/activity",
    authedRouteResponse(
      Effect.flatMap(SystemStatusService, (service) => service.getActivity()),
      jsonResponse,
    ),
  ),
);

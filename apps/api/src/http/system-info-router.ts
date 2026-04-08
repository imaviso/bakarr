import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { BackgroundJobStatusService } from "@/features/system/background-job-status-service.ts";
import { SystemActivityReadService } from "@/features/system/system-activity-read-service.ts";
import { SystemDashboardReadService } from "@/features/system/system-dashboard-read-service.ts";
import { SystemLibraryStatsReadService } from "@/features/system/system-library-stats-read-service.ts";
import { authedRouteResponse, jsonResponse } from "@/http/router-helpers.ts";

export const infoRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/system/dashboard",
    authedRouteResponse(
      Effect.flatMap(SystemDashboardReadService, (service) => service.getDashboard()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/system/jobs",
    authedRouteResponse(
      Effect.flatMap(BackgroundJobStatusService, (service) =>
        service.getSnapshot().pipe(Effect.map((snapshot) => snapshot.jobs)),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/library/stats",
    authedRouteResponse(
      Effect.flatMap(SystemLibraryStatsReadService, (service) => service.getLibraryStats()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/library/activity",
    authedRouteResponse(
      Effect.flatMap(SystemActivityReadService, (service) => service.getActivity()),
      jsonResponse,
    ),
  ),
);

import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { SystemStatusService } from "../features/system/system-status-service.ts";
import {
  buildHealthLiveResponse,
  buildHealthOkResponse,
  buildHealthReadyResponse,
} from "./health-response.ts";
import { getHealthReadyState } from "./system-health-ready-support.ts";
import { authedRouteResponse, jsonResponse, routeResponse } from "./router-helpers.ts";

export const healthRouter = HttpRouter.empty.pipe(
  HttpRouter.get("/health", buildHealthOkResponse()),
  HttpRouter.get("/api/system/health/live", buildHealthLiveResponse()),
  HttpRouter.get(
    "/api/system/health/ready",
    routeResponse(getHealthReadyState(), buildHealthReadyResponse),
  ),
  HttpRouter.get(
    "/api/system/status",
    authedRouteResponse(
      Effect.flatMap(SystemStatusService, (service) => service.getSystemStatus()),
      jsonResponse,
    ),
  ),
);

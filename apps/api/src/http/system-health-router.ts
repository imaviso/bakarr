import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { SystemStatusService } from "../features/system/system-status-service.ts";
import {
  buildHealthLiveResponse,
  buildHealthOkResponse,
  buildHealthReadyResponse,
} from "./health-response.ts";
import { authedRouteResponse, jsonResponse, routeResponse } from "./router-helpers.ts";

const notReadyResponse = { checks: { database: false }, ready: false } as const;

export const healthRouter = HttpRouter.empty.pipe(
  HttpRouter.get("/health", buildHealthOkResponse()),
  HttpRouter.get("/api/system/health/live", buildHealthLiveResponse()),
  HttpRouter.get(
    "/api/system/health/ready",
    routeResponse(
      Effect.gen(function* () {
        yield* (yield* SystemStatusService).getSystemStatus();
        return { checks: { database: true }, ready: true };
      }).pipe(
        Effect.catchTags({
          DatabaseError: () => Effect.succeed(notReadyResponse),
          DiskSpaceError: () => Effect.succeed(notReadyResponse),
          StoredConfigCorruptError: () => Effect.succeed(notReadyResponse),
          StoredConfigMissingError: () => Effect.succeed(notReadyResponse),
        }),
      ),
      buildHealthReadyResponse,
    ),
  ),
  HttpRouter.get(
    "/api/system/status",
    authedRouteResponse(
      Effect.flatMap(SystemStatusService, (service) => service.getSystemStatus()),
      jsonResponse,
    ),
  ),
);

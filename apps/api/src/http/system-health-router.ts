import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import type { HealthStatus } from "@packages/shared/index.ts";
import { SystemStatusService } from "@/features/system/system-status-service.ts";
import { authedRouteResponse, jsonResponse, routeResponse } from "@/http/router-helpers.ts";

const notReadyResponse = { checks: { database: false }, ready: false } as const;

export const healthRouter = HttpRouter.empty.pipe(
  HttpRouter.get("/health", HttpServerResponse.json({ status: "ok" } satisfies HealthStatus)),
  HttpRouter.get("/api/system/health/live", HttpServerResponse.json({ status: "alive" })),
  HttpRouter.get(
    "/api/system/health/ready",
    routeResponse(
      Effect.flatMap(SystemStatusService, (service) => service.getSystemStatus()).pipe(
        Effect.map(() => ({ checks: { database: true }, ready: true }) as const),
        Effect.catchTags({
          DatabaseError: () => Effect.succeed(notReadyResponse),
          DiskSpaceError: () => Effect.succeed(notReadyResponse),
          StoredConfigCorruptError: () => Effect.succeed(notReadyResponse),
          StoredConfigMissingError: () => Effect.succeed(notReadyResponse),
        }),
      ),
      (value) => HttpServerResponse.json(value, { status: value.ready ? 200 : 503 }),
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

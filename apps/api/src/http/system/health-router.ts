import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect, Schema } from "effect";

import {
  HealthStatusSchema,
  SystemStatusSchema,
  type HealthStatus,
} from "@packages/shared/index.ts";
import { SystemReadService } from "@/features/system/system-read-service.ts";
import {
  authedRouteResponse,
  routeResponse,
  schemaJsonResponse,
} from "@/http/shared/router-helpers.ts";

const ReadyResponseSchema = Schema.Struct({
  checks: Schema.Struct({ database: Schema.Boolean }),
  ready: Schema.Boolean,
});
const LiveResponseSchema = Schema.Struct({ status: Schema.Literal("alive") });

const notReadyResponse = { checks: { database: false }, ready: false } as const;

export const healthRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/health",
    HttpServerResponse.schemaJson(HealthStatusSchema)({ status: "ok" } satisfies HealthStatus),
  ),
  HttpRouter.get(
    "/api/system/health/live",
    HttpServerResponse.schemaJson(LiveResponseSchema)({ status: "alive" }),
  ),
  HttpRouter.get(
    "/api/system/health/ready",
    routeResponse(
      Effect.flatMap(SystemReadService, (service) => service.getSystemStatus()).pipe(
        Effect.map(() => ({ checks: { database: true }, ready: true }) as const),
        Effect.catchTags({
          ConfigValidationError: () => Effect.succeed(notReadyResponse),
          DatabaseError: () => Effect.succeed(notReadyResponse),
          DiskSpaceError: () => Effect.succeed(notReadyResponse),
          StoredConfigCorruptError: () => Effect.succeed(notReadyResponse),
          StoredConfigMissingError: () => Effect.succeed(notReadyResponse),
        }),
      ),
      (value: { readonly checks: { readonly database: boolean }; readonly ready: boolean }) =>
        HttpServerResponse.schemaJson(ReadyResponseSchema)(value, {
          status: value.ready ? 200 : 503,
        }),
    ),
  ),
  HttpRouter.get(
    "/api/system/status",
    authedRouteResponse(
      Effect.flatMap(SystemReadService, (service) => service.getSystemStatus()),
      schemaJsonResponse(SystemStatusSchema),
    ),
  ),
);

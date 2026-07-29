import { HttpRouter } from "effect/unstable/http";
import { Effect, Schema } from "effect";

import {
  HealthStatusSchema,
  SystemStatusSchema,
  type HealthStatus,
} from "@packages/shared/index.ts";
import { SystemReadService } from "@/features/system/system-read-service.ts";
import {
  authedRouteResponse,
  encodeSchemaJsonResponse,
  routeResponse,
  schemaJsonResponse,
} from "@/http/shared/router-helpers.ts";

const ReadyResponseSchema = Schema.Struct({
  checks: Schema.Struct({ database: Schema.Boolean }),
  ready: Schema.Boolean,
});
const LiveResponseSchema = Schema.Struct({ status: Schema.Literal("alive") });

const notReadyResponse = { checks: { database: false }, ready: false } as const;

export const healthRoutes = [
  HttpRouter.route(
    "GET",
    "/health",
    encodeSchemaJsonResponse(HealthStatusSchema, { status: "ok" } satisfies HealthStatus),
  ),
  HttpRouter.route(
    "GET",
    "/api/system/health/live",
    encodeSchemaJsonResponse(LiveResponseSchema, { status: "alive" }),
  ),
  HttpRouter.route(
    "GET",
    "/api/system/health/ready",
    routeResponse(
      Effect.gen(function* () {
        const service = yield* SystemReadService;
        return yield* service.getSystemStatus();
      }).pipe(
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
        encodeSchemaJsonResponse(ReadyResponseSchema, value, {
          status: value.ready ? 200 : 503,
        }),
    ),
  ),
  HttpRouter.route(
    "GET",
    "/api/system/status",
    authedRouteResponse(
      Effect.gen(function* () {
        const service = yield* SystemReadService;
        return yield* service.getSystemStatus();
      }),
      schemaJsonResponse(SystemStatusSchema),
    ),
  ),
];

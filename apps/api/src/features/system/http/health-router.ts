import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { Effect, Layer, Schema } from "effect";

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
} from "@/infra/http/router-helpers.ts";
import { isReadinessDegradedError } from "@/infra/http/route-errors/system.ts";

const ReadyResponseSchema = Schema.Struct({
  checks: Schema.Struct({ database: Schema.Boolean }),
  ready: Schema.Boolean,
});
const LiveResponseSchema = Schema.Struct({ status: Schema.Literals(["alive"]) });

const notReadyResponse: {
  readonly checks: { readonly database: boolean };
  readonly ready: boolean;
} = { checks: { database: false }, ready: false };

export const healthRouter = Layer.mergeAll(
  HttpRouter.add(
    "GET",
    "/health",
    HttpServerResponse.schemaJson(HealthStatusSchema)({ status: "ok" } satisfies HealthStatus),
  ),
  HttpRouter.add(
    "GET",
    "/api/system/health/live",
    HttpServerResponse.schemaJson(LiveResponseSchema)({ status: "alive" }),
  ),
  HttpRouter.add(
    "GET",
    "/api/system/health/ready",
    routeResponse(
      Effect.gen(function* () {
        const service = yield* SystemReadService;
        return yield* service.getSystemStatus();
      }).pipe(
        Effect.map(() => ({ checks: { database: true }, ready: true })),
        Effect.catchIf(isReadinessDegradedError, () => Effect.succeed(notReadyResponse)),
      ),
      (value: { readonly checks: { readonly database: boolean }; readonly ready: boolean }) =>
        HttpServerResponse.schemaJson(ReadyResponseSchema)(value, {
          status: value.ready ? 200 : 503,
        }),
    ),
  ),
  HttpRouter.add(
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
);

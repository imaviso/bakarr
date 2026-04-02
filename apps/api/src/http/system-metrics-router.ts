import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { SystemMetricsEndpointService } from "@/features/system/system-metrics-endpoint-service.ts";
import { authedRouteResponse } from "@/http/router-helpers.ts";

export const systemMetricsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/metrics",
    authedRouteResponse(
      Effect.flatMap(SystemMetricsEndpointService, (service) => service.renderMetricsEndpoint()),
      (body) =>
        Effect.succeed(
          HttpServerResponse.text(body, {
            contentType: "text/plain; version=0.0.4; charset=utf-8",
          }),
        ),
    ),
  ),
);

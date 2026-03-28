import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { buildPrometheusMetricsResponse } from "./metrics-response.ts";
import { authedRouteResponse } from "./router-helpers.ts";
import { renderSystemMetricsBody } from "./system-metrics-route-support.ts";

export const systemMetricsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/metrics",
    authedRouteResponse(renderSystemMetricsBody(), (body) =>
      Effect.succeed(buildPrometheusMetricsResponse(body)),
    ),
  ),
);

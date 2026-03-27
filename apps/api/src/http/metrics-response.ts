import { HttpServerResponse } from "@effect/platform";

export function buildPrometheusMetricsResponse(body: string) {
  return HttpServerResponse.text(body, {
    contentType: "text/plain; version=0.0.4; charset=utf-8",
  });
}

import { HttpServerResponse } from "@effect/platform";

import type { HealthStatus } from "../../../../packages/shared/src/index.ts";

export interface HealthReadyResponse {
  readonly checks: { readonly database: boolean };
  readonly ready: boolean;
}

export function buildHealthLiveResponse() {
  return HttpServerResponse.json({ status: "alive" });
}

export function buildHealthReadyResponse(value: HealthReadyResponse) {
  return HttpServerResponse.json(value, { status: value.ready ? 200 : 503 });
}

export function buildHealthOkResponse() {
  return HttpServerResponse.json({ status: "ok" } satisfies HealthStatus);
}

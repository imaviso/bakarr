import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { Effect, Layer } from "effect";

import { AppConfig } from "@/app/config/schema.ts";
import { embeddedWebAssets } from "@/generated/embedded-web-assets.ts";
import { mediaRouter } from "@/features/media/router.ts";
import { authRouter } from "@/features/auth/router.ts";
import { createEmbeddedWebResponse, type EmbeddedWebAsset } from "@/infra/http/embedded-web.ts";
import { isAllowedHostHeader } from "@/infra/http/host-guard.ts";
import { downloadsRouter } from "@/features/operations/downloads-router.ts";
import { libraryRouter } from "@/features/operations/library-router.ts";
import { rssRouter } from "@/features/operations/rss-router.ts";
import { searchRouter } from "@/features/operations/search-router.ts";
import { systemRouter } from "@/features/system/http/router.ts";

const addPrefixed = <A, E, R>(
  prefix: string,
  routesLayer: Layer.Layer<A, E, R>,
): Layer.Layer<A, E, R | HttpRouter.HttpRouter> =>
  routesLayer.pipe(
    Layer.provide(
      Layer.effect(
        HttpRouter.HttpRouter,
        Effect.map(HttpRouter.HttpRouter, (router) => router.prefixed(prefix)),
      ),
    ),
  );

const spaFallbackRouter = (assets: Record<string, EmbeddedWebAsset>) =>
  HttpRouter.add(
    "*",
    "*",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const url = new URL(request.url, "http://bakarr.local");

      return createHttpAppFallbackResponse({
        assets,
        method: request.method,
        pathname: url.pathname,
      });
    }),
  );

export function createHttpApp(
  options: {
    readonly staticWebAssets?: Record<string, EmbeddedWebAsset>;
  } = {},
) {
  const staticWebAssets = options.staticWebAssets ?? embeddedWebAssets;

  const globalGuard = HttpRouter.middleware(
    (route) =>
      Effect.gen(function* () {
        // DNS-rebinding guard: reject attacker-chosen domain Host headers
        // before any route (including unauthenticated ones) runs.
        const request = yield* HttpServerRequest.HttpServerRequest;
        const config = yield* AppConfig;
        // Browsers always send Host on rebinding attempts, so the guard holds
        // where it matters. Missing Host (HTTP/1.0 or fetch spec hiding it in
        // `HttpServerRequest.fromWeb` tests) is allowed — rebinding cannot
        // occur without a Host, and enforcing it would break test conversions.
        // Empty Host is still rejected via isAllowedHostHeader.
        const host = request.headers["host"];

        if (host !== undefined && !isAllowedHostHeader(host, config.trustedHosts)) {
          return HttpServerResponse.empty({ status: 403 });
        }

        return yield* route;
      }),
    { global: true },
  );

  return Layer.mergeAll(
    addPrefixed("/api/auth", authRouter),
    addPrefixed("/api", mediaRouter),
    addPrefixed("/api", downloadsRouter),
    addPrefixed("/api", rssRouter),
    addPrefixed("/api", libraryRouter),
    addPrefixed("/api", searchRouter),
    systemRouter,
    spaFallbackRouter(staticWebAssets),
    globalGuard,
  );
}

export function createHttpAppFallbackResponse(input: {
  readonly assets: Record<string, EmbeddedWebAsset>;
  readonly method: string;
  readonly pathname: string;
}) {
  if (input.pathname.startsWith("/api/")) {
    return HttpServerResponse.empty({ status: 404 });
  }

  return createEmbeddedWebResponse({
    assets: input.assets,
    method: input.method,
    pathname: input.pathname,
  });
}

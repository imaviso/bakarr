import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { AppConfig } from "@/app/config/schema.ts";
import { embeddedWebAssets } from "@/generated/embedded-web-assets.ts";
import { mediaRouter } from "@/features/media/router.ts";
import { authRouter } from "@/http/auth/router.ts";
import { createEmbeddedWebResponse, type EmbeddedWebAsset } from "@/http/shared/embedded-web.ts";
import { isAllowedHostHeader } from "@/http/shared/host-guard.ts";
import { downloadsRouter } from "@/features/operations/downloads-router.ts";
import { libraryRouter } from "@/features/operations/library-router.ts";
import { rssRouter } from "@/features/operations/rss-router.ts";
import { searchRouter } from "@/features/operations/search-router.ts";
import { systemRouter } from "@/features/system/http/router.ts";

export function createHttpApp(
  options: {
    readonly staticWebAssets?: Record<string, EmbeddedWebAsset>;
  } = {},
) {
  const staticWebAssets = options.staticWebAssets ?? embeddedWebAssets;
  const operationsRouter = HttpRouter.concatAll(
    downloadsRouter,
    rssRouter,
    libraryRouter,
    searchRouter,
  );
  const apiRouter = HttpRouter.empty.pipe(
    HttpRouter.concat(HttpRouter.prefixAll(authRouter, "/api/auth")),
    HttpRouter.concat(HttpRouter.prefixAll(mediaRouter, "/api")),
    HttpRouter.concat(HttpRouter.prefixAll(operationsRouter, "/api")),
    HttpRouter.concat(systemRouter),
  );

  return apiRouter.pipe(
    HttpRouter.concat(spaFallbackRouter(staticWebAssets)),
    HttpRouter.use((route) =>
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
    ),
    HttpRouter.toHttpApp,
  );
}

function spaFallbackRouter(assets: Record<string, EmbeddedWebAsset>) {
  return HttpRouter.empty.pipe(
    HttpRouter.get(
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
    ),
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

import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { Effect, Layer } from "effect";

import { embeddedWebAssets } from "@/generated/embedded-web-assets.ts";
import { mediaRoutes } from "@/http/media/router.ts";
import { authRoutes } from "@/http/auth/router.ts";
import { createEmbeddedWebResponse, type EmbeddedWebAsset } from "@/http/shared/embedded-web.ts";
import { downloadsRoutes } from "@/http/operations/downloads-router.ts";
import { libraryRoutes } from "@/http/operations/library-router.ts";
import { rssRoutes } from "@/http/operations/rss-router.ts";
import { searchRoutes } from "@/http/operations/search-router.ts";
import { systemRoutes } from "@/http/system/router.ts";

export function createHttpApp(
  options: {
    readonly staticWebAssets?: Record<string, EmbeddedWebAsset>;
  } = {},
) {
  const staticWebAssets = options.staticWebAssets ?? embeddedWebAssets;
  const operationsRoutes = [...downloadsRoutes, ...rssRoutes, ...libraryRoutes, ...searchRoutes];

  const fallbackRoute = HttpRouter.route(
    "GET",
    "*",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const url = new URL(request.url, "http://bakarr.local");

      return createHttpAppFallbackResponse({
        assets: staticWebAssets,
        method: request.method,
        pathname: url.pathname,
      });
    }),
  );

  return HttpRouter.toHttpEffect(
    Layer.mergeAll(
      HttpRouter.addAll(authRoutes, { prefix: "/api/auth" }),
      HttpRouter.addAll([...mediaRoutes, ...operationsRoutes], { prefix: "/api" }),
      HttpRouter.addAll([...systemRoutes, fallbackRoute]),
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

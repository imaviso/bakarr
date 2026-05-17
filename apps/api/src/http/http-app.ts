import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { embeddedWebAssets } from "@/generated/embedded-web-assets.ts";
import { animeRouter } from "@/http/media/router.ts";
import { authRouter } from "@/http/auth/router.ts";
import { createEmbeddedWebResponse, type EmbeddedWebAsset } from "@/http/shared/embedded-web.ts";
import { downloadsRouter } from "@/http/operations/downloads-router.ts";
import { libraryRouter } from "@/http/operations/library-router.ts";
import { rssRouter } from "@/http/operations/rss-router.ts";
import { searchRouter } from "@/http/operations/search-router.ts";
import { systemRouter } from "@/http/system/router.ts";

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
    HttpRouter.concat(HttpRouter.prefixAll(animeRouter, "/api")),
    HttpRouter.concat(HttpRouter.prefixAll(operationsRouter, "/api")),
    HttpRouter.concat(systemRouter),
  );

  return apiRouter.pipe(
    HttpRouter.get(
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
    ),
    HttpRouter.toHttpApp,
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

import { HttpRouter, HttpServerRequest } from "@effect/platform";
import { Effect } from "effect";

import { embeddedWebAssets } from "@/generated/embedded-web-assets.ts";
import { animeRouter } from "@/http/anime-router.ts";
import { authRouter } from "@/http/auth-router.ts";
import { createEmbeddedWebResponse, type EmbeddedWebAsset } from "@/http/embedded-web.ts";
import { downloadsRouter } from "@/http/operations-downloads-router.ts";
import { libraryRouter } from "@/http/operations-library-router.ts";
import { rssRouter } from "@/http/operations-rss-router.ts";
import { searchRouter } from "@/http/operations-search-router.ts";
import { systemRouter } from "@/http/system-router.ts";

export function createHttpApp(
  options: {
    readonly staticWebAssets?: Record<string, EmbeddedWebAsset>;
  } = {},
) {
  const staticWebAssets = options.staticWebAssets ?? embeddedWebAssets;

  return HttpRouter.empty.pipe(
    HttpRouter.concat(HttpRouter.prefixAll(authRouter, "/api/auth")),
    HttpRouter.concat(HttpRouter.prefixAll(animeRouter, "/api")),
    HttpRouter.concat(
      HttpRouter.prefixAll(
        HttpRouter.concatAll(downloadsRouter, rssRouter, libraryRouter, searchRouter),
        "/api",
      ),
    ),
    HttpRouter.concat(systemRouter),
    HttpRouter.get(
      "*",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const url = new URL(request.url, "http://bakarr.local");

        return createEmbeddedWebResponse({
          assets: staticWebAssets,
          method: request.method,
          pathname: url.pathname,
        });
      }),
    ),
    HttpRouter.toHttpApp,
  );
}

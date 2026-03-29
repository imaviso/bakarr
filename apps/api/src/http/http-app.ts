import { HttpRouter } from "@effect/platform";

import { animeRouter } from "./anime-router.ts";
import { authRouter } from "./auth-router.ts";
import { downloadsRouter } from "./operations-downloads-router.ts";
import { libraryRouter } from "./operations-library-router.ts";
import { rssRouter } from "./operations-rss-router.ts";
import { searchRouter } from "./operations-search-router.ts";
import { createStaticHttpApp } from "./static.ts";
import { systemRouter } from "./system-router.ts";

export function createHttpApp() {
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
    HttpRouter.get("*", createStaticHttpApp()),
    HttpRouter.toHttpApp,
  );
}

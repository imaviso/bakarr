import { HttpRouter } from "@effect/platform";

import { animeRouter } from "./anime-router.ts";
import { authRouter } from "./auth-router.ts";
import { operationsRouter } from "./operations-router.ts";
import { createStaticHttpApp } from "./static.ts";
import { systemRouter } from "./system-router.ts";

export function createHttpApp() {
  return HttpRouter.empty.pipe(
    HttpRouter.concat(HttpRouter.prefixAll(authRouter, "/api/auth")),
    HttpRouter.concat(HttpRouter.prefixAll(animeRouter, "/api")),
    HttpRouter.concat(HttpRouter.prefixAll(operationsRouter, "/api")),
    HttpRouter.concat(systemRouter),
    HttpRouter.get("*", createStaticHttpApp()),
    HttpRouter.toHttpApp,
  );
}

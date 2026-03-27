import { HttpRouter } from "@effect/platform";

import { systemImageRouter } from "./system-image-router.ts";
import { configRouter } from "./system-config-router.ts";
import { healthRouter } from "./system-health-router.ts";
import { infoRouter } from "./system-info-router.ts";
import { logsRouter } from "./system-logs-router.ts";
import { runtimeRouter } from "./system-runtime-router.ts";

export const systemRouter = HttpRouter.concatAll(
  healthRouter,
  systemImageRouter,
  infoRouter,
  configRouter,
  logsRouter,
  runtimeRouter,
);

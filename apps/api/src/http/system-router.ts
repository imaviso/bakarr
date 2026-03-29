import { HttpRouter } from "@effect/platform";

import { systemImageRouter } from "@/http/system-image-router.ts";
import { configRouter } from "@/http/system-config-router.ts";
import { healthRouter } from "@/http/system-health-router.ts";
import { infoRouter } from "@/http/system-info-router.ts";
import { logsRouter } from "@/http/system-logs-router.ts";
import { runtimeRouter } from "@/http/system-runtime-router.ts";

export const systemRouter = HttpRouter.concatAll(
  healthRouter,
  systemImageRouter,
  infoRouter,
  configRouter,
  logsRouter,
  runtimeRouter,
);

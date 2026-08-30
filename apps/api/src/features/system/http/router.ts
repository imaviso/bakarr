import { HttpRouter } from "@effect/platform";

import { systemImageRouter } from "@/features/system/http/image-router.ts";
import { configRouter } from "@/features/system/http/config-router.ts";
import { healthRouter } from "@/features/system/http/health-router.ts";
import { infoRouter } from "@/features/system/http/info-router.ts";
import { logsRouter } from "@/features/system/http/logs-router.ts";
import { runtimeRouter } from "@/features/system/http/runtime-router.ts";

export const systemRouter = HttpRouter.concatAll(
  healthRouter,
  systemImageRouter,
  infoRouter,
  configRouter,
  logsRouter,
  runtimeRouter,
);

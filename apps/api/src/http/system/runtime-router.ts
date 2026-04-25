import { HttpRouter } from "@effect/platform";

import { systemEventsRouter } from "@/http/system/events-router.ts";
import { systemMetricsRouter } from "@/http/system/metrics-router.ts";
import { systemTasksRouter } from "@/http/system/tasks-router.ts";

export const runtimeRouter = HttpRouter.concatAll(
  systemTasksRouter,
  systemEventsRouter,
  systemMetricsRouter,
);

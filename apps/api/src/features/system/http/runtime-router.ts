import { HttpRouter } from "@effect/platform";

import { systemEventsRouter } from "@/features/system/http/events-router.ts";
import { systemMetricsRouter } from "@/features/system/http/metrics-router.ts";
import { systemTasksRouter } from "@/features/system/http/tasks-router.ts";

export const runtimeRouter = HttpRouter.concatAll(
  systemTasksRouter,
  systemEventsRouter,
  systemMetricsRouter,
);

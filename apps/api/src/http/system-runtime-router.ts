import { HttpRouter } from "@effect/platform";

import { systemEventsRouter } from "./system-events-router.ts";
import { systemMetricsRouter } from "./system-metrics-router.ts";
import { systemTasksRouter } from "./system-tasks-router.ts";

export const runtimeRouter = HttpRouter.concatAll(
  systemTasksRouter,
  systemEventsRouter,
  systemMetricsRouter,
);

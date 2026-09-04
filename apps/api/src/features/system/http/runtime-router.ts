import { systemEventsRouter } from "@/features/system/http/events-router.ts";
import { systemMetricsRouter } from "@/features/system/http/metrics-router.ts";
import { systemTasksRouter } from "@/features/system/http/tasks-router.ts";
import { Layer } from "effect";

export const runtimeRouter = Layer.mergeAll(
  systemTasksRouter,
  systemEventsRouter,
  systemMetricsRouter,
);

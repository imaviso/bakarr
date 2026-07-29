import { systemEventsRoutes } from "@/http/system/events-router.ts";
import { systemMetricsRoutes } from "@/http/system/metrics-router.ts";
import { systemTasksRoutes } from "@/http/system/tasks-router.ts";

export const runtimeRoutes = [...systemTasksRoutes, ...systemEventsRoutes, ...systemMetricsRoutes];

import { systemImageRoutes } from "@/http/system/image-router.ts";
import { configRoutes } from "@/http/system/config-router.ts";
import { healthRoutes } from "@/http/system/health-router.ts";
import { infoRoutes } from "@/http/system/info-router.ts";
import { logsRoutes } from "@/http/system/logs-router.ts";
import { runtimeRoutes } from "@/http/system/runtime-router.ts";

export const systemRoutes = [
  ...healthRoutes,
  ...systemImageRoutes,
  ...infoRoutes,
  ...configRoutes,
  ...logsRoutes,
  ...runtimeRoutes,
];

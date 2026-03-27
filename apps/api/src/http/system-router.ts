import { HttpRouter, HttpServerRequest } from "@effect/platform";
import { Effect } from "effect";

import { AnimeMutationService } from "../features/anime/service.ts";
import { EventBus } from "../features/events/event-bus.ts";
import {
  CatalogOrchestration,
  SearchOrchestration,
} from "../features/operations/operations-orchestration.ts";
import { ImageAssetService } from "../features/system/image-asset-service.ts";
import { MetricsService } from "../features/system/metrics-service.ts";
import { QualityProfileService } from "../features/system/quality-profile-service.ts";
import { ReleaseProfileService } from "../features/system/release-profile-service.ts";
import { SystemConfigService } from "../features/system/system-config-service.ts";
import { SystemDashboardService } from "../features/system/system-dashboard-service.ts";
import { SystemLogService } from "../features/system/system-log-service.ts";
import { SystemStatusService } from "../features/system/system-status-service.ts";
import { ClockService } from "../lib/clock.ts";
import { recordHttpRequestMetrics } from "../lib/metrics.ts";
import { setRuntimeLogLevel } from "../lib/logging.ts";
import { buildDownloadProgressResponse } from "./event-stream.ts";
import { IdParamsSchema } from "./common-request-schemas.ts";
import { buildImageAssetResponse } from "./image-asset-response.ts";
import {
  buildHealthLiveResponse,
  buildHealthOkResponse,
  buildHealthReadyResponse,
} from "./health-response.ts";
import { buildSystemLogsExportResponse } from "./system-logs-export.ts";
import { buildPrometheusMetricsResponse } from "./metrics-response.ts";
import {
  ConfigSchema,
  CreateReleaseProfileSchema,
  NameParamsSchema,
  QualityProfileSchema,
  SystemLogExportQuerySchema,
  SystemLogsQuerySchema,
  UpdateReleaseProfileSchema,
} from "./system-request-schemas.ts";
import {
  decodeJsonBody,
  decodeJsonBodyWithLabel,
  decodePathParams,
  decodeQuery,
  decodeQueryWithLabel,
  authedRouteResponse,
  jsonResponse,
  routeResponse,
  successResponse,
} from "./router-helpers.ts";

const healthRouter = HttpRouter.empty.pipe(
  HttpRouter.get("/health", buildHealthOkResponse()),
  HttpRouter.get("/api/system/health/live", buildHealthLiveResponse()),
  HttpRouter.get(
    "/api/system/health/ready",
    routeResponse(
      Effect.gen(function* () {
        yield* (yield* SystemStatusService).getSystemStatus();
        return { checks: { database: true }, ready: true };
      }).pipe(
        // Catch all known typed failures — any means not ready (fixes P2.8).
        Effect.catchAll(() => Effect.succeed({ checks: { database: false }, ready: false })),
      ),
      buildHealthReadyResponse,
    ),
  ),
  HttpRouter.get(
    "/api/system/status",
    authedRouteResponse(
      Effect.flatMap(SystemStatusService, (service) => service.getSystemStatus()),
      jsonResponse,
    ),
  ),
);

const infoRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/images/*",
    authedRouteResponse(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const { pathname } = new URL(request.url, "http://bakarr.local");
        const rawRelativePath = pathname.slice("/api/images/".length);
        return yield* (yield* ImageAssetService).resolveImageAsset(rawRelativePath);
      }),
      ({ bytes, filePath }) =>
        Effect.succeed(buildImageAssetResponse(Uint8Array.from(bytes), filePath)),
    ),
  ),
  HttpRouter.get(
    "/api/system/dashboard",
    authedRouteResponse(
      Effect.flatMap(SystemDashboardService, (service) => service.getDashboard()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/system/jobs",
    authedRouteResponse(
      Effect.flatMap(SystemStatusService, (service) => service.getJobs()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/library/stats",
    authedRouteResponse(
      Effect.flatMap(SystemStatusService, (service) => service.getLibraryStats()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/library/activity",
    authedRouteResponse(
      Effect.flatMap(SystemStatusService, (service) => service.getActivity()),
      jsonResponse,
    ),
  ),
);

const configRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/system/config",
    authedRouteResponse(
      Effect.flatMap(SystemConfigService, (service) => service.getConfig()),
      jsonResponse,
    ),
  ),
  HttpRouter.put(
    "/api/system/config",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBody(ConfigSchema);
        const updatedConfig = yield* (yield* SystemConfigService).updateConfig(body);
        yield* setRuntimeLogLevel(updatedConfig.general.log_level);
      }),
      successResponse,
    ),
  ),
  HttpRouter.get(
    "/api/profiles",
    authedRouteResponse(
      Effect.flatMap(QualityProfileService, (service) => service.listProfiles()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/profiles/qualities",
    authedRouteResponse(
      Effect.flatMap(QualityProfileService, (service) => service.listQualities()),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/api/profiles",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(QualityProfileSchema, "create quality profile");
        return yield* (yield* QualityProfileService).createProfile(body);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.put(
    "/api/profiles/:name",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(NameParamsSchema);
        const body = yield* decodeJsonBody(QualityProfileSchema);
        return yield* (yield* QualityProfileService).updateProfile(params.name, body);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/api/profiles/:name",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(NameParamsSchema);
        yield* (yield* QualityProfileService).deleteProfile(params.name);
      }),
      successResponse,
    ),
  ),
  HttpRouter.get(
    "/api/release-profiles",
    authedRouteResponse(
      Effect.flatMap(ReleaseProfileService, (service) => service.listReleaseProfiles()),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/api/release-profiles",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBody(CreateReleaseProfileSchema);
        return yield* (yield* ReleaseProfileService).createReleaseProfile(body);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.put(
    "/api/release-profiles/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBody(UpdateReleaseProfileSchema);
        yield* (yield* ReleaseProfileService).updateReleaseProfile(params.id, body);
      }),
      successResponse,
    ),
  ),
  HttpRouter.del(
    "/api/release-profiles/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* ReleaseProfileService).deleteReleaseProfile(params.id);
      }),
      successResponse,
    ),
  ),
);

const logsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/system/logs",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(SystemLogsQuerySchema, "system logs");
        return yield* (yield* SystemLogService).getLogs({
          endDate: query.end_date,
          eventType: query.event_type,
          level: query.level,
          page: query.page ?? 1,
          startDate: query.start_date,
        });
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/api/system/logs",
    authedRouteResponse(
      Effect.flatMap(SystemLogService, (service) => service.clearLogs()),
      successResponse,
    ),
  ),
  HttpRouter.get(
    "/api/system/logs/export",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQuery(SystemLogExportQuerySchema);
        const logs = yield* (yield* SystemLogService).getLogs({
          endDate: query.end_date,
          eventType: query.event_type,
          level: query.level,
          page: 1,
          pageSize: 10_000,
          startDate: query.start_date,
        });
        return { format: query.format ?? "json", logs };
      }),
      ({ format, logs }) => {
        return buildSystemLogsExportResponse(logs, format);
      },
    ),
  ),
);

const runtimeRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/api/system/tasks/scan",
    authedRouteResponse(
      Effect.flatMap(CatalogOrchestration, (service) => service.runLibraryScan()),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/api/system/tasks/rss",
    authedRouteResponse(
      Effect.flatMap(SearchOrchestration, (service) => service.runRssCheck()),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/api/system/tasks/metadata-refresh",
    authedRouteResponse(
      Effect.flatMap(AnimeMutationService, (service) => service.refreshMetadataForMonitoredAnime()),
      successResponse,
    ),
  ),
  HttpRouter.get(
    "/api/events",
    authedRouteResponse(
      Effect.gen(function* () {
        const downloads = yield* (yield* CatalogOrchestration).getDownloadProgress();
        const eventBus = yield* EventBus;
        return { downloads, eventBus };
      }),
      ({ downloads, eventBus }) =>
        Effect.succeed(buildDownloadProgressResponse(downloads, eventBus)),
    ),
  ),
  HttpRouter.get(
    "/api/metrics",
    authedRouteResponse(
      Effect.gen(function* () {
        const clock = yield* ClockService;
        const metricsService = yield* MetricsService;
        const startedAt = yield* clock.currentMonotonicMillis;
        yield* metricsService.renderPrometheusMetrics();
        const finishedAt = yield* clock.currentMonotonicMillis;

        yield* recordHttpRequestMetrics({
          durationMs: finishedAt - startedAt,
          method: "GET",
          route: "/api/metrics",
          status: 200,
        });

        return yield* metricsService.renderPrometheusMetrics();
      }),
      (body) => Effect.succeed(buildPrometheusMetricsResponse(body)),
    ),
  ),
);

export const systemRouter = HttpRouter.concatAll(
  healthRouter,
  infoRouter,
  configRouter,
  logsRouter,
  runtimeRouter,
);

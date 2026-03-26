import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Schema, Stream } from "effect";

import type {
  DownloadStatus,
  HealthStatus,
  NotificationEvent,
  SystemLog,
} from "../../../../packages/shared/src/index.ts";
import { NotificationEventSchema, SystemLogSchema } from "../../../../packages/shared/src/index.ts";
import { AnimeService } from "../features/anime/service.ts";
import { EventBus } from "../features/events/event-bus.ts";
import { DownloadService, LibraryService, RssService } from "../features/operations/service.ts";
import { ImageAssetService } from "../features/system/image-asset-service.ts";
import { MetricsService } from "../features/system/metrics-service.ts";
import { QualityProfileService } from "../features/system/quality-profile-service.ts";
import { ReleaseProfileService } from "../features/system/release-profile-service.ts";
import { SystemConfigService } from "../features/system/system-config-service.ts";
import { SystemDashboardService } from "../features/system/system-dashboard-service.ts";
import { SystemLogService } from "../features/system/system-log-service.ts";
import { SystemStatusService } from "../features/system/system-status-service.ts";
import {
  ConfigSchema,
  CreateReleaseProfileSchema,
  IdParamsSchema,
  NameParamsSchema,
  QualityProfileSchema,
  SystemLogExportQuerySchema,
  SystemLogsQuerySchema,
  UpdateReleaseProfileSchema,
} from "./request-schemas.ts";
import {
  decodeJsonBody,
  decodeJsonBodyWithLabel,
  decodePathParams,
  decodeQuery,
  decodeQueryWithLabel,
  jsonResponse,
  routeResponse,
  successResponse,
} from "./router-helpers.ts";
import { requireViewerFromHttpRequest } from "./route-auth.ts";
import { contentTypeForPath, escapeCsv } from "./route-fs.ts";

const NotificationEventJsonSchema = Schema.parseJson(NotificationEventSchema);
const encodeNotificationEvent = Schema.encodeSync(NotificationEventJsonSchema);
const SystemLogsJsonSchema = Schema.parseJson(Schema.Array(SystemLogSchema));
const encodeSystemLogs = Schema.encodeSync(SystemLogsJsonSchema);

const healthRouter = HttpRouter.empty.pipe(
  HttpRouter.get("/health", HttpServerResponse.json({ status: "ok" } satisfies HealthStatus)),
  HttpRouter.get("/api/system/health/live", HttpServerResponse.json({ status: "alive" })),
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
      (value) => HttpServerResponse.json(value, { status: value.ready ? 200 : 503 }),
    ),
  ),
  HttpRouter.get(
    "/api/system/status",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(SystemStatusService, (service) => service.getSystemStatus()),
      ),
      jsonResponse,
    ),
  ),
);

const infoRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/images/*",
    routeResponse(
      Effect.gen(function* () {
        yield* requireViewerFromHttpRequest();
        const request = yield* HttpServerRequest.HttpServerRequest;
        const { pathname } = new URL(request.url, "http://bakarr.local");
        const rawRelativePath = pathname.slice("/api/images/".length);
        return yield* (yield* ImageAssetService).resolveImageAsset(rawRelativePath);
      }),
      ({ bytes, filePath }) =>
        Effect.succeed(
          HttpServerResponse.uint8Array(Uint8Array.from(bytes), {
            contentType: contentTypeForPath(filePath),
            headers: { "Cache-Control": "public, max-age=31536000, immutable" },
          }),
        ),
    ),
  ),
  HttpRouter.get(
    "/api/system/dashboard",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(SystemDashboardService, (service) => service.getDashboard()),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/system/jobs",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(SystemStatusService, (service) => service.getJobs()),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/library/stats",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(SystemStatusService, (service) => service.getLibraryStats()),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/library/activity",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(SystemStatusService, (service) => service.getActivity()),
      ),
      jsonResponse,
    ),
  ),
);

const configRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/system/config",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(SystemConfigService, (service) => service.getConfig()),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.put(
    "/api/system/config",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const body = yield* decodeJsonBody(ConfigSchema);
          yield* (yield* SystemConfigService).updateConfig(body);
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.get(
    "/api/profiles",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(QualityProfileService, (service) => service.listProfiles()),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/profiles/qualities",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(QualityProfileService, (service) => service.listQualities()),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/api/profiles",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const body = yield* decodeJsonBodyWithLabel(
            QualityProfileSchema,
            "create quality profile",
          );
          return yield* (yield* QualityProfileService).createProfile(body);
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.put(
    "/api/profiles/:name",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(NameParamsSchema);
          const body = yield* decodeJsonBody(QualityProfileSchema);
          return yield* (yield* QualityProfileService).updateProfile(params.name, body);
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/api/profiles/:name",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(NameParamsSchema);
          yield* (yield* QualityProfileService).deleteProfile(params.name);
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.get(
    "/api/release-profiles",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(ReleaseProfileService, (service) => service.listReleaseProfiles()),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/api/release-profiles",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const body = yield* decodeJsonBody(CreateReleaseProfileSchema);
          return yield* (yield* ReleaseProfileService).createReleaseProfile(body);
        }),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.put(
    "/api/release-profiles/:id",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          const body = yield* decodeJsonBody(UpdateReleaseProfileSchema);
          yield* (yield* ReleaseProfileService).updateReleaseProfile(params.id, body);
        }),
      ),
      successResponse,
    ),
  ),
  HttpRouter.del(
    "/api/release-profiles/:id",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const params = yield* decodePathParams(IdParamsSchema);
          yield* (yield* ReleaseProfileService).deleteReleaseProfile(params.id);
        }),
      ),
      successResponse,
    ),
  ),
);

const logsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/system/logs",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
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
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/api/system/logs",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(SystemLogService, (service) => service.clearLogs()),
      ),
      successResponse,
    ),
  ),
  HttpRouter.get(
    "/api/system/logs/export",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
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
      ),
      ({ format, logs }) => {
        if (format === "csv") {
          const csv = [
            "id,level,event_type,message,created_at",
            ...logs.logs.map(
              (log) =>
                `${log.id},${log.level},${escapeCsv(log.event_type)},${escapeCsv(
                  log.message,
                )},${log.created_at}`,
            ),
          ].join("\n");
          return HttpServerResponse.text(csv, {
            contentType: "text/csv; charset=utf-8",
            headers: {
              "Content-Disposition": 'attachment; filename="bakarr-logs.csv"',
            },
          });
        }

        return HttpServerResponse.text(encodeSystemLogs([...logs.logs] satisfies SystemLog[]), {
          contentType: "application/json; charset=utf-8",
          headers: {
            "Content-Disposition": 'attachment; filename="bakarr-logs.json"',
          },
        });
      },
    ),
  ),
);

const runtimeRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/api/system/tasks/scan",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(LibraryService, (service) => service.runLibraryScan()),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/api/system/tasks/rss",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(RssService, (service) => service.runRssCheck()),
      ),
      successResponse,
    ),
  ),
  HttpRouter.post(
    "/api/system/tasks/metadata-refresh",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(AnimeService, (service) => service.refreshMetadataForMonitoredAnime()),
      ),
      successResponse,
    ),
  ),
  HttpRouter.get(
    "/api/events",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.gen(function* () {
          const downloads = yield* (yield* DownloadService).getDownloadProgress();
          const eventBus = yield* EventBus;
          return { downloads, eventBus };
        }),
      ),
      ({ downloads, eventBus }) =>
        Effect.succeed(
          HttpServerResponse.stream(buildEventsStream(downloads, eventBus), {
            contentType: "text/event-stream",
            headers: {
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          }),
        ),
    ),
  ),
  HttpRouter.get(
    "/api/metrics",
    routeResponse(
      Effect.zipRight(
        requireViewerFromHttpRequest(),
        Effect.flatMap(MetricsService, (service) => service.renderPrometheusMetrics()),
      ),
      (body) =>
        Effect.succeed(
          HttpServerResponse.text(body, {
            contentType: "text/plain; version=0.0.4; charset=utf-8",
          }),
        ),
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

function buildEventsStream(downloads: DownloadStatus[], eventBus: typeof EventBus.Service) {
  return Effect.gen(function* () {
    const encoder = new TextEncoder();
    const encodeSse = (payload: string) => encoder.encode(`${payload}\n\n`);
    const encodeNotificationSse = (event: NotificationEvent) =>
      encodeSse(`data: ${encodeNotificationEvent(event)}`);
    const subscription = yield* eventBus.subscribe();
    const initialEvents = Stream.fromIterable([
      encodeSse(": connected"),
      encodeNotificationSse({
        type: "DownloadProgress",
        payload: { downloads },
      }),
    ]);
    const liveEvents = Stream.merge(
      subscription.stream.pipe(Stream.map(encodeNotificationSse)),
      Stream.tick("15 seconds").pipe(Stream.as(encodeSse(": keep-alive"))),
    ).pipe(Stream.withSpan("http.events.stream"));

    return Stream.concat(initialEvents, liveEvents).pipe(Stream.ensuring(subscription.close));
  }).pipe(Stream.unwrap);
}

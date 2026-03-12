import { Effect } from "effect";
import type { Hono } from "hono";

import type { HealthStatus } from "../../../../packages/shared/src/index.ts";
import { EventBus } from "../features/events/event-bus.ts";
import { DownloadService, LibraryService, RssService } from "../features/operations/service.ts";
import { SystemService } from "../features/system/service.ts";
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
import type { AppVariables, RunEffect } from "./route-helpers.ts";
import {
  escapeCsv,
  parseQuery,
  runRoute,
  toConfig,
  toCreateReleaseProfileInput,
  toQualityProfile,
  toUpdateReleaseProfileInput,
  withJsonBody,
  withParams,
  withParamsAndBody,
  withQuery,
} from "./route-helpers.ts";

export function registerSystemRoutes(
  app: Hono<{ Variables: AppVariables }>,
  runEffect: RunEffect,
) {
  app.get("/health", (c) => c.json<HealthStatus>({ status: "ok" }));

  app.get("/api/system/health/live", (c) => c.json({ status: "alive" }));
  app.get(
    "/api/system/health/ready",
    (c) =>
      c.json({ checks: { database: true, qbittorrent: true }, ready: true }),
  );

  app.get(
    "/api/system/status",
    (c) =>
      runRoute(
        c,
        runEffect,
        Effect.flatMap(SystemService, (service) => service.getSystemStatus()),
        (value) => c.json(value),
      ),
  );

  app.get(
    "/api/system/dashboard",
    (c) =>
      runRoute(
        c,
        runEffect,
        Effect.flatMap(SystemService, (service) => service.getDashboard()),
        (value) => c.json(value),
      ),
  );

  app.get(
    "/api/system/jobs",
    (c) =>
      runRoute(
        c,
        runEffect,
        Effect.flatMap(SystemService, (service) => service.getJobs()),
        (value) => c.json(value),
      ),
  );

  app.get(
    "/api/library/stats",
    (c) =>
      runRoute(
        c,
        runEffect,
        Effect.flatMap(SystemService, (service) => service.getLibraryStats()),
        (value) => c.json(value),
      ),
  );

  app.get(
    "/api/library/activity",
    (c) =>
      runRoute(
        c,
        runEffect,
        Effect.flatMap(SystemService, (service) => service.getActivity()),
        (value) => c.json(value),
      ),
  );

  app.get(
    "/api/system/config",
    (c) =>
      runRoute(
        c,
        runEffect,
        Effect.flatMap(SystemService, (service) => service.getConfig()),
        (value) => c.json(value),
      ),
  );

  app.put("/api/system/config", (c) => {
    return runRoute(
      c,
      runEffect,
      withJsonBody(
        c,
        ConfigSchema,
        "system config",
        (body) =>
          Effect.flatMap(
            SystemService,
            (service) => service.updateConfig(toConfig(body)),
          ),
      ),
      () => c.json({ data: null, success: true }),
    );
  });

  app.get(
    "/api/profiles",
    (c) =>
      runRoute(
        c,
        runEffect,
        Effect.flatMap(SystemService, (service) => service.listProfiles()),
        (value) => c.json(value),
      ),
  );

  app.get(
    "/api/profiles/qualities",
    (c) =>
      runRoute(
        c,
        runEffect,
        Effect.flatMap(SystemService, (service) => service.listQualities()),
        (value) => c.json(value),
      ),
  );

  app.post("/api/profiles", (c) => {
    return runRoute(
      c,
      runEffect,
      withJsonBody(
        c,
        QualityProfileSchema,
        "create quality profile",
        (body) =>
          Effect.flatMap(
            SystemService,
            (service) => service.createProfile(toQualityProfile(body)),
          ),
      ),
      (value) => c.json(value),
    );
  });

  app.put("/api/profiles/:name", (c) => {
    return runRoute(
      c,
      runEffect,
      withParamsAndBody(
        c,
        NameParamsSchema,
        QualityProfileSchema,
        "update quality profile",
        (params, body) =>
          Effect.flatMap(
            SystemService,
            (service) =>
              service.updateProfile(params.name, toQualityProfile(body)),
          ),
      ),
      (value) => c.json(value),
    );
  });

  app.delete("/api/profiles/:name", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, NameParamsSchema, "delete quality profile", (params) =>
        Effect.flatMap(SystemService, (service) =>
          service.deleteProfile(params.name))),
      () =>
        c.json({ data: null, success: true }),
    ));

  app.get(
    "/api/release-profiles",
    (c) =>
      runRoute(
        c,
        runEffect,
        Effect.flatMap(
          SystemService,
          (service) => service.listReleaseProfiles(),
        ),
        (value) => c.json(value),
      ),
  );

  app.post("/api/release-profiles", (c) => {
    return runRoute(
      c,
      runEffect,
      withJsonBody(
        c,
        CreateReleaseProfileSchema,
        "create release profile",
        (body) =>
          Effect.flatMap(
            SystemService,
            (service) =>
              service.createReleaseProfile(toCreateReleaseProfileInput(body)),
          ),
      ),
      (value) => c.json(value),
    );
  });

  app.put("/api/release-profiles/:id", (c) => {
    return runRoute(
      c,
      runEffect,
      withParamsAndBody(
        c,
        IdParamsSchema,
        UpdateReleaseProfileSchema,
        "update release profile",
        (params, body) =>
          Effect.flatMap(
            SystemService,
            (service) =>
              service.updateReleaseProfile(
                params.id,
                toUpdateReleaseProfileInput(body),
              ),
          ),
      ),
      () => c.json({ data: null, success: true }),
    );
  });

  app.delete("/api/release-profiles/:id", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "delete release profile", (params) =>
        Effect.flatMap(SystemService, (service) =>
          service.deleteReleaseProfile(params.id))),
      () =>
        c.json({ data: null, success: true }),
    ));

  app.get("/api/system/logs", (c) =>
    runRoute(
      c,
      runEffect,
      withQuery(c, SystemLogsQuerySchema, "system logs", (query) =>
        Effect.flatMap(SystemService, (service) =>
          service.getLogs({
            endDate: query.end_date,
            eventType: query.event_type,
            level: query.level,
            page: query.page ?? 1,
            startDate: query.start_date,
          }))),
      (value) =>
        c.json(value),
    ));

  app.delete(
    "/api/system/logs",
    (c) =>
      runRoute(
        c,
        runEffect,
        Effect.flatMap(SystemService, (service) => service.clearLogs()),
        () => c.json({ data: null, success: true }),
      ),
  );

  app.get("/api/system/logs/export", async (c) => {
    const query = await runEffect(
      parseQuery(c, SystemLogExportQuerySchema, "export system logs"),
    );
    const format = query.format ?? "json";
    const logs = await runEffect(
      Effect.flatMap(SystemService, (service) =>
        service.getLogs({
          endDate: query.end_date,
          eventType: query.event_type,
          level: query.level,
          page: 1,
          pageSize: 10_000,
          startDate: query.start_date,
        })),
    );

    if (format === "csv") {
      const csv = [
        "id,level,event_type,message,created_at",
        ...logs.logs.map((log) =>
          `${log.id},${log.level},${escapeCsv(log.event_type)},${
            escapeCsv(log.message)
          },${log.created_at}`
        ),
      ].join("\n");
      return new Response(csv, {
        headers: {
          "Content-Disposition": 'attachment; filename="bakarr-logs.csv"',
          "Content-Type": "text/csv; charset=utf-8",
        },
      });
    }

    return new Response(JSON.stringify(logs.logs, null, 2), {
      headers: {
        "Content-Disposition": 'attachment; filename="bakarr-logs.json"',
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  });

  app.post("/api/system/tasks/scan", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.flatMap(LibraryService, (service) => service.runLibraryScan()),
      () => c.json({ data: null, success: true }),
    ));

  app.post("/api/system/tasks/rss", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.flatMap(RssService, (service) => service.runRssCheck()),
      () => c.json({ data: null, success: true }),
    ));

  app.get("/api/events", async (_c) => {
    const [stream, downloads] = await Promise.all([
      runEffect(
        Effect.flatMap(
          EventBus,
          (eventBus) => Effect.succeed(eventBus.stream()),
        ),
      ),
      runEffect(
        Effect.flatMap(
          DownloadService,
          (service) => service.getDownloadProgress(),
        ),
      ),
    ]);

    const encoder = new TextEncoder();
    const initial = encoder.encode(
      `data: ${
        JSON.stringify({ type: "DownloadProgress", payload: { downloads } })
      }\n\n`,
    );
    const combined = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(initial);
        const reader = stream.getReader();
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) {
              break;
            }
            controller.enqueue(next.value);
          }
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(combined, {
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      },
    });
  });

  app.get("/api/metrics", async (_c) => {
    const [status, stats, downloads] = await Promise.all([
      runEffect(
        Effect.flatMap(SystemService, (service) => service.getSystemStatus()),
      ),
      runEffect(
        Effect.flatMap(SystemService, (service) => service.getLibraryStats()),
      ),
      runEffect(
        Effect.flatMap(
          DownloadService,
          (service) => service.getDownloadProgress(),
        ),
      ),
    ]);

    const body = [
      "# TYPE bakarr_active_torrents gauge",
      `bakarr_active_torrents ${status.active_torrents}`,
      "# TYPE bakarr_pending_downloads gauge",
      `bakarr_pending_downloads ${status.pending_downloads}`,
      "# TYPE bakarr_total_anime gauge",
      `bakarr_total_anime ${stats.total_anime}`,
      "# TYPE bakarr_total_episodes gauge",
      `bakarr_total_episodes ${stats.total_episodes}`,
      "# TYPE bakarr_downloaded_episodes gauge",
      `bakarr_downloaded_episodes ${stats.downloaded_episodes}`,
      "# TYPE bakarr_missing_episodes gauge",
      `bakarr_missing_episodes ${stats.missing_episodes}`,
      "# TYPE bakarr_active_download_items gauge",
      `bakarr_active_download_items ${downloads.length}`,
    ].join("\n");

    return new Response(`${body}\n`, {
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      },
    });
  });
}

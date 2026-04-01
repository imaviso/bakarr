# API Architecture And Code Quality Review Plan - Fifteenth Pass

## Goal

Run a fifteenth architecture and code-quality pass against `apps/api` after the
fourteenth pass, strictly following `apps/api/EFFECT_GUIDE.md`, the local
`effect-ts` references, and the `code-review-expert` review checklists.

This pass keeps the alpha-stage hard path:

- unify duplicated task execution paths instead of preserving separate manual and
  scheduled worker codepaths
- make one background task own one lifecycle, one error boundary, and one
  observable outcome
- remove summary and status wrapper debt instead of layering more pass-through
  tags and services
- stop reloading and decoding runtime config on hot paths when a coherent
  runtime snapshot boundary is the better abstraction
- keep HTTP routes thin and push domain orchestration back behind canonical
  Effect services
- keep `/api` error boundaries explicit and never fall through to SPA responses
- keep platform core layers small and move feature-specific clients back to
  feature-owned bundles

## Review Basis

- `apps/api/EFFECT_GUIDE.md`
- `apps/api/CODE_REVIEW_FOURTEENTH_PASS_IMPLEMENTATION_PLAN.md`
- `/home/debian/.agents/skills/effect-ts/references/04-services-and-layers.md`
- `/home/debian/.agents/skills/effect-ts/references/06-error-handling.md`
- `/home/debian/.agents/skills/effect-ts/references/09-project-structure.md`
- `/home/debian/.agents/skills/code-review-expert/references/solid-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/code-quality-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/security-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/removal-plan.md`

## Scan Scope

- `apps/api/src/api-lifecycle-layers.ts`
- `apps/api/src/app-platform-runtime-core.ts`
- `apps/api/src/background-controller-core.ts`
- `apps/api/src/background-controller-live.ts`
- `apps/api/src/background-worker-jobs.ts`
- `apps/api/src/background-workers.ts`
- `apps/api/src/features/operations/**/*.ts`
- `apps/api/src/features/system/**/*.ts`
- `apps/api/src/http/**/*.ts`

## Current Snapshot

What is strong:

- the fourteenth pass landed bounded import scan probing, removed several
  wrapper services, and simplified major operations/system wiring
- `apps/api` was green on `bun run check` and `bun run test` at the end of the
  fourteenth-pass stabilization
- operations read/write boundaries are materially smaller than they were a few
  passes ago, and the codebase is still trending toward clearer ownership

What still smells:

- scheduled background work goes through serialized monitored execution, but
  manual HTTP task triggers still bypass that path entirely
- the `rss` worker is still two separate workflows with mismatched lifecycle
  ownership and failure reporting
- system summary reads still combine too many concerns in one module while also
  fanning out into many repeated count/config reads
- config decoding still happens repeatedly from the database on request and
  runtime hot paths
- at least one HTTP route still reaches down into domain dependencies and
  performs domain error translation itself
- the catch-all SPA fallback still appears able to swallow unknown `GET /api/*`
  requests
- the platform "core" runtime layer still knows about feature-specific network
  clients and token/signing concerns

## Findings

### P0 - Critical

None confirmed in this pass.

### P1 - High

1. `apps/api/src/http/system-tasks-router.ts:10`
   `apps/api/src/http/system-tasks-router.ts:31`
   `apps/api/src/background-workers.ts:46`
   `apps/api/src/background-workers.ts:64`
   `apps/api/src/background-workers.ts:114`
   `apps/api/src/background-workers.ts:188`
   - manual task routes call `runLibraryScan()`, `runRssCheck()`, and
     `refreshMetadataForMonitoredAnime()` directly.
   - scheduled workers do not call those services directly; they run through
     `withLockEffect(...)`, timeout enforcement, monitor updates, and skip-on-
     overlap serialization.
   - this means HTTP-triggered work can race with scheduled work, duplicate the
     same long-running operation, and bypass the monitor state the rest of the
     runtime relies on.

2. `apps/api/src/background-worker-jobs.ts:37`
   `apps/api/src/background-worker-jobs.ts:40`
   `apps/api/src/features/operations/background-search-rss-support.ts:40`
   `apps/api/src/features/operations/background-search-rss-support.ts:97`
   `apps/api/src/features/operations/background-search-missing-support.ts:71`
   `apps/api/src/features/operations/background-search-missing-support.ts:173`
   - the `rss` background job is still modeled as two independent effects:
     `runRssCheck()` and then `triggerSearchMissing()`.
   - only `runRssCheck()` owns RSS job start/success/failure persistence and RSS
     events, so the composite worker can report success for RSS and then fail in
     missing-search afterward.
   - one logical worker currently has split lifecycle ownership and an
     inconsistent observable outcome.

### P2 - Medium

1. `apps/api/src/features/system/system-summary-service.ts:84`
   `apps/api/src/features/system/system-summary-service.ts:210`
   `apps/api/src/features/system/system-status-service.ts:33`
   `apps/api/src/features/system/system-status-service.ts:60`
   `apps/api/src/features/system/system-dashboard-service.ts:24`
   `apps/api/src/features/system/system-dashboard-service.ts:34`
   `apps/api/src/features/system/metrics-service.ts:22`
   `apps/api/src/features/system/metrics-service.ts:56`
   - `SystemSummaryService` is now a broad read-model hub spanning status,
     library stats, activity, jobs, dashboard, and metrics inputs.
   - on top of that, `SystemStatusService` and `SystemDashboardService` are now
     mostly pass-through wrappers around the broad hub.
   - this weakens module ownership, increases change coupling, and adds tag/
     layer noise without reducing complexity at the HTTP edge.

2. `apps/api/src/features/system/system-summary-service.ts:95`
   `apps/api/src/features/system/system-summary-service.ts:100`
   `apps/api/src/features/system/system-summary-service.ts:119`
   `apps/api/src/features/system/system-summary-service.ts:125`
   `apps/api/src/features/system/system-summary-service.ts:159`
   `apps/api/src/features/system/system-summary-service.ts:178`
   `apps/api/src/features/system/repository/stats-repository.ts:17`
   `apps/api/src/features/system/repository/stats-repository.ts:132`
   - system summary endpoints still fan out into many small count queries and
     repeated snapshot assembly instead of using a few cohesive aggregate reads.
   - `/api/system/status`, `/api/system/dashboard`, and `/api/metrics` are all
     built from overlapping count/config/job-state fetches.
   - the code is readable, but it is not yet a cohesive read boundary and will
     keep causing duplicate query work as these surfaces evolve.

3. `apps/api/src/features/operations/repository/config-repository.ts:20`
   `apps/api/src/features/operations/repository/config-repository.ts:37`
   `apps/api/src/features/system/system-config-service.ts:30`
   `apps/api/src/features/system/system-config-service.ts:55`
   `apps/api/src/features/system/background-job-status-service.ts:40`
   `apps/api/src/features/system/background-job-status-service.ts:49`
   `apps/api/src/features/system/system-summary-service.ts:95`
   `apps/api/src/http/system-metrics-router.ts:13`
   `apps/api/src/http/system-metrics-router.ts:27`
   - runtime config is still repeatedly read and decoded from the database in
     multiple operations flows and system summary paths.
   - that duplicates config composition logic across operations and system
     boundaries and makes metrics/status endpoints pay repeated decode cost per
     request.
   - the codebase now has enough runtime control infrastructure that a scoped
     runtime config snapshot service is the cleaner boundary.

4. `apps/api/src/http/operations-library-router.ts:107`
   `apps/api/src/http/operations-library-router.ts:132`
   - the import scan route still pulls `Database`, `AniListClient`,
     `FileSystem`, and `MediaProbe` directly at the HTTP edge and performs local
     infrastructure error translation itself.
   - this is domain orchestration and dependency wiring in a router, which is
     directly against the guide's preference for thin route adapters and service-
     owned dependencies.
   - the fourteenth pass removed a wrapper-only service, but the hard-path next
     step is not to keep the route fat; it is to introduce a canonical import-
     scan boundary that genuinely owns the workflow.

5. `apps/api/src/http/http-app.ts:31`
   `apps/api/src/http/http-app.ts:43`
   - the catch-all `GET "*"` embedded-web fallback sits after the API routers
     and appears to handle unknown `GET /api/*` paths as SPA responses.
   - that collapses API 404 semantics into HTML/static handling and weakens the
     route error boundary for clients, tests, and monitoring.

### P3 - Low

1. `apps/api/src/app-platform-runtime-core.ts:35`
   `apps/api/src/app-platform-runtime-core.ts:80`
   `apps/api/src/api-lifecycle-layers.ts:23`
   `apps/api/src/api-lifecycle-layers.ts:65`
   - `makeAppPlatformCoreRuntimeLayer(...)` is still broader than "platform
     core" because it owns AniList, RSS, qBittorrent, SeaDex, and stream-token
     concerns.
   - root lifecycle wiring is better than before, but the boundary is still too
     feature-aware for a true reusable platform core.

2. `apps/api/src/background-worker-jobs.ts:28`
   `apps/api/src/background-worker-jobs.ts:64`
   - aside from the RSS composition issue, `BackgroundWorkerJobsLive` is mostly
     a pass-through adaptor over existing domain services.
   - once manual and scheduled task execution share one canonical runner, this
     file should either become the real task catalog/orchestrator or disappear.

## Security / Reliability Notes

- No new P0 security issue was confirmed in this pass.
- The highest runtime correctness risk is duplicated long-running work caused by
  manual task routes bypassing worker serialization and monitor updates.
- The highest lifecycle correctness risk is the split RSS/missing-search worker
  outcome, because job persistence and observable success do not line up with
  actual task completion.
- The highest request/runtime efficiency smell is repeated config reload/decode
  and repeated aggregate count fan-out on system summary surfaces.

## Safe Delete Candidates

### Safe To Remove Now

None confirmed without first landing the refactors below.

### Defer Until Refactor Lands

1. `apps/api/src/features/system/system-status-service.ts`
   - remove after routes consume focused summary/read services directly or after
     the service owns a narrower boundary than simple delegation
2. `apps/api/src/features/system/system-dashboard-service.ts`
   - remove after dashboard reads become their own canonical boundary rather
     than a pass-through wrapper over `SystemSummaryService`
3. `apps/api/src/features/system/system-summary-service.ts`
   - delete after splitting it into focused status/library/dashboard/activity
     read boundaries
4. `apps/api/src/background-worker-jobs.ts`
   - collapse after a canonical background task runner/catalog owns both manual
     and scheduled triggers

## Hard-Path Decisions

- Do not preserve separate manual and scheduled task execution paths when both
  should share the same serialization, timeout, and monitoring policy.
- Do not keep a worker modeled as multiple loosely chained workflows when one
  user-visible job should own one lifecycle and one result.
- Do not add more wrapper-only system services on top of a broad summary hub;
  either split the hub or delete the wrappers.
- Do not keep re-decoding runtime config from the database on hot paths when a
  scoped runtime snapshot boundary can make dependencies explicit and cheap.
- Do not keep HTTP routes pulling domain dependencies directly when the workflow
  deserves a real service boundary.
- Do not let `/api` requests fall through to SPA/static handling.
- Do not preserve a "core runtime" layer that knows feature-specific clients;
  move those concerns back to feature-owned bundles.
- Do not add compatibility shims, fallback wrappers, or migration aliases for
  deleted modules; this repo is still pre-release alpha.

## Concrete Implementation Plan

### Workstream 1 - Unify manual and scheduled background task execution

Target outcome: every long-running background task runs through one canonical
runner with shared serialization, timeout, monitor updates, and logging,
regardless of whether it is triggered by cron, interval, or HTTP.

Steps:

1. Introduce a canonical background task runner/catalog service that owns named
   task execution and wraps the existing `withLockEffect(...)` behavior.
2. Move HTTP task routes off direct domain-service calls and onto the same
   background task runner used by scheduled workers.
3. Keep timeout, skip-on-overlap, mark-started, mark-succeeded, and mark-failed
   behavior centralized in the runner rather than duplicated at route edges.
4. Make the runner the only place that knows how to trigger `library_scan`,
   `rss`, `metadata_refresh`, and `download_sync` work.
5. Add tests proving manual and scheduled triggers cannot run the same worker
   concurrently and that monitor state is identical for both paths.

### Workstream 2 - Make the RSS worker one real workflow

Target outcome: the `rss` worker owns one typed orchestration effect with one
job lifecycle, one event story, and one failure boundary.

Steps:

1. Introduce a canonical RSS background orchestration service that owns both RSS
   feed processing and the follow-up missing-search trigger in one workflow.
2. Move job start/success/failure persistence to the outer orchestration
   boundary so the final worker outcome reflects the full logical task.
3. Keep inner feed and missing-search helpers focused on their own domain work,
   but stop letting them independently define the final worker lifecycle.
4. Publish one coherent success/failure event path for the full worker.
5. Add tests covering: feed success plus missing-search failure, full success,
   and early RSS failure.

### Workstream 3 - Replace repeated config reloads with a runtime config snapshot boundary

Target outcome: runtime config is loaded and decoded through one canonical
service, reused across operations and system reads, and refreshed explicitly on
config update.

Steps:

1. Introduce a scoped `RuntimeConfigSnapshotService` or equivalent canonical
   boundary that returns the current normalized runtime config.
2. Move operations consumers off direct `loadRuntimeConfig(db)` calls where they
   are only asking for current runtime config.
3. Move system summary/job-status consumers off repeated `SystemConfigService`
   decode calls when they only need the current runtime snapshot.
4. Wire config updates to refresh or invalidate the runtime snapshot as part of
   `SystemConfigUpdateService.updateConfig(...)`.
5. Keep full persisted-config read/write services only for admin/configuration
   surfaces, not for hot-path runtime reads.
6. Add tests proving snapshot refresh after config update and no stale runtime
   behavior in worker scheduling or summary reads.

### Workstream 4 - Split broad system summary ownership and remove wrapper debt

Target outcome: system read boundaries become small and explicit, and wrapper-
only status/dashboard services disappear unless they earn their own ownership.

Steps:

1. Split `SystemSummaryService` into focused read services by boundary, likely:
   system status, library stats, activity/jobs, and dashboard/metrics inputs.
2. Delete or inline `SystemStatusService` and `SystemDashboardService` if they
   remain simple delegates after the split.
3. Keep `MetricsService` only if it still owns Prometheus rendering as a real
   boundary; otherwise collapse rendering closer to the focused read service that
   owns the data.
4. Update system feature layering so routes depend on the focused read services
   directly rather than on a broad summary hub.
5. Add tests around the focused read boundaries instead of one large summary
   service surface.

### Workstream 5 - Collapse system count fan-out into cohesive read models

Target outcome: dashboard, metrics, and status surfaces are powered by a small
set of cohesive aggregate queries instead of repeated count-by-count assembly.

Steps:

1. Replace clusters of `count*` helpers used together with grouped aggregate read
   functions that return the exact read model needed by status/dashboard/metrics.
2. Keep the repository boundary explicit and typed, but prefer one query per
   read model where practical over many one-field helpers.
3. Reuse shared aggregate reads between dashboard and metrics instead of
   rebuilding overlapping summaries independently.
4. Preserve readable SQL and typed return shapes; do not introduce generic query
   abstraction for its own sake.
5. Add tests for the new grouped read models and remove obsolete one-off helper
   tests if they stop representing a real boundary.

### Workstream 6 - Move import scan orchestration back behind a real service boundary

Target outcome: the import scan route becomes a thin adapter again, and import
scan dependencies/errors are owned by a canonical operations service.

Steps:

1. Introduce a real import-scan service only if it owns the workflow, its
   dependencies, and its error boundary rather than acting as a thin alias.
2. Move `Database`, `AniListClient`, `FileSystem`, and `MediaProbe` dependency
   acquisition out of `operations-library-router.ts` and into that boundary.
3. Keep route responsibilities limited to schema decoding and route-level error
   mapping.
4. Reuse the existing bounded scan policy and support helpers rather than adding
   another compatibility layer.
5. Add route/service tests proving the router no longer reaches into domain
   dependencies directly.

### Workstream 7 - Restore explicit API 404 boundaries

Target outcome: unknown `/api/*` requests return API-appropriate not-found
responses instead of embedded web responses.

Steps:

1. Gate the SPA fallback to non-`/api` paths only, or move static handling onto
   an explicit web router boundary.
2. Add tests for unknown `/api` `GET` requests and unknown non-API `GET`
   requests so the two boundaries stay intentionally distinct.
3. Keep the fix minimal and explicit; do not add heuristic path handling beyond
   preserving API/static separation.

### Workstream 8 - Shrink the platform core layer and feature-own external clients

Target outcome: `makeAppPlatformCoreRuntimeLayer(...)` becomes a true platform
core, while feature clients and feature-specific adapters are provided by
feature-owned layers.

Steps:

1. Split platform core concerns from feature client concerns in
   `app-platform-runtime-core.ts`.
2. Keep only runtime essentials in core: config provider support, runtime,
   database, logging, base HTTP client support, filesystem, and similar
   cross-feature infrastructure.
3. Move AniList, RSS, qBittorrent, SeaDex, and stream-token signer wiring into
   feature-owned bundles or clearly named edge bundles.
4. Simplify `api-lifecycle-layers.ts` so root composition depends on coarse
   stable feature exports rather than transitive feature-client detail.
5. Verify tests and startup wiring still provide each feature with the concrete
   clients it actually owns.

## Exit Criteria

- manual and scheduled background triggers use one canonical serialized runner
- the `rss` worker reports one coherent lifecycle and final outcome
- runtime config reads on hot paths go through one canonical snapshot boundary
- broad summary and wrapper-only system services are split or deleted
- status/dashboard/metrics reads use cohesive aggregate queries
- the import scan route is thin again
- unknown `/api/*` `GET` requests no longer fall through to the SPA response
- the platform core layer no longer owns feature-specific clients

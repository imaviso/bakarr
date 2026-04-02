# API Architecture And Code Quality Review Plan - Seventeenth Pass

## Goal

Run a seventeenth architecture and code-quality pass against `apps/api` after the
sixteenth pass, strictly following `apps/api/EFFECT_GUIDE.md`, the local
`effect-ts` references, and the `code-review-expert` review checklists.

This pass keeps the alpha-stage hard path:

- close infra policy at layer construction instead of threading runtime config or
  client details through orchestration APIs
- reduce hand-built layer graphs in favor of clearer canonical feature
  boundaries
- continue splitting broad modules that still have multiple reasons to change
- remove single-use generic abstractions and dead public surface instead of
  preserving wrapper debt
- keep HTTP routes limited to decode, auth, and response mapping, not local
  policy decisions

## Review Basis

- `apps/api/EFFECT_GUIDE.md`
- `apps/api/CODE_REVIEW_SIXTEENTH_PASS_IMPLEMENTATION_PLAN.md`
- `/home/debian/.agents/skills/effect-ts/references/04-services-and-layers.md`
- `/home/debian/.agents/skills/effect-ts/references/06-error-handling.md`
- `/home/debian/.agents/skills/effect-ts/references/09-project-structure.md`
- `/home/debian/.agents/skills/code-review-expert/references/solid-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/code-quality-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/security-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/removal-plan.md`

## Scan Scope

- `apps/api/src/api-lifecycle-layers.ts`
- `apps/api/src/app-platform-external-clients-layer.ts`
- `apps/api/src/background-controller-core.ts`
- `apps/api/src/background-controller-live.ts`
- `apps/api/src/background-task-runner.ts`
- `apps/api/src/background-workers.ts`
- `apps/api/src/features/system/**/*.ts`
- `apps/api/src/features/operations/**/*.ts`
- `apps/api/src/features/anime/**/*.ts`
- `apps/api/src/http/**/*.ts`
- `apps/api/src/lib/filesystem.ts`

## Current Snapshot

What is strong:

- the sixteenth pass materially improved the graph: runtime snapshot env leaks
  were closed at service construction, `BackgroundWorkerJobs` was deleted,
  stream/events/metrics routes are thinner, and stream token signing is no
  longer owned by the external-client layer
- import scan is now partially decomposed behind focused helper modules instead
  of one 552-line support file
- `apps/api` is green on `bun run --cwd apps/api check`, `bun run --cwd apps/api test`,
  and `bun run --cwd apps/api lint`

What still smells:

- qBittorrent integration still threads runtime-derived config through domain
  orchestration instead of closing base URL/auth/session policy in a configured
  client boundary
- lifecycle and feature composition still rely on nested `Layer.mergeAll(...)`
  plus `Layer.provide(...)` chains across several modules rather than mostly at
  one top-level app boundary
- some modules remain broad change magnets even after the sixteenth pass,
  especially filesystem, system reads, background worker policy, import-scan
  result shaping, and release ranking
- one route still pulls `ClockService` directly for calendar defaulting, so not
  all remaining HTTP policy has been moved behind feature-owned services
- a few wrapper or dead-surface APIs remain in background execution code

## Findings

### P0 - Critical

None confirmed in this pass.

### P1 - High

1. `apps/api/src/features/operations/qbittorrent.ts:21`
   `apps/api/src/features/operations/qbittorrent.ts:149`
   `apps/api/src/features/operations/background-search-queue-service.ts:27`
   `apps/api/src/features/operations/background-search-queue-service.ts:147`
   `apps/api/src/features/operations/download-trigger-service.ts:189`
   `apps/api/src/features/operations/operations-qbit-config.ts:5`
   - `QBitTorrentClient` still requires `QBitConfig` on every method call, and
     orchestration services still derive and thread that config manually.
   - this violates the Effect guide's preference to apply auth/base URL/session
     policy once in the layer and keep service methods small and closed over
     their dependencies
   - it also keeps feature code coupled to qBittorrent enablement policy,
     category selection, and credential wiring instead of depending on a
     narrower operations-owned torrent gateway

2. `apps/api/src/api-lifecycle-layers.ts:33`
   `apps/api/src/api-lifecycle-layers.ts:90`
   `apps/api/src/features/operations/operations-feature-layer.ts:31`
   `apps/api/src/features/operations/operations-feature-layer.ts:139`
   `apps/api/src/features/system/system-feature-layer.ts:17`
   `apps/api/src/features/system/system-feature-layer.ts:33`
   - feature/lifecycle composition is still hand-built across multiple modules
     with many intermediate `Layer.mergeAll(...)` and `Layer.provide(...)`
     chains
   - recent sixteenth-pass regressions proved this is not only stylistic debt:
     missing transitive provision caused real `Service not found` failures until
     the graph was re-closed manually
   - the current structure weakens the repo's “provide once near the boundary”
     rule and keeps ownership blurry between app lifecycle and feature modules

### P2 - Medium

1. `apps/api/src/lib/filesystem.ts:17`
   `apps/api/src/lib/filesystem.ts:176`
   `apps/api/src/lib/filesystem.ts:271`
   `apps/api/src/lib/filesystem.ts:294`
   - the filesystem boundary is still a broad compatibility layer mixing a
     generic file API, platform adaptation, path normalization, no-op test
     layers, path-root checks, segment sanitization, and filename sanitization
   - that gives one module many unrelated reasons to change and keeps a lot of
     wrapper surface alive where more focused Bakarr-specific boundaries would
     be clearer

2. `apps/api/src/features/system/system-read-service.ts:86`
   `apps/api/src/features/system/system-read-service.ts:206`
   `apps/api/src/features/system/metrics-service.ts:26`
   `apps/api/src/features/system/system-metrics-endpoint-service.ts:22`
   - `SystemReadService` still spans runtime config, disk space, background-job
     state, DB aggregates, activity shaping, dashboard shaping, and runtime
     metrics inputs
   - `MetricsService` and `SystemMetricsEndpointService` are now mostly thin
     wrappers layered on top of that broad service rather than owning a narrow,
     explicit read boundary
   - this remains a classic divergent-change hotspot: dashboard, status,
     metrics, and activity changes still land in the same service

3. `apps/api/src/features/operations/import-path-scan-support.ts:45`
   `apps/api/src/features/operations/import-path-scan-support.ts:225`
   `apps/api/src/features/operations/import-path-scan-result-support.ts:1`
   `apps/api/src/features/operations/import-path-scan-result-support.ts:220`
   - the sixteenth pass split import scan meaningfully, but the orchestration is
     still broad: candidate assembly, local-vs-remote matching, result shaping,
     library signal shaping, and naming-plan shaping are still concentrated in
     two large modules
   - `import-path-scan-result-support.ts` is already a new change magnet and
     likely needs another split by responsibility rather than being the new blob

4. `apps/api/src/background-workers.ts:34`
   `apps/api/src/background-workers.ts:104`
   `apps/api/src/background-workers.ts:180`
   `apps/api/src/background-workers.ts:272`
   - one module still owns worker scheduling, daemon spawning, timeout policy,
     monitor transitions, logging, and two near-duplicate lock wrappers
     (`withLockEffect` and `withLockEffectOrFail`)
   - this is broad orchestration with overlapping responsibilities and leaves
     more public surface than the runtime actually needs

5. `apps/api/src/background-controller-core.ts:6`
   `apps/api/src/background-controller-core.ts:114`
   `apps/api/src/background-controller-live.ts:11`
   `apps/api/src/background-controller-live.ts:31`
   - background controller lifecycle is still split into a generic
     `makeReloadableScopedController(...)` abstraction plus a very thin live
     wrapper module, even though the generic controller is only used for one
     background-worker lifecycle in `apps/api`
   - this is speculative abstraction/wrapper debt rather than a proven reusable
     boundary

6. `apps/api/src/features/operations/release-ranking.ts:1`
   `apps/api/src/features/operations/release-ranking.ts:573`
   - release ranking is still a large pure-policy module spanning title parsing,
     episode extraction, resolution/quality inference, size parsing, profile
     rule evaluation, and scoring/upgrade decisions
   - even without runtime dependencies, this remains a broad SRP violation and a
     likely source of shotgun surgery for search/download policy changes

### P3 - Low

1. `apps/api/src/http/operations-search-router.ts:42`
   `apps/api/src/http/operations-search-router.ts:49`
   - the calendar route still acquires `ClockService` directly just to supply the
     default start/end window
   - that is a small remaining HTTP-edge policy leak; the route should stay at
     decode/auth/response mapping while a feature-owned service owns calendar
     defaulting

2. `apps/api/src/background-task-runner.ts:31`
   `apps/api/src/background-task-runner.ts:88`
   `apps/api/src/background-workers.ts:104`
   - `BackgroundTaskRunner.runTaskByName` has no production callers, and
     `withLockEffect` is only consumed by tests while runtime code uses
     `withLockEffectOrFail`
   - this is small but real dead public surface that widens the maintenance
     contract of the background runtime without adding behavior

## Security / Reliability Notes

- No new P0 security issue was confirmed in this pass.
- The highest architecture correctness risk is still layer-graph drift:
  dependency closure is correct today, but the graph is still complex enough
  that small feature changes can reintroduce `Service not found` failures.
- The highest maintainability risk is still broad modules with many reasons to
  change: filesystem, system reads, background worker policy, import-scan
  result shaping, and release ranking.
- The main edge-boundary smell is now smaller than last pass, but the calendar
  route still owns time-default policy and qBittorrent policy still leaks out of
  its client layer.

## Safe Delete Candidates

### Safe To Remove Now

1. `apps/api/src/background-task-runner.ts`
   - remove `runTaskByName` if no production caller is intended; current scans
     found no consumer in `apps/api/src`

### Defer Until Refactor Lands

1. `apps/api/src/background-workers.ts`
   - remove or internalize `withLockEffect` after consolidating on one canonical
     lock helper shape and updating tests

2. `apps/api/src/background-controller-live.ts`
   - delete if the background controller is collapsed into one specific module
     and layer export instead of a generic core plus thin wrapper

3. `apps/api/src/features/operations/operations-qbit-config.ts`
   - remove after qBittorrent config is closed into a configured client/gateway
     layer and domain services no longer call `maybeQBitConfig(...)`

4. `apps/api/src/features/system/metrics-service.ts`
   - remove or collapse only after deciding the final narrower read boundary for
     runtime metrics and endpoint rendering

## Hard-Path Decisions

- Do not keep passing `QBitConfig` or `QBitConfig | null` through orchestration
  services when runtime config can be closed in a dedicated configured client or
  gateway layer.
- Do not keep broad cross-cutting wrappers like the current filesystem module if
  smaller Bakarr-specific boundaries or direct platform services produce cleaner
  ownership.
- Do not keep hand-built feature graphs spread across multiple feature modules
  when a clearer canonical feature layer can own its own transitive providers.
- Do not keep single-use generic controller abstractions if collapsing them into
  one background-specific boundary is simpler and clearer.
- Do not keep large pure-policy files intact just because they are pure; split
  them when they still have multiple unrelated reasons to change.
- Do not keep route adapters responsible for local policy such as “default to
  current time” when that logic belongs to a feature-owned service.
- Do not preserve dead task-runner or worker-helper surface in alpha.

## Concrete Implementation Plan

### Workstream 1 - Close qBittorrent policy in a configured gateway layer

Target outcome: operations services stop threading `QBitConfig` and
`maybeQBitConfig(...)`; qBittorrent auth/base URL/category/session policy is
closed once in a configured client or gateway layer.

Steps:

1. Audit every operations service that currently depends on `QBitConfig` or
   `maybeQBitConfig(...)`.
2. Introduce a narrower operations-owned torrent gateway or configured client
   service that reads runtime config internally and exposes a small API with
   closed methods.
3. Move disabled-client handling into that boundary instead of returning
   `QBitConfig | null` from orchestration helpers.
4. Remove `operations-qbit-config.ts` if no standalone config helper remains
   justified.
5. Update tests to prove queue/download/reconciliation flows run without
   manually threading qBittorrent config.

### Workstream 2 - Collapse hand-built layer graphs into stronger canonical feature layers

Target outcome: `api-lifecycle-layers.ts` becomes a thinner boundary assembly,
while operations/system features own more of their internal transitive provider
closure.

Steps:

1. Re-audit the current `api-lifecycle-layers.ts`,
   `operations-feature-layer.ts`, and `system-feature-layer.ts` provider chains.
2. Decide which transitive providers belong inside each feature export rather
   than in lifecycle assembly.
3. Collapse duplicated system dependency provision (`SystemConfigService`,
   `RuntimeConfigSnapshotService`, `BackgroundJobStatusService`) into clearer
   canonical feature-owned layers.
4. Keep reusable parameterized layers memoized by constructing them once.
5. Add explicit app-layer boot/wiring tests so future refactors catch missing
   provider edges immediately.

### Workstream 3 - Split system reads into narrower read boundaries

Target outcome: `SystemReadService` stops being the system change magnet, and
metrics rendering depends on a narrower runtime-metrics read seam.

Steps:

1. Split `SystemReadService` by responsibility: status/runtime, library stats,
   dashboard/activity, and runtime metrics inputs.
2. Decide whether `MetricsService` remains a real service or collapses into a
   narrower runtime-metrics read/render boundary.
3. Keep HTTP endpoint rendering in a service only if it owns meaningful edge
   policy; otherwise collapse thin wrapper layers.
4. Update system routes and tests to depend on the narrowed service boundaries.
5. Preserve one canonical system feature export after the split.

### Workstream 4 - Finish import-scan decomposition

Target outcome: import scan remains behind `ImportPathScanService`, but the
remaining broad orchestration/result-shaping modules are split into smaller,
single-reason units.

Steps:

1. Split candidate assembly and local-vs-remote matching from
   `import-path-scan-support.ts`.
2. Split `import-path-scan-result-support.ts` into smaller seams such as
   existing-library signal shaping, naming-plan shaping, and episode-row
   selection/indexing.
3. Keep `ImportPathScanService` as the orchestration boundary and avoid adding
   new thin wrappers that only forward calls.
4. Add focused tests around the new extracted seams and trim tests that only
   target obsolete broad modules.
5. Re-check scan flow readability so the main orchestration still reads clearly
   in `Effect.gen(...)` form.

### Workstream 5 - Simplify background execution boundaries

Target outcome: background scheduling, lock/timeout policy, and controller
lifecycles become smaller and more explicit, with dead public surface removed.

Steps:

1. Collapse duplicate lock helpers in `background-workers.ts` into one canonical
   helper with explicit failure behavior.
2. Split scheduling/supervision from lock/monitor policy if that yields cleaner
   module boundaries.
3. Decide whether `makeReloadableScopedController(...)` should survive; if it is
   still single-use, inline the background-specific lifecycle instead of keeping
   a generic abstraction.
4. Remove `runTaskByName` if named task dispatch is not the real runtime API.
5. Update background tests to target the final seams directly.

### Workstream 6 - Decompose release ranking into focused policy modules

Target outcome: release parsing, quality catalog, profile/rule evaluation, and
score/upgrade policy live in separate focused modules with a small facade where
needed.

Steps:

1. Split filename/title parsing from quality/resolution inference.
2. Isolate the quality catalog and source/rank helpers from decision logic.
3. Split score calculation and upgrade policy from parse helpers.
4. Preserve existing HTTP/service contracts while moving internal seams.
5. Add focused tests per extracted seam so policy behavior stays stable during
   future changes.

### Workstream 7 - Thin the last route-edge policy leak

Target outcome: the calendar route no longer acquires `ClockService` directly.

Steps:

1. Move calendar default window policy into a feature-owned read service.
2. Keep `operations-search-router.ts` limited to decode/auth/response mapping.
3. Add or update route/service tests proving the edge no longer needs
   `ClockService` directly.

## Exit Criteria

- qBittorrent config is no longer threaded through operations orchestration or
  service inputs
- feature-layer composition is simpler, with more transitive closure owned by
  canonical feature layers and fewer hand-built provider chains
- `SystemReadService` is split into narrower read boundaries, and metrics no
  longer depend on broad wrapper layering without a clear seam
- import scan is further decomposed so no single support module remains a broad
  result-shaping hub
- background scheduling/controller code no longer keeps duplicate lock helpers,
  dead task surface, or a single-use generic controller abstraction unless it
  proves necessary
- release ranking is split into smaller focused policy modules
- the remaining calendar route no longer acquires infra directly for defaulting

## Implementation Status

This plan is now implemented in the current branch.

Completed work by workstream:

- Workstream 1 (qBittorrent policy closure): completed with
  `apps/api/src/features/operations/torrent-client-service.ts`, operations wiring
  updates, and deletion of
  `apps/api/src/features/operations/operations-qbit-config.ts`.
- Workstream 2 (layer composition simplification): completed by consolidating
  canonical system runtime core layering, simplifying lifecycle wiring in
  `apps/api/src/api-lifecycle-layers.ts`, and adding explicit lifecycle boot
  wiring test in `apps/api/src/api-lifecycle-layers_test.ts`.
- Workstream 3 (system read split): completed by introducing focused read seams
  (`system-status-read-service`, `system-library-stats-read-service`,
  `system-activity-read-service`, `system-dashboard-read-service`,
  `system-runtime-metrics-service`), reducing `system-read-service` to an
  orchestration facade, and removing the thin `metrics-service` wrapper.
- Workstream 4 (import-scan decomposition): completed by splitting
  import-scan result responsibilities into dedicated modules:
  `import-path-scan-episode-support.ts`,
  `import-path-scan-mapping-support.ts`, and
  `import-path-scan-naming-support.ts`.
- Workstream 5 (background runtime simplification): completed by removing
  duplicate lock helper surface (`withLockEffect`), removing dead
  `runTaskByName`, collapsing background controller live/core split into
  `background-controller-core.ts`, and deleting
  `background-controller-live.ts`.
- Workstream 6 (release ranking decomposition): completed by splitting
  release-ranking into focused modules:
  `release-ranking-types.ts`, `release-ranking-parse.ts`,
  `release-ranking-quality.ts`, `release-ranking-policy.ts`, with
  `release-ranking.ts` as a small facade.
- Workstream 7 (calendar route policy leak): completed by moving default window
  policy into `CatalogLibraryReadService.getCalendarWithDefaults(...)` and
  removing direct `ClockService` usage from
  `apps/api/src/http/operations-search-router.ts`.

Validation:

- `bun run --cwd apps/api check` passes.
- `bun run --cwd apps/api test` passes.
- `bun run --cwd apps/api lint` passes.

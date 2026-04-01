# API Architecture And Code Quality Review Plan - Sixteenth Pass

## Goal

Run a sixteenth architecture and code-quality pass against `apps/api` after the
fifteenth pass, strictly following `apps/api/EFFECT_GUIDE.md`, the local
`effect-ts` references, and the `code-review-expert` review checklists.

This pass keeps the alpha-stage hard path:

- close service dependencies at layer construction instead of leaking `R`
  requirements through service APIs
- remove orchestration-time `Effect.provide(...)` / `Effect.provideService(...)`
  patches where the real fix is a better layer boundary
- prefer one canonical feature layer per area over large hand-wired layer graphs
- keep HTTP routes thin and move remaining infra/event/stream orchestration
  behind explicit services
- keep platform core and edge/client layers narrowly owned and named by intent
- remove wrapper-only tags, de-exports, and compatibility helpers instead of
  preserving them

## Review Basis

- `apps/api/EFFECT_GUIDE.md`
- `apps/api/CODE_REVIEW_FIFTEENTH_PASS_IMPLEMENTATION_PLAN.md`
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
- `apps/api/src/app-platform-external-clients-layer.ts`
- `apps/api/src/background-controller-core.ts`
- `apps/api/src/background-controller-live.ts`
- `apps/api/src/background-task-runner.ts`
- `apps/api/src/background-worker-jobs.ts`
- `apps/api/src/background-workers.ts`
- `apps/api/src/features/anime/**/*.ts`
- `apps/api/src/features/operations/**/*.ts`
- `apps/api/src/features/system/**/*.ts`
- `apps/api/src/http/**/*.ts`

## Current Snapshot

What is strong:

- the fifteenth pass materially improved the codebase: manual and scheduled
  background execution now share one runner, the RSS worker owns one lifecycle,
  runtime config snapshotting exists, import scan moved behind a real service,
  and broad system summary wrappers were removed
- `apps/api` is green on `bun run check`, `bun run lint:api`, and
  `bun run test:api`
- `/api` fallback separation is explicit again, and platform core is smaller
  than it was before the external-client split

What still smells:

- multiple service APIs still expose `R = RuntimeConfigSnapshotService`, which
  directly violates the local guide's preference for `R = never` service methods
  and forces orchestration code to patch environments at call sites
- feature layer composition is still heavily hand-wired through large
  `Layer.mergeAll(...).pipe(Layer.provide(...))` graphs, including a
  layer-as-parameter `makeSystemFeatureLive(...)` factory
- `BackgroundWorkerJobs` still exists mostly as a pass-through task catalog even
  after the canonical task runner landed
- import scan is no longer routed from HTTP directly, but the underlying support
  module is still a large orchestration blob with many reasons to change
- several HTTP routes still pull infra/event/clock/filesystem dependencies at
  the route edge instead of staying fully feature-thin
- the external client layer still owns `StreamTokenSignerLive`, which is not an
  external client and duplicates core support concerns

## Findings

### P0 - Critical

None confirmed in this pass.

### P1 - High

1. `apps/api/src/background-task-runner.ts:45`
   `apps/api/src/background-task-runner.ts:47`
   `apps/api/src/background-task-runner.ts:75`
   `apps/api/src/background-worker-jobs.ts:14`
   `apps/api/src/background-worker-jobs.ts:33`
   `apps/api/src/features/anime/anime-enrollment-service.ts:46`
   `apps/api/src/features/operations/catalog-download-command-service.ts:15`
   `apps/api/src/features/operations/download-trigger-service.ts:44`
   `apps/api/src/features/operations/search-orchestration-release-search.ts:47`
   `apps/api/src/features/operations/search-orchestration-episode-support.ts:24`
   `apps/api/src/features/operations/background-search-rss-worker-service.ts:21`
   - service methods still leak `RuntimeConfigSnapshotService` through their
     `Effect` requirements instead of closing that dependency while building the
     live layer
   - `BackgroundTaskRunner` now compensates by calling
     `Effect.provideService(RuntimeConfigSnapshotService, ...)` at execution time
     for each worker task
   - this is precisely the Effect guide anti-pattern: dependencies are not being
     satisfied at layer boundaries, so orchestration code carries environment
     patching and wider error surfaces than it should

### P2 - Medium

1. `apps/api/src/api-lifecycle-layers.ts:33`
   `apps/api/src/api-lifecycle-layers.ts:73`
   `apps/api/src/features/operations/operations-feature-layer.ts:31`
   `apps/api/src/features/operations/operations-feature-layer.ts:145`
   `apps/api/src/features/system/system-feature-layer.ts:15`
   `apps/api/src/features/system/system-feature-layer.ts:47`
   - lifecycle composition is still a large, hand-wired dependency graph with
     many intermediate bundles and nested `Layer.provide(...)` / `mergeAll(...)`
     steps
   - `makeSystemFeatureLive(...)` takes layers as input instead of exporting one
     canonical feature layer that simply consumes service tags
   - this makes ownership hard to see, increases shotgun-surgery risk when one
     dependency shifts, and weakens the repo's “provide once near the boundary”
     guideline

2. `apps/api/src/background-worker-jobs.ts:14`
   `apps/api/src/background-worker-jobs.ts:74`
   - `BackgroundWorkerJobs` is still mostly a wrapper-only tag that renames and
     forwards calls to other services
   - after the fifteenth-pass runner/catalog refactor, this module no longer
     appears to own a meaningful policy boundary of its own
   - keeping it adds graph width, another public contract, and another place for
     task env/error signatures to drift

3. `apps/api/src/features/operations/import-path-scan-support.ts:36`
   `apps/api/src/features/operations/import-path-scan-support.ts:552`
   `apps/api/src/features/operations/import-path-scan-service.ts:31`
   `apps/api/src/features/operations/import-path-scan-service.ts:66`
   - import scan now has a proper service boundary, but the underlying workflow
     still lives in one very large support module spanning path validation,
     bounded scanning, media probing, episode mapping lookups, AniList
     candidate search, local-vs-remote matching, and naming-plan assembly
   - this is still a broad orchestration hub with multiple reasons to change,
     only now hidden one layer deeper from the router
   - the next hard-path step is to split this support module by responsibility,
     not to keep adding service wrappers around it

4. `apps/api/src/features/system/system-read-service.ts:86`
   `apps/api/src/features/system/system-read-service.ts:206`
   `apps/api/src/features/system/metrics-service.ts:26`
   `apps/api/src/features/system/metrics-service.ts:60`
   - `SystemReadService` is still a broad orchestration module spanning runtime,
     config, disk space, job state, DB aggregates, and presentation shaping for
     status/dashboard/metrics inputs
   - `MetricsService` is now mostly a thin rendering wrapper on top of that broad
     read service
   - the fifteenth pass removed the older summary wrappers, but this module is
     still a likely change magnet and the metrics boundary may still be too thin
     to justify its own service

5. `apps/api/src/http/system-events-router.ts:13`
   `apps/api/src/http/system-events-router.ts:20`
   `apps/api/src/http/system-metrics-router.ts:13`
   `apps/api/src/http/system-metrics-router.ts:27`
   `apps/api/src/http/anime-stream-router.ts:17`
   `apps/api/src/http/anime-stream-router.ts:39`
   - several routes still pull infra or event-streaming details directly at the
     HTTP edge: `EventBus`, `ClockService`, `FileSystem`, and file streaming
     helpers
   - those adapters are thinner than they used to be, but they still own more
     than schema decoding and HTTP response mapping
   - the remaining hard-path cleanup is to move SSE bootstrap, metrics timing,
     and authorized stream file access / file-open concerns behind explicit
     feature-owned boundaries

6. `apps/api/src/app-platform-external-clients-layer.ts:11`
   `apps/api/src/app-platform-external-clients-layer.ts:23`
   `apps/api/src/app-platform-external-clients-layer.ts:46`
   `apps/api/src/http/stream-token-signer.ts:35`
   - the external-client layer still owns `StreamTokenSignerLive`, which is not
     an external client and belongs closer to the anime/stream HTTP edge
   - that layer also recreates support concerns (`ClockServiceLive`,
     `FetchHttpClient.layer`, `RandomServiceLive`) that the runtime core already
     owns in adjacent wiring
   - this keeps platform/edge ownership blurry and makes test override behavior
     less obvious than it should be

### P3 - Low

1. `apps/api/src/features/operations/repository/config-repository.ts:40`
   `apps/api/src/features/operations/repository/config-repository.ts:46`
   - `loadRuntimeConfigSnapshot()` is an exported wrapper over
     `RuntimeConfigSnapshotService.getRuntimeConfig()` with no remaining
     callsites in `apps/api/src`
   - it is now dead compatibility surface and safe to remove

2. `apps/api/src/features/operations/operations-feature-layer.ts:45`
   `apps/api/src/features/operations/operations-feature-layer.ts:87`
   `apps/api/src/features/operations/operations-feature-layer.ts:105`
   `apps/api/src/features/operations/operations-feature-layer.ts:124`
   `apps/api/src/features/operations/operations-feature-layer.ts:133`
   - several intermediate bundle constants are exported even though they appear
     to be consumed only within the same module
   - that is minor, but it still widens the public surface of the feature-layer
     file without adding a real reusable boundary

## Security / Reliability Notes

- No new P0 security issue was confirmed in this pass.
- The highest architecture correctness risk is hidden dependency leakage from
  service APIs, because it makes orchestration order and layer provision matter
  in places where service methods should already be closed over their runtime
  requirements.
- The highest maintainability risk is broad, hand-built layer composition in
  `api-lifecycle-layers.ts`, `operations-feature-layer.ts`, and
  `system-feature-layer.ts`, because small dependency changes can trigger
  widespread graph rewiring.
- The highest runtime reliability smell at the HTTP edge is that SSE / metrics /
  streaming adapters still reach into infra directly instead of delegating to
  stable feature-owned boundaries.
- Secondary reliability note: the in-memory stream signing secret still means a
  process restart invalidates all outstanding stream URLs; that may be
  acceptable for alpha, but it remains an intentional operational constraint.

## Safe Delete Candidates

### Safe To Remove Now

1. `apps/api/src/features/operations/repository/config-repository.ts`
   - remove `loadRuntimeConfigSnapshot()`; no remaining callsites were found in
     `apps/api/src`

2. `apps/api/src/features/operations/operations-feature-layer.ts`
   - de-export these internal-only bundle constants if no external consumers are
     intended:
   - `OperationsDownloadBundleLive`
   - `OperationsBackgroundSearchBundleLive`
   - `OperationsSearchBundleLive`
   - `OperationsLibraryBundleLive`
   - `OperationsRuntimeBundleLive`

### Defer Until Refactor Lands

1. `apps/api/src/background-worker-jobs.ts`
   - remove after task ownership is either absorbed into `BackgroundTaskRunner`
     or replaced by a catalog that owns real task policy instead of delegation

2. `apps/api/src/features/system/system-feature-layer.ts`
   - remove the `makeSystemFeatureLive(...)` factory shape after system feature
     wiring is closed over tags instead of prebuilt layers

3. `apps/api/src/features/system/metrics-service.ts`
   - remove or collapse only after deciding whether Prometheus rendering remains
     a real boundary or should move closer to a narrower system read boundary

## Hard-Path Decisions

- Do not keep service methods exposing `RuntimeConfigSnapshotService` or similar
  environment requirements when those dependencies can be closed in the live
  layer.
- Do not keep orchestration-time `Effect.provide(...)` / `Effect.provideService(...)`
  patches in app code when the real fix is dependency satisfaction at layer
  construction.
- Do not preserve `BackgroundWorkerJobs` if it remains a wrapper-only tag.
- Do not treat “moved behind a service” as sufficient if the underlying module
  still owns too many unrelated steps; split the module instead.
- Do not keep route adapters that own infra/event/filesystem orchestration when
  the workflow deserves a feature boundary.
- Do not let the external-client layer own non-client edge services such as
  stream-token signing.
- Do not preserve dead helper exports or compatibility wrappers in alpha.

## Concrete Implementation Plan

### Workstream 1 - Close runtime snapshot dependencies at layer boundaries

Target outcome: service APIs return `R = never` wherever they currently leak
`RuntimeConfigSnapshotService`, and orchestration code no longer patches the
runtime snapshot into worker effects at call time.

Steps:

1. Audit every service shape that currently exposes
   `RuntimeConfigSnapshotService` in a method signature.
2. Refactor those services so they capture `RuntimeConfigSnapshotService`
   inside `Layer.effect(...)` construction and expose closed methods.
3. Remove `Effect.provideService(RuntimeConfigSnapshotService, ...)` from
   `background-task-runner.ts`.
4. Re-tighten downstream service and worker error unions after the env leak is
   removed.
5. Add tests around the refactored services and runner to prove they execute
   without extra runtime requirements.

### Workstream 2 - Collapse background task wrapper debt

Target outcome: background task ownership lives in one clear place, and
`BackgroundWorkerJobs` is either deleted or upgraded into a real task catalog.

Steps:

1. Decide whether `BackgroundTaskRunner` should own the canonical task catalog
   directly or whether a smaller task-catalog service meaningfully adds policy.
2. If no real policy boundary exists, inline `BackgroundWorkerJobs` into the
   runner and delete the wrapper tag/layer.
3. If a catalog remains, shrink it so it owns only task selection and closed
   task construction, not pure delegation.
4. Rewire background controller / lifecycle composition to remove the extra
   wrapper layer.
5. Add tests proving the runner still handles named task dispatch and
   serialization correctly after the collapse.

### Workstream 3 - Replace hand-built feature graphs with canonical feature layers

Target outcome: operations and system feature composition become clearer,
smaller, and closer to “provide once near the boundary” instead of many nested
bundle constants and layer-as-parameter factories.

Steps:

1. Simplify `api-lifecycle-layers.ts` so it composes fewer coarse feature
   exports and fewer ad hoc intermediate bundles.
2. Convert `makeSystemFeatureLive(...)` back into a canonical feature layer that
   consumes service tags instead of taking prebuilt layers as arguments.
3. Review `operations-feature-layer.ts` and collapse internal bundle exports that
   do not represent reusable boundaries.
4. Preserve memoization by constructing reusable parameterized layers once.
5. Add or update wiring tests to keep the app layer boot graph explicit and
   stable.

### Workstream 4 - Split import scan into focused workflow modules

Target outcome: import scan remains behind `ImportPathScanService`, but its
workflow is broken into smaller modules with one reason to change each.

Steps:

1. Split `scanImportPathEffect(...)` into focused helpers or modules for:
   path discovery / bounded scan, media enrichment, existing-library lookup,
   anime candidate assembly, and final result shaping.
2. Keep `ImportPathScanService` as the orchestration boundary that owns
   dependencies and error translation.
3. Avoid introducing thin wrapper helpers; each extracted module should own a
   coherent transformation or repository read model.
4. Preserve the existing bounded-scan policy and current HTTP contract.
5. Add focused unit tests for the newly split boundaries and trim broad tests
   that no longer map to a real seam.

### Workstream 5 - Thin remaining infra-aware HTTP routes

Target outcome: the remaining non-trivial routes depend on feature-owned service
boundaries rather than directly acquiring infra/event/filesystem concerns.

Steps:

1. Introduce a dedicated service for event-stream bootstrap if `/api/events`
   still needs both initial download state and live event subscription.
2. Move metrics timing / response body assembly behind a feature-owned boundary
   or explicit observability edge helper so the route stops pulling `ClockService`
   directly.
3. Re-evaluate the stream route and move any non-transport filesystem / file-open
   ownership behind the anime stream boundary if that produces a cleaner split.
4. Keep routes limited to decode, auth, and HTTP response mapping.
5. Add tests proving those routes no longer acquire infra services directly.

### Workstream 6 - Finish edge/client ownership cleanup

Target outcome: platform core, external-client wiring, and edge-specific
services each own only their real responsibilities.

Steps:

1. Remove `StreamTokenSignerLive` from `app-platform-external-clients-layer.ts`.
2. Re-home stream-token signing under the anime/stream feature or an explicitly
   named HTTP edge layer.
3. Stop recreating support layers inside the external-client bundle when the
   runtime core already owns them.
4. Re-check test override ergonomics so client and edge service replacements are
   still explicit and local.
5. Update lifecycle wiring to reflect the final ownership split cleanly.

### Workstream 7 - Remove dead helpers and narrow public surfaces

Target outcome: stale compatibility wrappers and unnecessary exports are gone.

Steps:

1. Delete `loadRuntimeConfigSnapshot()` from `config-repository.ts`.
2. De-export internal-only operations bundle constants that are not meant to be
   public feature boundaries.
3. Re-scan for any new dead wrapper helpers created during the fifteenth pass.
4. Keep deletion minimal and immediate; do not preserve aliases or fallback
   exports.

## Exit Criteria

- service methods no longer leak `RuntimeConfigSnapshotService` through `R`
  requirements where the live layer can close that dependency
- `background-task-runner.ts` no longer patches runtime snapshot services into
  worker effects at execution time
- `BackgroundWorkerJobs` is deleted or reduced to a real task-catalog boundary
- feature-layer composition is simpler, with fewer intermediate bundles and no
  layer-as-parameter system feature factory
- import scan is split into smaller cohesive boundaries behind
  `ImportPathScanService`
- `/api/events`, `/api/metrics`, and remaining streaming routes are thinner and
  more feature-owned
- the external-client layer owns only real external clients, not stream-token
  signing
- dead helpers and unnecessary bundle exports are removed

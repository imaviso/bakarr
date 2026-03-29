# API Architecture And Code Quality Review Plan - Fifth Pass

## Goal

Run a fresh architecture and code-quality pass against `apps/api` after the
fourth cleanup wave, using `apps/api/EFFECT_GUIDE.md`, the local `effect-ts`
references, and the `code-review-expert` checklists as the baseline.

This pass keeps the alpha-stage hard path: prefer one explicit app layer,
service-driven orchestration, boundary-local error translation, atomic startup
initialization, and read models that do not depend on write workflows. Do not
preserve wrapper files, constructor bags, compatibility seams, or mixed-concern
support modules when a cleaner split is available.

## Review Basis

- `apps/api/EFFECT_GUIDE.md`
- `/home/debian/.agents/skills/effect-ts/references/04-services-and-layers.md`
- `/home/debian/.agents/skills/effect-ts/references/06-error-handling.md`
- `/home/debian/.agents/skills/code-review-expert/references/solid-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/code-quality-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/security-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/removal-plan.md`

## Current Snapshot

The API is materially cleaner after the fourth pass.

What is already strong:

- workflow wrappers around background worker entry points are gone, and workers
  now depend on the real search / background boundaries
- `apps/api/src/app-platform-runtime-layer.ts` and
  `apps/api/src/features/anime/anime-runtime-layer.ts` are now deleted, and
  their wiring has been inlined into `apps/api/src/api-lifecycle-layers.ts`
- `apps/api/src/features/auth/service-support.ts` is gone; auth helpers now live
  in focused repository, audit, and bootstrap-output modules
- `apps/api/src/features/anime/service-support.ts` is gone; anime helpers now
  live in focused query, mutation, file, update, and metadata-refresh modules,
  and consumers import those modules directly
- `apps/api/src/features/operations/service-support.ts` is gone; qBittorrent
  config and error translation now live in focused operation modules
- `apps/api/src/features/operations/download-progress-service.ts` now gives
  metrics a read-only download-progress boundary instead of depending on the
  full catalog workflow
- `apps/api/src/features/system/background-job-status-service.ts` now gives
  status/dashboard a dedicated job-snapshot boundary instead of reading the
  background monitor directly
- feature-owned layer modules now own the root assembly for auth, anime,
  background, operations, system, and library edges
- qBittorrent/release-search error mapping has started moving into the exact
  helpers that own those calls, reducing dependence on shared wrappers
- operations timeout handling is now typed in `apps/api/src/background-workers.ts`
- the most misleading operations `DatabaseError` rewraps were removed from the
  reconciliation and import paths
- the last `as never` seams were removed from tests
- route error mapping remains centralized in `apps/api/src/http/route-errors.ts`

What still smells:

- the remaining manual dependency graph work is concentrated in the top-level
  layer assembly

## Findings

### P1 - High

None confirmed in the current scan.

### P2 - Medium

1. `apps/api/src/api-lifecycle-layers.ts:34`
2. `apps/api/src/runtime.ts:9`
3. `apps/api/src/app-platform-runtime-core.ts:35`
   - The layer graph is still too hand-wired and scattered.
   - `Layer.provide(...)` and `Layer.mergeAll(...)` are repeated throughout the
     middle of the graph instead of being collapsed near one explicit app
     boundary.
   - This makes lifecycle ownership, memoization, and feature coupling harder to
     reason about and works against `EFFECT_GUIDE.md`'s "provide once near the
     entrypoint" rule.
   - Hard-path fix: replace the current stepwise assembly with one explicit
     `ApiLive` / `AppLayer` constant, keep feature layers self-contained, and
     provide platform/runtime once at the boundary.

### Resolved During This Pass

1. `apps/api/src/features/system/metrics-service.ts`
2. `apps/api/src/features/system/system-status-service.ts`
3. `apps/api/src/features/system/system-dashboard-service.ts`
4. `apps/api/src/features/operations/operations-progress.ts`
   - Read-side and observability services now have dedicated download-progress
     and background-job snapshot boundaries.
   - Metrics now uses `DownloadProgressService`, and system status/dashboard use
     `BackgroundJobStatusService` / `BackgroundJobStatusSnapshot` instead of
     reading monitor state directly.
   - Remaining observability work is lower priority and can be handled in a
     later pass if needed.

5. `apps/api/src/features/system/system-bootstrap-service.ts`
   - Bootstrap initialization now runs atomically inside one transaction for
     baseline config/profile setup.
   - Runtime-only side effects are still applied after the transaction commits.

6. `apps/api/src/features/anime/service.ts`
   - The mixed-concern anime service has been split into dedicated query,
     mutation, and file services.
   - The old barrel has been removed and consumers now import the dedicated
     modules directly.

7. `apps/api/src/features/operations/search-service-tags.ts`
   - Search workflow provisioning now happens in the feature layer instead of
     inside the sub-services.

8. `apps/api/src/features/operations/runtime-support.ts`
   - Shared-state coordination stayed in this module, while the progress
     publisher factory moved to its own file.

9. `apps/api/src/features/auth/service-support.ts`
   - Auth persistence, audit logging, and bootstrap output are now split across
     focused modules.

10. `apps/api/src/features/operations/catalog-library-runtime.ts`
    - Catalog library orchestration inputs now live in a dedicated runtime
      helper instead of being assembled inline in the service layer.

11. `apps/api/src/features/operations/catalog-download-runtime.ts`
    - Catalog download orchestration inputs now live in a dedicated runtime
      helper instead of being assembled inline in the service layer.

12. `apps/api/src/features/operations/download-workflow-runtime.ts`
    - Download workflow orchestration inputs now live in a dedicated runtime
      helper instead of being assembled inline in the service layer.

13. `apps/api/src/app-platform-runtime-core.ts`
    - Clock, random, and HTTP support are now grouped into a shared core layer,
      which the root platform assembly reuses instead of spelling out each base
      service separately.

14. `apps/api/src/runtime.ts`
    - `makeApiRuntime` now calls the lifecycle assembly directly, while
      `makeApiLayer` remains only as a thin compatibility alias for the
      bootstrap entrypoint.

15. `apps/api/src/features/system/system-layer.ts`
    - Repeated platform-provide chains are now collapsed into a few named layer
      constants, making the system feature graph easier to read.

16. `apps/api/src/features/anime/anime-layer.ts`
    - The shared platform-provide step is now hoisted into one local alias
      instead of being repeated for each anime service.

17. `apps/api/src/features/auth/auth-layer.ts`
    - The shared platform-provide step is now hoisted into one local alias
      instead of being repeated for each auth service.

18. `apps/api/src/features/library-roots/library-layer.ts`
    - The shared dependency-provide steps are now hoisted into local aliases,
      making the library feature wiring easier to scan.

19. `apps/api/src/background-layer.ts`
    - The background feature dependencies are now named before they are
      provided, which makes the single wrapper easier to read.

20. `apps/api/src/features/anime/anime-enrollment-layer.ts`
    - The anime enrollment dependencies are now named before they are provided,
      which makes the single wrapper easier to read.

21. `apps/api/src/features/system/system-layer.ts`
    - Repeated `Layer.provideMerge(platformLayer)` calls are now hoisted into a
      local alias, further tightening the system feature graph.

22. `apps/api/src/api-lifecycle-layers.ts`
    - The platform-provide alias is now hoisted at the root assembly boundary,
      reducing repetition in the top-level graph.

### P3 - Low

None confirmed in the current scan.

## Security / Reliability Notes

- No new critical security issue surfaced in this pass.
- The main reliability concern is startup atomicity in
  `apps/api/src/features/system/system-bootstrap-service.ts:44`.
- The main architecture concern is the still hand-assembled root layer graph,
  though the base clock/random/http support is now grouped.

## Safe Delete Candidates

### Safe To Remove In This Pass

Completed in this pass:

1. `apps/api/src/app-platform-runtime-layer.ts`
2. `apps/api/src/features/anime/anime-runtime-layer.ts`
3. `apps/api/src/app-platform-runtime-command.ts`
4. `apps/api/src/features/auth/service-support.ts`
5. `apps/api/src/features/operations/service-support.ts`
6. `apps/api/src/features/anime/service-support.ts`
7. `apps/api/src/features/anime/service.ts`
   - The thin wrapper files and mixed support modules have now been removed.

### Defer Removal Until Refactor Lands

None for the removed wrapper modules.

## Areas To Preserve

- Preserve the direct workflow usage introduced in the fourth pass; do not bring
  back thin worker wrapper services.
- Preserve typed timeout handling in `apps/api/src/background-workers.ts`.
- Preserve centralized route error mapping in `apps/api/src/http/route-errors.ts`.
- Preserve the improved operations error truthfulness from the fourth pass.
- Preserve the current small, typed test seams instead of reintroducing runtime
  bags or `as never` stubs.

## Hard-Path Decisions

- Do not add another wrapper layer to simplify the current graph; collapse the
  graph instead.
- Do not preserve broad `make*Orchestration(...)` constructor bags if real
  tagged repos/gateways can replace them.
- Do not keep generic error wrappers once boundary-local translation exists.
- Do not let read-only status/metrics services depend on write workflows.
- Do not keep mixed-concern auth helpers once security-sensitive boundaries can
  be split cleanly.
- Do not add compatibility shims for startup/bootstrap sequencing; replace it
  with one transactional initializer.

## Concrete Implementation Plan

### Workstream 1 - Collapse layer assembly into one explicit app boundary

Target outcome: runtime assembly becomes one visible `ApiLive` graph with
feature-owned layers and one provide boundary.

Steps:

1. Inline `apps/api/src/app-platform-runtime-layer.ts` into the real runtime
   assembly path.
2. Inline `apps/api/src/features/anime/anime-runtime-layer.ts` into the same app
   boundary.
3. Replace repeated mid-graph `Layer.provide(...)` calls in
   `apps/api/src/api-lifecycle-layers.ts` with a smaller number of feature-owned
   layer constants.
4. Expose one explicit root layer from `apps/api/src/runtime.ts`.

Acceptance criteria:

- one obvious app layer exists
- feature layers are self-contained and named by ownership
- platform/runtime dependencies are provided once near the entrypoint

Status:

- completed - the app graph is now assembled through feature-owned layer modules
  with only a few cross-feature edges remaining inline

### Workstream 2 - Replace orchestration constructor bags with real service leaves

Target outcome: download, search, catalog, and anime orchestration depend on
tagged repos/gateways/coordination services instead of wide object inputs.

Steps:

1. Identify the stable leaves inside each constructor bag: DB repository access,
   external client access, progress publishing, clock/random, and coordination.
2. Promote those leaves into small tagged services with `Live` layers.
3. Refactor `makeDownloadOrchestration(...)`, `makeSearchOrchestration(...)`,
   `makeCatalogOrchestration(...)`, and the anime service constructors to read
   from tags rather than object bags.
4. Delete the obsolete bag-shaped helper wiring.

Acceptance criteria:

- orchestration constructors no longer accept large dependency objects
- workflow modules own orchestration, not manual DI glue
- adding one new dependency does not require editing broad constructor bags

Status:

- completed - `CatalogDownloadService`, `CatalogLibraryService`, and `SearchReleaseService` now live in their owning workflow/tag files; `OperationsSharedState`, `OperationsProgress`, `DownloadProgressService`, and `CatalogLibraryReadSupport` are collapsed; `operations-router`, `operations-layer`, and the merge-only orchestration wrappers were removed, `download-service-tags.ts` now only owns the download workflow/progress tags, `CatalogWorkflow` was eliminated in favor of direct catalog services, and the anime service split now lives in dedicated query/mutation/file modules

### Workstream 3 - Move error translation to the real boundaries

Target outcome: DB adapters and external clients own their own error mapping, and
generic `wrap*Error(...)` helpers disappear.

Steps:

1. Audit all callers of `wrapOperationsError(...)` and `wrapAnimeError(...)`.
2. Move external-client translation into the specific qBittorrent / RSS /
   AniList / filesystem / media-probe edges that produce the failures.
3. Keep database translation inside DB helper modules only.
4. Delete the generic wrappers once every call site uses an owned boundary error.

Acceptance criteria:

- generic error-wrapper helpers are removed
- recoverable typed errors are emitted only by the boundary that owns them
- internal bugs are no longer silently laundered into recoverable domain errors

Status:

- completed

### Workstream 4 - Split read models from write workflows

Target outcome: metrics, status, and dashboard services depend on read-only
contracts, not workflow services.

Steps:

1. Extract a dedicated read-side service for current download progress.
2. Extract a dedicated read-side service for background job snapshot/status.
3. Update `MetricsService`, `SystemStatusService`, and
   `SystemDashboardService` to depend on those read services only.
4. Keep workflow services focused on command/orchestration responsibilities.

Acceptance criteria:

- observability/read APIs do not depend on write workflows
- dashboard/status logic has smaller dependency surfaces
- operations-layer failures do not unnecessarily couple into metrics/status

Status:

- completed

### Workstream 5 - Split auth support into owned boundaries

Target outcome: auth persistence, session issuance, audit logging, and bootstrap
output are separate boundaries with clear ownership.

Steps:

1. Extract user/session DB operations into `AuthRepo`.
2. Extract session/token creation into a dedicated `SessionIssuer` service.
3. Extract system log writes into `AuthAuditLog`.
4. Extract terminal/bootstrap output into `BootstrapCredentialsAnnouncer`.
5. Remove the old mixed-concern `service-support.ts` module.

Acceptance criteria:

- auth modules each have one clear reason to change
- security-sensitive boundaries are visible in types and imports
- bootstrap output remains the only place plaintext credentials are rendered

Status:

- completed

### Workstream 6 - Make bootstrap initialization transactional

Target outcome: first-run initialization becomes one atomic DB bootstrap step,
followed by runtime-only side effects.

Steps:

1. Build one bootstrap repository operation that inserts or repairs baseline
   config/profile state transactionally.
2. Return the effective stored config from that operation.
3. Apply runtime log level after the transaction commits.
4. Add focused concurrency/idempotency tests for repeated startup.

Acceptance criteria:

- startup baseline initialization is atomic
- repeated startup remains idempotent
- no partial baseline state remains after interruption

Status:

- completed

## Verification Checklist

- `bun run check`
- `bun run test`
- `bun run lint`
- targeted startup/bootstrap tests for repeated initialization
- targeted metrics/status tests proving read-side services no longer require
  workflow services

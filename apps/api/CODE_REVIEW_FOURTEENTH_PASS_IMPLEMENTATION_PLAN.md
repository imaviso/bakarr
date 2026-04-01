# API Architecture And Code Quality Review Plan - Fourteenth Pass

## Goal

Run a fourteenth architecture and code-quality pass against `apps/api` after the
thirteenth pass, strictly following `apps/api/EFFECT_GUIDE.md`, the local
`effect-ts` references, and the `code-review-expert` review checklists.

This pass keeps the alpha-stage hard path:

- remove remaining request-driven hot paths that still scale with full directory
  trees or full-table reads
- eliminate duplicated runtime work on the download sync/progress path instead
  of preserving layered re-sync behavior
- keep splitting broad mixed service modules until the canonical boundaries are
  small and obvious
- move coarse feature composition into feature-local bundles so root wiring stops
  knowing internal dependency detail
- tighten broad error translation at outer workflow boundaries
- remove thin wrapper services that no longer earn their own tags and files

## Review Basis

- `apps/api/EFFECT_GUIDE.md`
- `apps/api/CODE_REVIEW_THIRTEENTH_PASS_IMPLEMENTATION_PLAN.md`
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
- `apps/api/src/background-worker-jobs.ts`
- `apps/api/src/features/operations/**/*.ts`
- `apps/api/src/features/system/**/*.ts`
- `apps/api/src/http/**/*.ts`

## Current Snapshot

What is strong:

- the thirteenth pass landed the hard-path browse bound, typed request
  validation preservation, atomic unmapped import, and narrower catalog read
  services
- `apps/api` is currently green on `bun run check`, `bun run lint`, and
  `bun run test`
- the large `catalog-download-view-support.ts` hub is gone, and several wrapper
  files were removed instead of preserved behind compatibility aliases

What still smells:

- the manual import scan endpoint is still a request-driven hot path with
  unbounded recursive filesystem work and an avoidable full-library episode
  mapping read
- the download sync and download progress publication path still duplicates
  expensive qBittorrent sync and progress event work
- the current download read module is still a broad mixed read/export/runtime
  hub even after the thirteenth-pass split
- root and operations feature composition still manually know too many concrete
  subgraphs and intermediate layers
- system status, dashboard, and metrics still assemble summary state through
  overlapping serial count queries rather than one cohesive read boundary
- a few remaining services are still mostly projection/logging/config wrappers
  rather than meaningful domain boundaries

## Findings

### P0 - Critical

None confirmed in this pass.

### P1 - High

1. `apps/api/src/http/operations-library-router.ts:95`
   `apps/api/src/http/operations-request-schemas.ts:148`
   `apps/api/src/features/operations/import-path-scan-support.ts:45`
   `apps/api/src/features/operations/import-path-scan-support.ts:90`
   - `/library/import/scan` still accepts only `path` and optional `anime_id`,
     then `scanImportPathEffect(...)` canonicalizes the input and performs a
     full recursive `scanVideoFiles(...)` over the import tree.
   - After that full tree walk it sorts the whole result set, probes media for
     every candidate file, and loads all mapped episode rows with
     `where filePath is not null`, which turns one user request into a full
     directory scan plus a broad library-wide DB read.
   - This is the same class of request-boundary reliability issue the thirteenth
     pass fixed for browse, but it still exists on the import scan path.

2. `apps/api/src/features/operations/catalog-download-command-service.ts:41`
   `apps/api/src/features/operations/download-progress-support.ts:38`
   `apps/api/src/background-worker-jobs.ts:46`
   - `CatalogDownloadCommandService.syncDownloads()` first calls
     `syncDownloadsWithQBitEffect()`, then calls `publishDownloadProgress()`,
     and `publishDownloadProgress()` performs another
     `syncDownloadsWithQBitEffect()` before reading active downloads.
   - The background download-sync worker then calls `syncDownloads()` and
     separately fetches progress again to publish another `DownloadProgress`
     event.
   - This means the canonical download-sync path currently performs duplicate
     qBittorrent sync work and duplicate progress publication on a hot runtime
     boundary.

### P2 - Medium

1. `apps/api/src/api-lifecycle-layers.ts:42`
   `apps/api/src/app-platform-runtime-core.ts:35`
   `apps/api/src/features/operations/operations-feature-layer.ts:34`
   - root lifecycle composition and the operations feature layer still assemble
     a long chain of intermediate layer constants and manual `Layer.provide(...)`
     edges for internal subgraphs.
   - The application boundary still pays too much composition cost for feature
     internals, which keeps the root vulnerable to shotgun surgery when one
     operations or system dependency changes.

2. `apps/api/src/features/operations/catalog-download-read-service.ts:65`
   `apps/api/src/features/operations/catalog-download-read-service.ts:151`
   - `CatalogDownloadReadService` still owns queue reads, history pagination,
     event pagination, event export streaming, active progress reads, bootstrap
     reads, and runtime summary counts in one module and one service layer.
   - The thirteenth pass removed the broader cross-library hub, but this module
     is still a mixed read boundary with several independent reasons to change.

3. `apps/api/src/features/operations/catalog-library-scan-support.ts:30`
   `apps/api/src/features/operations/catalog-library-scan-support.ts:155`
   - one file still owns the library scan workflow and the library write
     boundary for import and rename operations.
   - Scan orchestration and write/import concerns are now separate enough that
     keeping them in one module weakens ownership and makes the file a small
     SRP violation even though it is no longer very large.

4. `apps/api/src/features/system/system-status-service.ts:62`
   `apps/api/src/features/system/system-status-service.ts:87`
   `apps/api/src/features/system/system-dashboard-service.ts:38`
   `apps/api/src/features/system/metrics-service.ts:30`
   - status, dashboard, and metrics still assemble overlapping runtime summary
     state through many separate count/select helpers instead of one cohesive
     summary read boundary.
   - This increases query fan-out on summary endpoints and duplicates summary
     composition logic across multiple system services.

5. `apps/api/src/features/operations/background-search-rss-support.ts:38`
   `apps/api/src/features/operations/background-search-rss-feed-service.ts:49`
   `apps/api/src/features/operations/background-search-missing-support.ts:149`
   - outer RSS and missing-search workflows still rely on broad
     `mapError(...)` / `catchAll(...)` translation after the inner services have
     already shaped most failures.
   - The result is still flatter and less intention-revealing than the current
     typed Effect workflow warrants.

### P3 - Low

1. `apps/api/src/features/operations/background-search-quality-profile-service.ts:8`
   - this file is a one-method wrapper around `loadQualityProfile(...)` plus one
     `OperationsInputError` translation.
   - It is likely better as a file-local helper or merged into the owning
     background-search boundary once the feature graph is tightened.

2. `apps/api/src/features/operations/background-search-skip-log-service.ts:3`
   - this service is a pure logging shim with no lifecycle or reusable domain
     policy beyond two debug log formats.
   - It is another strong candidate to collapse into the two background-search
     workflows that actually own the skip decisions.

3. `apps/api/src/features/operations/search-orchestration-import-path-support.ts:24`
   - `SearchImportPathService` is still mostly a thin tagged shell around
     `scanImportPathEffect(...)` plus broad infrastructure error wrapping.
   - If the import scan boundary is redesigned and bounded, this extra shell may
     stop earning its own module.

## Security / Reliability Notes

- No new P0 security issue was confirmed in this pass.
- The highest request-driven reliability risk is the import scan endpoint,
  because one request can still force a full recursive filesystem scan, media
  probing fan-out, and a broad mapped-episode read.
- The highest runtime efficiency smell is the duplicated qBittorrent sync and
  duplicated download progress event path.
- The main maintainability smell is still over-detailed layer composition and a
  few remaining wrapper-only service shells.

## Safe Delete Candidates

### Safe To Remove Now

None confirmed without first landing the refactors below.

### Defer Until Refactor Lands

1. `apps/api/src/features/operations/background-search-quality-profile-service.ts`
   - collapse after background-search services own profile lookup directly or a
     narrower shared helper becomes canonical
2. `apps/api/src/features/operations/background-search-skip-log-service.ts`
   - collapse after the feed and missing-search workflows own their skip log
     formatting directly
3. `apps/api/src/features/operations/search-orchestration-import-path-support.ts`
   - remove after the bounded import-scan boundary becomes the canonical tagged
     service rather than a service shell over `scanImportPathEffect(...)`
4. `apps/api/src/features/operations/catalog-library-scan-support.ts`
   - split into scan and write modules first, then delete the mixed support file
5. `apps/api/src/features/operations/operations-progress-service.ts`
   - revisit after download progress publishing and the background-search
     wrappers are consolidated

## Hard-Path Decisions

- Do not preserve unbounded import-path scans on a request-driven endpoint;
  bound them explicitly and make truncation visible in the contract.
- Do not preserve a download sync path that can re-sync qBittorrent and
  republish the same progress more than once per operation.
- Do not keep broad mixed read modules once the responsibilities are clear
  enough to split cleanly.
- Do not keep root lifecycle and feature composition detail at the app boundary
  if the feature can export a coarser stable bundle layer.
- Do not keep wrapper-only services for background-search helpers when the
  owning workflows can depend on direct helpers or narrower modules.
- Do not add migration shims, compatibility aliases, or fallback wrappers for
  deleted service modules; this repo is still pre-release alpha.

## Concrete Implementation Plan

### Workstream 1 - Bound manual import scan requests

Target outcome: `/library/import/scan` becomes a bounded request boundary with
explicit truncation semantics and no full-library episode mapping read.

Steps:

1. Add an explicit request-level cap for import scan results in the canonical
   service boundary instead of relying on route callers.
2. Rework `scanImportPathEffect(...)` to consume `scanVideoFilesStream(...)`
   incrementally and stop once the cap is reached.
3. Replace the current `filePath is not null` global mapping read with a scoped
   lookup keyed by the candidate anime ids and episode numbers actually relevant
   to the current request.
4. Keep media probing bounded to the capped result set.
5. Extend the API response to surface whether the result set was truncated.
6. Add focused tests for default cap, explicit cap, and truncation behavior.

### Workstream 2 - Make download sync and progress publication single-pass

Target outcome: one logical sync operation performs one qBittorrent sync and one
progress publication.

Steps:

1. Split the current progress support into two explicit operations:
   one that reads/publishes a fresh progress snapshot and one that only syncs
   torrent state.
2. Make `CatalogDownloadCommandService.syncDownloads()` the canonical
   single-pass path that syncs once, then publishes once without re-syncing.
3. Remove the duplicate progress fetch/publication from
   `BackgroundWorkerJobs.runDownloadSyncWorkerTask()` and reuse the canonical
   command boundary instead.
4. Verify manual sync, worker sync, retry, and reconcile flows still publish the
   expected progress events.
5. Add tests that prove the qBittorrent sync adapter is invoked once per sync
   operation.

### Workstream 3 - Split the remaining broad read and library support modules

Target outcome: canonical services align with one boundary each instead of mixed
service hubs.

Steps:

1. Split `catalog-download-read-service.ts` by responsibility:
   queue/history reads, download event reads/export, and runtime progress
   summary/bootstrap.
2. Revisit whether the resulting modules still justify one umbrella tagged
   service or should become smaller tagged services directly.
3. Split `catalog-library-scan-support.ts` into separate scan and write modules
   with their own canonical names.
4. Make helper constructors file-local when they stop being shared.

### Workstream 4 - Shrink feature and root composition knowledge

Target outcome: root lifecycle wiring merges coarse feature bundles instead of
manually reconstructing internal subgraphs.

Steps:

1. Introduce stable internal bundle layers in operations for download,
   background search, library, unmapped, and runtime concerns.
2. Introduce a coarser system feature bundle so `api-lifecycle-layers.ts` stops
   wiring individual system sub-services one by one.
3. Simplify `makeAppPlatformCoreRuntimeLayer(...)` around stable client/support
   bundle constants instead of long local layer chains.
4. Reduce `makeApiLifecycleLayers(...)` to platform bundle plus coarse feature
   bundles.

### Workstream 5 - Tighten RSS and missing-search error boundaries

Target outcome: outer workflow services recover specifically where meaningful and
perform one final boundary translation only where necessary.

Steps:

1. Revisit `background-search-rss-support.ts` and
   `background-search-missing-support.ts` after the bundle cleanup.
2. Replace broad `catchAll(...)` / `mapError(...)` branches with smaller typed
   unions and `Effect.catchTags(...)` where the failure set is now known.
3. Preserve full unexpected causes in infrastructure errors only at the outer
   boundary.
4. Add focused tests for the intended typed failure paths.

### Workstream 6 - Consolidate system summary reads

Target outcome: status, dashboard, and metrics share one cohesive summary read
boundary with fewer DB round trips and less duplicated orchestration.

Steps:

1. Introduce a focused system summary read service or repository boundary that
   owns library counts, download counts, and recent summary data together.
2. Update `SystemStatusService`, `SystemDashboardService`, and `MetricsService`
   to consume that shared boundary instead of composing overlapping count calls
   independently.
3. Keep endpoint-specific shaping in the owning service, but centralize the raw
   summary read model.

### Workstream 7 - Remove remaining wrapper-only background-search shells

Target outcome: background-search services depend on meaningful boundaries rather
than tiny projection/logging/config wrappers.

Steps:

1. Collapse `BackgroundSearchQualityProfileService` into a direct helper or the
   owning background-search services.
2. Collapse `BackgroundSearchSkipLogService` into direct structured logging at
   the two workflow boundaries that own the skip semantics.
3. Revisit `SearchImportPathService` after Workstream 1 and delete it if the new
   bounded import-scan service can own the canonical contract directly.
4. Revisit `OperationsProgress` after the sync/progress cleanup and remove it if
   it remains only a projection shell.

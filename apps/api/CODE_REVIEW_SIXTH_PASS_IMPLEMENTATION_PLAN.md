# API Architecture And Code Quality Review Plan - Sixth Pass

## Goal

Run another architecture and code-quality pass against `apps/api` after the
fifth cleanup wave, using `apps/api/EFFECT_GUIDE.md`, the local `effect-ts`
references, and the `code-review-expert` checklists as the baseline.

This pass keeps the alpha-stage hard path: prefer explicit service tags, small
feature-owned layers, schema-backed boundaries, boundary-local error
translation, and direct runtime assembly. Do not preserve constructor bags,
aggregate workflow tags, compatibility wrappers, mixed support files, or barrel
modules when a cleaner split is available.

## Review Basis

- `apps/api/EFFECT_GUIDE.md`
- `/home/debian/.agents/skills/effect-ts/references/04-services-and-layers.md`
- `/home/debian/.agents/skills/effect-ts/references/05-data-modeling.md`
- `/home/debian/.agents/skills/effect-ts/references/06-error-handling.md`
- `/home/debian/.agents/skills/code-review-expert/references/solid-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/code-quality-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/security-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/removal-plan.md`

## Scan Scope

Primary scan targets for this pass:

- `apps/api/src/api-lifecycle-layers.ts`
- `apps/api/src/app-platform-runtime-core.ts`
- `apps/api/src/lib/media-probe.ts`
- `apps/api/src/background-controller-live.ts`
- `apps/api/src/background-workers.ts`
- `apps/api/src/features/anime/**/*.ts`
- `apps/api/src/features/operations/**/*.ts`
- `apps/api/src/features/auth/session-service.ts`

## Current Snapshot

The API is still materially cleaner than the earlier passes.

What is still strong:

- the top-level runtime graph is centralized in
  `apps/api/src/api-lifecycle-layers.ts`
- most exported services use `Context.Tag`, `Layer.effect(...)`, and
  `Effect.fn(...)`
- route error mapping is still centralized in
  `apps/api/src/http/route-errors.ts`
- auth, anime, operations, and system routes now depend on smaller feature
  services instead of the old support blobs
- the codebase continues moving away from wrapper-only files and compatibility
  seams

What still smells:

- the outer shell is Effect-shaped, but several inner workflows still assemble
  large manual dependency bags instead of reading leaf services directly
- a few runtime and repository files still hide coupling behind broad aggregate
  tags or barrel exports
- some orchestration files still catch too broadly and translate errors too late
- several support modules have regrown into mixed-concern files

## Findings

### P1 - High

None confirmed in the current scan.

### P2 - Medium

1. `apps/api/src/lib/media-probe.ts`
   - `MediaProbeShape.probeVideoFile()` advertises an always-live service that
     returns `MediaProbeUnavailable` as a normal result variant, but
     `MediaProbeLive` fails layer construction when the command executor or
     `ffprobe` is unavailable.
   - This mixes two incompatible models: service-level recoverable unavailability
     and startup-fatal dependency failure.
   - Hard-path decision: choose one model and delete the other. Prefer an
     always-live service that returns `MediaProbeUnavailable` from
     `probeVideoFile()` so metadata probing stays an optional boundary concern.

2. `apps/api/src/features/operations/search-service-tags.ts`
   - `SearchWorkflow` is still a god tag built by spreading five service shapes
     into one aggregate contract.
   - Callers such as `background-controller-live.ts`, `background-workers.ts`,
     `anime-enrollment-service.ts`, `operations-search-router.ts`,
     `operations-library-router.ts`, and `system-tasks-router.ts` depend on the
     full workflow even when they only need one or two capabilities.
   - This violates the small-service guidance in `EFFECT_GUIDE.md` and keeps the
     feature coupled around one broad interface.

3. `apps/api/src/features/operations/download-workflow-runtime.ts`
   `apps/api/src/features/operations/catalog-library-runtime.ts`
   `apps/api/src/features/operations/catalog-download-runtime.ts`
   `apps/api/src/features/anime/service-wiring.ts`
   - These modules still act as constructor-bag / runtime-bag assemblers.
   - They gather concrete infrastructure values, reshape them into wide objects,
     and pass those objects into factory functions.
   - This keeps dependency wiring hidden in ad hoc records instead of explicit
     leaf tags and service-owned layers.
   - The smell is strongest in the download workflow, where one service runtime
     manually assembles reconciliation, torrent lifecycle, trigger, and clock /
     random / DB helpers.

4. `apps/api/src/features/operations/download-lifecycle.ts`
   - This module still mixes unrelated concerns: magnet parsing, covered-episode
     codec logic, in-flight overlap checks, torrent content episode inference,
     remote path mapping, and filesystem content resolution.
   - One file now owns parsing, persistence-adjacent logic, filesystem probing,
     and naming heuristics.
   - This is a classic SRP failure and makes later deletion or reuse awkward.

5. `apps/api/src/features/anime/repository.ts`
   - This file still combines read helpers, write helpers, conflict recovery,
     airing schedule derivation support, root-folder ownership checks, and
     re-exports.
   - `upsertEpisodeEffect()` also carries retry-on-conflict logic inline instead
     of isolating write policy in a focused persistence module.
   - The module has multiple reasons to change and has become the anime feature's
     informal dumping ground again.

6. `apps/api/src/features/operations/catalog-library-scan-support.ts`
   `apps/api/src/features/operations/catalog-orchestration-library-write-support.ts`
   - These files are still too mixed: job bookkeeping, DB mutations, file IO,
     media parsing, event publication, rollback behavior, and naming decisions
     all live together.
   - They are readable, but they are not small ownership units.
   - The library write path in particular is manually coordinating filesystem /
     database compensation instead of being split into narrower owned boundaries.

7. `apps/api/src/features/operations/download-orchestration.ts`
   `apps/api/src/features/operations/download-trigger-service.ts`
   `apps/api/src/features/operations/background-search-rss-support.ts`
   `apps/api/src/features/operations/catalog-library-scan-support.ts`
   `apps/api/src/features/operations/unmapped-orchestration-scan.ts`
   `apps/api/src/features/anime/orchestration-support.ts`
   - Broad `Effect.catchAll(...)` recovery is still used in several orchestration
     paths, then remapped into generic infrastructure errors.
   - This launders domain intent and contradicts the local guidance to prefer
     `catchTag(...)` / `catchTags(...)` and to keep translation at the owning
     boundary.
   - The current code preserves runtime stability, but it reduces diagnostic
     truthfulness and encourages generic wrappers to grow back.

8. `apps/api/src/features/operations/repository.ts`
   - The operations feature still exposes a broad barrel that mixes anime,
     config, profile, download, RSS, and presentation helpers.
   - This hides ownership and makes import graphs look smaller than they really
     are.
   - It also increases shotgun surgery pressure when repository helpers move.

9. `apps/api/src/background-controller-live.ts`
   `apps/api/src/background-workers.ts`
   - Background worker assembly still depends on a broad manual dependency bag
     and on the aggregate `SearchWorkflowShape`.
   - The controller wiring is explicit, but it is not yet feature-minimal.
   - The workers should depend on the exact task tags they need, not on a broad
     orchestration object.

### P3 - Low

1. `apps/api/src/api-lifecycle-layers.ts`
   - The root graph is much better than earlier passes, but the number of nested
     `Layer.provideMerge(...)` calls is still a signal that several services do
     not yet own their dependency assembly cleanly.
   - This is acceptable at the app boundary today, but it should shrink once the
     constructor-bag modules are removed.

2. `apps/api/src/app-platform-runtime-core.ts`
   - Platform assembly is correct, but still manually grouped around several
     shared support aliases.
   - This is not a correctness problem; it is a follow-on cleanup target after
     the feature internals stop depending on ad hoc runtime bags.

## Security / Reliability Notes

- No new P0 or P1 security issue was confirmed in this pass.
- The most important reliability smell is the `MediaProbe` contract mismatch in
  `apps/api/src/lib/media-probe.ts`: startup failure and recoverable result are
  both modeled at once.
- The biggest maintainability risks are still broad aggregate services, late
  error translation, and mixed workflow files that couple DB, filesystem, and
  parsing concerns together.

## Safe Delete Candidates

### Safe To Remove Once Replacement Lands

1. `apps/api/src/features/anime/service-wiring.ts`
   - Pure service assembly wrapper for `AnimeFileService`.

2. `apps/api/src/features/operations/catalog-library-runtime.ts`
   - Runtime-bag adapter with little standalone domain value.

3. `apps/api/src/features/operations/catalog-download-runtime.ts`
   - Runtime-bag adapter with little standalone domain value.

4. `apps/api/src/features/operations/repository.ts`
   - Broad barrel that should be replaced by direct leaf-module imports.

### Defer Removal Until Refactor Lands

1. `apps/api/src/features/operations/search-service-tags.ts`
   - Remove the aggregate `SearchWorkflow` tag only after callers move to narrow
     tags.

2. `apps/api/src/features/operations/download-workflow-runtime.ts`
   - Delete after download orchestration reads leaf services directly.

3. `apps/api/src/features/operations/download-lifecycle.ts`
   - Split before deletion; parts of the file are still actively used.

4. `apps/api/src/features/anime/repository.ts`
   - Split before deletion; callers still depend on multiple helpers inside it.

## Areas To Preserve

- Preserve the single visible app boundary in
  `apps/api/src/api-lifecycle-layers.ts`; do not reintroduce scattered
  `Effect.provide(...)` through business logic.
- Preserve centralized route error mapping in
  `apps/api/src/http/route-errors.ts`.
- Preserve the existing move toward smaller feature services instead of reviving
  mixed `service-support.ts` style modules.
- Preserve schema-backed result and error models where they already exist.
- Preserve the alpha-stage willingness to make breaking internal refactors when
  the simpler architecture is clearly better.

## Hard-Path Decisions

- Do not keep `SearchWorkflow` as a convenience facade once narrow task tags are
  available.
- Do not keep runtime-bag wrappers just because they make current constructors
  easier to call.
- Do not preserve `MediaProbeUnavailable` as both a startup failure and a normal
  service result.
- Do not keep broad repository barrels once direct leaf imports are practical.
- Do not keep broad `catchAll(...)` recovery when specific boundary-local
  translation can replace it.
- Do not add compatibility shims between old constructor factories and new
  service tags; move callers straight to the owned service boundaries.

## Concrete Implementation Plan

### Workstream 1 - Fix the `MediaProbe` lifecycle contract

Target outcome: `MediaProbe` has one clear model for availability and callers do
not need to reason about contradictory startup vs runtime behavior.

Steps:

1. Decide the service contract explicitly: keep `MediaProbe` always live and
   return `MediaProbeUnavailable` from `probeVideoFile()` when probing cannot
   run.
2. Move the executor / `ffprobe` availability check out of layer construction
   and into the probe boundary.
3. Keep concurrency control inside the live service.
4. Update callers to treat `MediaProbeUnavailable` the same way they already
   treat missing metadata: degrade metadata enrichment, not app startup.
5. Add focused tests for missing command executor, missing `ffprobe`, timeout,
   invalid JSON, and valid metadata.

Acceptance criteria:

- `MediaProbeLive` does not fail startup for optional probing capability
- `MediaProbeUnavailable` is produced only at the probe call boundary
- callers do not need fallback wrappers or startup special cases

### Workstream 2 - Delete the aggregate `SearchWorkflow` facade

Target outcome: RSS, episode search, import-path scan, and unmapped-folder work
depend on narrow tags instead of one broad workflow contract.

Steps:

1. Identify the actual narrow capabilities used by each caller:
   - background workers need RSS + missing-search triggers
   - routers need release search, episode search, unmapped-folder actions, or
     import-path scan individually
   - anime enrollment needs only the missing-search trigger
2. Inject those leaf tags directly into callers.
3. Update `background-controller-live.ts` and `background-workers.ts` to depend
   on exact task services instead of `SearchWorkflowShape`.
4. Delete `SearchWorkflowShape`, `SearchWorkflow`, and the aggregate live layer.

Acceptance criteria:

- no caller imports `SearchWorkflow`
- background workers depend only on the task services they actually execute
- adding a new search capability does not widen a god interface

### Workstream 3 - Replace constructor bags with owned Effect services

Target outcome: runtime-bag files disappear and orchestration reads explicit leaf
services instead of wide object records.

Steps:

1. For downloads, promote the stable leaves into small tags:
   - reconciliation service
   - torrent lifecycle service
   - trigger service
   - progress publishing boundary
2. Build `DownloadWorkflow` directly from those tags instead of
   `makeDownloadWorkflowRuntime(...)`.
3. Inline or delete `catalog-library-runtime.ts`, `catalog-download-runtime.ts`,
   and `anime/service-wiring.ts` by constructing the final service directly in
   the owning `Layer.effect(...)` module.
4. Keep any remaining helper factories pure and small; do not leave behind thin
   runtime reshaping wrappers.

Acceptance criteria:

- runtime-bag modules are removed
- service constructors read tags directly in `Layer.effect(...)`
- adding one dependency no longer requires editing wide bag types in multiple
  files

### Workstream 4 - Split mixed workflow modules by ownership

Target outcome: files own one domain concept each, and DB / FS / parsing logic
no longer pile into the same support modules.

Steps:

1. Split `download-lifecycle.ts` into focused modules such as:
   - magnet parsing / info-hash helpers
   - covered-episode codec
   - accessible-path resolution and remote mapping
   - completed-download episode inference
   - overlap detection persistence helper
2. Split `anime/repository.ts` into focused modules such as:
   - anime-read repository
   - episode-write repository
   - airing schedule helpers
   - root-folder ownership lookup
3. Split `catalog-library-scan-support.ts` into:
   - scan streaming/query helper
   - per-file classification/matching helper
   - library scan job orchestration
4. Split `catalog-orchestration-library-write-support.ts` into:
   - rename workflow
   - import workflow
   - import naming / destination planning
   - filesystem + DB compensation boundary

Acceptance criteria:

- each split file has one obvious reason to change
- pure parsing and codec helpers stop importing DB / filesystem types
- orchestration modules mainly sequence small helpers instead of embedding all
  logic inline

### Workstream 5 - Move error translation back to owning boundaries

Target outcome: database, filesystem, external-client, and path errors are
translated where they originate, and orchestration stops laundering failures.

Steps:

1. Audit the broad `catchAll(...)` sites in the operations and anime flows.
2. Replace them with `catchTag(...)` / `catchTags(...)` where recovery is truly
   specific.
3. Push generic infrastructure translation into the exact filesystem, DB, RSS,
   qBittorrent, AniList, and media-probe boundaries that own those failures.
4. Preserve full causes when translation is necessary.
5. Delete any generic remapping code that becomes unused after the move.

Acceptance criteria:

- orchestration files no longer use broad `catchAll(...)` for normal boundary
  translation
- error types remain truthful about which boundary failed
- logs and route error mapping retain enough cause detail for diagnosis

### Workstream 6 - Remove hidden coupling barrels

Target outcome: import graphs show the real ownership boundaries directly.

Steps:

1. Replace imports from `apps/api/src/features/operations/repository.ts` with
   direct imports from the owned leaf repository modules.
2. After all callers move, delete the barrel.
3. Keep only small co-located modules with names that reflect the actual owned
   boundary.

Acceptance criteria:

- no production module imports `features/operations/repository.ts`
- repository ownership is visible in import paths
- moving one repo helper no longer causes broad churn

### Workstream 7 - Shrink the background worker dependency surface

Target outcome: worker wiring depends only on the exact services needed by each
loop.

Steps:

1. Replace `BackgroundWorkerDependencies` with narrower task-specific contracts
   or direct tag access during controller assembly.
2. Stop threading the broad `searchWorkflow` aggregate through the worker graph.
3. Keep worker functions small and task-focused.
4. Ensure timeout, monitoring, and logging behavior stays unchanged.

Acceptance criteria:

- worker dependencies are task-specific
- controller wiring no longer carries broad orchestration objects
- monitoring and timeout behavior remain intact after the split

## Suggested Order

1. Workstream 1 - `MediaProbe`
2. Workstream 2 - `SearchWorkflow`
3. Workstream 3 - constructor-bag removal
4. Workstream 6 - repository barrel removal
5. Workstream 7 - background worker narrowing
6. Workstream 4 - mixed module splits
7. Workstream 5 - error translation cleanup across the refactored boundaries

This order removes the most misleading contracts first, then collapses the
dependency graph, then performs the larger file splits after the service
boundaries are cleaner.

## Verification Checklist

- `bun run check`
- `bun run test`
- `bun run lint`
- targeted `media-probe` tests covering unavailable / timeout / invalid-output
  paths
- targeted search/background tests proving callers no longer require
  `SearchWorkflow`
- targeted library import / rename tests proving rollback behavior still works
  after the split
- targeted download workflow tests proving overlap detection and progress
  publication remain correct after constructor-bag removal

# API Architecture And Code Quality Review Plan - Eighth Pass

## Goal

Run an eighth architecture and code-quality pass against `apps/api` after the
seventh cleanup wave, strictly following `apps/api/EFFECT_GUIDE.md`, the local
`effect-ts` references, and the `code-review-expert` review checklists.

This pass keeps the alpha-stage hard path:

- prefer real Effect services and feature-local layers over manual dependency
  bags and hand-assembled support inputs
- prefer one owned workflow shell plus small leaf modules over broad support
  files that mix DB, filesystem, network, logging, and event policy
- prefer feature bundles with internal layer ownership over one central app
  assembler that knows every leaf dependency
- delete wrapper-only service shells when they add no meaningful contract,
  lifecycle, or resource ownership

## Review Basis

- `apps/api/EFFECT_GUIDE.md`
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
- `apps/api/src/background-controller*.ts`
- `apps/api/src/background-workers.ts`
- `apps/api/main.ts`
- `apps/api/src/api-startup.ts`
- `apps/api/src/features/anime/**/*.ts`
- `apps/api/src/features/operations/**/*.ts`

## Current Snapshot

What is still strong:

- the API still has one obvious app-layer boundary in
  `apps/api/src/api-lifecycle-layers.ts`
- most new feature boundaries still use `Context.Tag`, `Layer.effect(...)`, and
  `Effect.fn(...)`
- the seventh pass removed many wrapper-only shells and split several earlier
  god files into smaller modules
- route adapters remain relatively thin and continue to delegate to feature
  services instead of owning business logic

What still smells:

- several anime and operations modules still bundle domain rules, persistence,
  path policy, external IO, and event/logging concerns in one file
- some new service files are now wrapper-only tags around a single effect and
  do not yet own a real contract boundary
- operations still recreates service containers manually through `*Input`,
  `*Shared`, and orchestration bag types instead of satisfying dependencies once
  in layers
- background worker wiring and app-layer assembly still know too much about leaf
  service composition

## Findings

### P0 - Critical

None confirmed in the eighth-pass scan.

### P1 - High

1. `apps/api/src/features/anime/file-mapping-support.ts`
   - Still acts as a god-module for anime file handling.
   - It owns path validation, root resolution, folder scanning, media probing,
     episode persistence, mapping deletion, read-side resolution, and schema
     result variants in one file.
   - This is the strongest remaining SRP violation on the anime side and keeps
     file-domain ownership unclear.

2. `apps/api/src/features/anime/add-anime-support.ts`
   - The add flow still mixes AniList fetches, config lookup, profile
     validation, filesystem mutation, image caching, aggregate persistence,
     episode seeding, DTO mapping, and event publication behind one dependency
     bag.
   - This keeps the create-anime use case coupled to raw DB, FS, and HTTP
     details instead of narrow leaf contracts.

3. `apps/api/src/features/anime/query-support.ts`
   - Read concerns are still collapsed into one module.
   - The file owns DB query shapes, progress derivation, stored-data decoding,
     DTO assembly, AniList search enrichment, and query ranking.
   - This makes read-side change expensive and keeps query services wider than
     needed.

4. `apps/api/src/features/operations/download-workflow-service.ts`
   `apps/api/src/features/operations/download-orchestration.ts`
   - Download workflow assembly still builds one broad god-surface over trigger,
     sync, reconciliation, cleanup, and progress concerns.
   - The top-level workflow tag remains an aggregate service instead of a small
     owned boundary.

5. `apps/api/src/features/operations/background-search-rss-support.ts`
   `apps/api/src/features/operations/background-search-missing-support.ts`
   - Both background search modules still mix job shell concerns, database
     reads, ranking/decision logic, queueing, progress publication, logging, and
     event emission.
   - They are readable, but the ownership boundary is still too broad for the
     hard-path Effect style.

6. `apps/api/src/api-lifecycle-layers.ts`
   `apps/api/src/app-platform-runtime-core.ts`
   `apps/api/src/background-controller-live.ts`
   - The root graph and worker controller still behave like handwritten service
     containers.
   - `api-lifecycle-layers.ts` knows nearly every leaf layer, the platform layer
     is still broader than “platform”, and the background controller extracts and
     re-provides worker services one by one.

### P2 - Medium

1. `apps/api/src/features/anime/mutation-support.ts`
   - Settings updates remain mixed with path policy, library-root resolution,
     folder ownership checks, profile validation, logging, and event
     publication.
   - `updateAnimePathEffect(...)` is still significantly broader than the other
     mutations.

2. `apps/api/src/features/anime/anime-metadata-refresh-job.ts`
   - Job bookkeeping, DB selection, per-anime refresh orchestration, schedule
     sync, batching, and failure translation still live in one workflow file.
   - The job shell and the monitored-anime refresh loop are not yet separated.

3. `apps/api/src/features/anime/anime-delete-service.ts`
   `apps/api/src/features/anime/metadata-refresh-service.ts`
   `apps/api/src/features/anime/anime-episode-refresh-service.ts`
   - These files are mostly wrapper-only services.
   - They currently acquire dependencies and immediately call a single effect,
     adding tag/layer surface without adding a strong contract boundary.

4. `apps/api/src/features/anime/anime-orchestration-shared.ts`
   - `quietAnimeEventPublisher` is still an ad-hoc null object.
   - This papers over an optional dependency shape instead of expressing a real
     no-op layer or a narrower workflow contract.

5. `apps/api/src/features/operations/background-search-support-shared.ts`
   `apps/api/src/features/operations/background-search-queue-support.ts`
   `apps/api/src/features/operations/download-orchestration-shared.ts`
   - Operations still recreates service containers manually through `*Input`,
     `*Shared`, and orchestration helper interfaces.
   - That is manual DI pressure instead of Effect layer ownership.

6. `apps/api/src/features/operations/runtime-support.ts`
   - `OperationsSharedState` still combines unrelated coordination concerns:
     unmapped scan lifecycle and exclusive download triggering.
   - The tag is broader than any single consumer actually needs.

7. `apps/api/src/features/operations/catalog-download-orchestration.ts`
   `apps/api/src/features/operations/search-unmapped-service.ts`
   - Both tags still flatten heterogeneous capabilities into broad aggregate
     service surfaces.
   - Consumers depend on more methods than they need, and service ownership is
     blurred.

8. `apps/api/src/features/operations/operations-progress-service.ts`
   - Progress publication is still layered above `DownloadWorkflow` and mostly
     forwards to publishers.
   - This keeps a cross-cutting concern dependent on a broader workflow surface
     than necessary.

9. `apps/api/src/background-workers.ts`
   `apps/api/src/api-startup.ts`
   `apps/api/main.ts`
   - Worker startup is still a partly manual executable concern.
   - Scheduled loops are assembled centrally in `background-workers.ts`, and the
     executable path still remembers to call `startBackgroundWorkers()` as a
     separate startup step.

### P3 - Low

1. `apps/api/src/features/operations/download-reconciliation-service.ts`
   `apps/api/src/features/operations/download-torrent-lifecycle-service.ts`
   `apps/api/src/features/operations/catalog-orchestration-library-write-support.ts`
   - These files are mostly composition or forwarding wrappers over narrower
     helpers.
   - They may still be justified temporarily, but they add naming surface with
     limited architectural value.

2. `apps/api/src/app-runtime.ts`
   - The runtime helper is small and useful for tests and adapters, but it still
     creates a second runtime-oriented surface beside the executable boundary.
   - This is acceptable for now, but it should stay clearly test/adapter scoped.

## Security / Reliability Notes

- No new P0 or P1 security issue was confirmed in this pass.
- The primary reliability risks remain large orchestration modules where DB,
  filesystem, and network policy are fused together.
- The main maintainability risks are still broad aggregate service tags,
  wrapper-only services, manual DI bags, and the large central app-layer graph.
- The main concurrency risk remains the broad operations coordination tag,
  because unrelated serialization policies still share one service boundary.

## Safe Delete Candidates

### Safe To Remove Now

None confirmed in the eighth-pass snapshot.

### Defer Removal Until Refactor Lands

1. `apps/api/src/features/anime/anime-delete-service.ts`
   `apps/api/src/features/anime/metadata-refresh-service.ts`
   `apps/api/src/features/anime/anime-episode-refresh-service.ts`
   - Delete or collapse only after their callers depend on a real owned service
     or on direct workflow modules.

2. `apps/api/src/features/operations/download-reconciliation-service.ts`
   `apps/api/src/features/operations/download-torrent-lifecycle-service.ts`
   - Delete or collapse only after `DownloadWorkflow` stops depending on these
     wrapper composition modules.

3. `apps/api/src/features/operations/catalog-orchestration-library-write-support.ts`
   - Delete or collapse only after write-side library contracts stop using this
     wrapper as the service boundary.

## Hard-Path Decisions

- Do not preserve aggregate service shells just because they are convenient
  import points.
- Do not add compatibility bridges between the current broad workflow files and
  the new smaller services.
- Do not keep `*Input` and `*Shared` dependency bags when a real tag/layer is
  cleaner.
- Do not preserve wrapper-only service tags if a direct workflow module or a
  stronger leaf service is cleaner.
- Do not let `api-lifecycle-layers.ts` keep absorbing feature-internal wiring
  that belongs inside feature bundle layers.

## Concrete Implementation Plan

### Workstream 1 - Split anime file mapping by responsibility

Target outcome: anime file handling is no longer owned by one broad support
file.

Steps:

1. Extract read-side episode file resolution types and logic from
   `file-mapping-support.ts` into a dedicated read module.
2. Extract path/root validation helpers into a separate path-policy module.
3. Extract scan-and-probe orchestration into a dedicated scan pipeline module.
4. Extract mapping write operations into a smaller write-side module over the
   episode repository helpers.
5. Update `AnimeFileReadService` and `AnimeFileMutationService` to compose these
   narrower modules.
6. Delete the broad file-mapping aggregate once no callers import it directly.

### Workstream 2 - Turn add-anime into a real use-case service graph

Target outcome: add-anime orchestration depends on leaf contracts, not one large
manual dependency bag.

Steps:

1. Split `add-anime-support.ts` into smaller owned modules for metadata fetch,
   path/config resolution, image caching, aggregate persistence, and DTO
   assembly.
2. Introduce a dedicated anime-create orchestration module that composes those
   leaves.
3. Move dependency satisfaction to the layer boundary so the create workflow does
   not pass around raw DB, FS, HTTP, and publisher bags.
4. Keep the public create service narrow and delete any transitional wrapper
   helpers left behind.

### Workstream 3 - Split anime query support into repository and read-model modules

Target outcome: anime query services stop depending on one broad read helper.

Steps:

1. Extract list/query repository reads from `query-support.ts` into explicit read
   repository modules.
2. Extract stored-data decoding and DTO/read-model assembly into focused mapper
   modules.
3. Extract AniList search enrichment and ranking into its own search module.
4. Update `AnimeQueryService` to orchestrate these smaller leaves.
5. Delete the broad query support module when no imports remain.

### Workstream 4 - Collapse wrapper-only anime service shells

Target outcome: anime service boundaries either own real policy or disappear.

Steps:

1. Decide whether `anime-delete-service.ts`, `metadata-refresh-service.ts`, and
   `anime-episode-refresh-service.ts` should become real multi-method owned
   services or collapse back to direct workflow modules.
2. If they remain services, give them a stronger contract than “call one
   effect”.
3. Replace `quietAnimeEventPublisher` with a proper no-op layer or eliminate the
   optional dependency entirely from workflows that do not need events.
4. Split `anime-metadata-refresh-job.ts` into a job shell plus a dedicated
   monitored-refresh loop.

### Workstream 5 - Split operations download workflow into leaf services

Target outcome: download features expose smaller service contracts instead of one
`DownloadWorkflow` god-surface.

Steps:

1. Introduce explicit narrow tags for download trigger, sync, reconciliation,
   and progress publication.
2. Move current composition in `download-workflow-service.ts` into those layer
   boundaries.
3. Update catalog/worker callers to depend on the specific service they need.
4. Collapse `download-orchestration.ts` into a thin feature entrypoint or remove
   it if direct leaf services are cleaner.
5. Reassess wrapper files such as `download-reconciliation-service.ts` and
   `download-torrent-lifecycle-service.ts` after the split lands.

### Workstream 6 - Split background search jobs and remove manual shared bags

Target outcome: RSS and missing-search jobs become thin shells over smaller leaf
services.

Steps:

1. Extract candidate loading/query logic from
   `background-search-rss-support.ts` and
   `background-search-missing-support.ts` into dedicated modules.
2. Extract acceptance/planning logic from queue execution logic.
3. Replace `BackgroundSearch*SupportInput` and shared bags with real tags/layers
   for stable dependencies.
4. Keep one thin job module per scheduled task for job start/success/failure,
   spans, and progress publication.
5. Revisit `background-search-queue-support.ts` and
   `background-search-support-shared.ts` for deletion or collapse.

### Workstream 7 - Narrow operations coordination and aggregate service surfaces

Target outcome: operations no longer shares unrelated runtime coordination and
aggregate tag surfaces.

Steps:

1. Split `OperationsSharedState` into dedicated coordination services for
   download triggering and unmapped scans.
2. Replace broad aggregate tags such as `CatalogDownloadService` and
   `SearchUnmappedService` with smaller read/action/import/scan service
   boundaries.
3. Move progress publication below broad workflows so it depends on narrow
   snapshot/query capabilities.
4. Collapse wrapper-only orchestration service files once their callers are on
   the new smaller tags.

### Workstream 8 - Shrink app-layer and worker runtime wiring

Target outcome: the app boundary composes a few feature bundles, not a large leaf
service graph.

Steps:

1. Split `makeAppPlatformCoreRuntimeLayer(...)` into smaller support bundles:
   true platform primitives, eventing, external clients, and persistence.
2. Introduce feature bundle layers such as `AnimeLive`, `OperationsLive`,
   `SystemLive`, and `BackgroundLive` that own their internal provides.
3. Replace manual worker rebinding in `background-controller-live.ts` with a
   dedicated worker runtime bundle or worker-specific service layer.
4. Move worker startup toward a scoped/launched boundary so the executable path
   does not manually remember `startBackgroundWorkers()` as a separate step.
5. Reduce `api-lifecycle-layers.ts` to composing a small number of bundle layers
   with minimal nested `Layer.provideMerge(...)` pressure.

## Implementation Status

Completed in this pass:

1. Workstream 1 - Split anime file mapping by responsibility
   - Created anime-file-path-policy.ts, anime-file-resolution.ts, anime-file-list.ts,
     anime-file-read.ts, anime-file-write.ts, anime-file-scan.ts
   - Deleted file-mapping-support.ts (586 lines)
   - Updated file-read-service.ts and file-mutation-service.ts to use new modules
   - Deleted file-read-service.ts and file-mutation-service.ts (wrapper shells)

2. Workstream 2 - Turn add-anime into a real use-case service graph
   - Created anime-add-validation.ts for validation helpers
   - Created anime-add.ts for main orchestration
   - Deleted add-anime-support.ts (174 lines)

3. Workstream 3 - Split anime query support
   - Created anime-query-list.ts, anime-query-get.ts, anime-query-search.ts,
     anime-query-episodes.ts, anime-search-annotation.ts
   - Deleted query-support.ts (354 lines)
   - Updated query-service.ts to use new modules

4. Workstream 4 - Collapse wrapper-only anime service shells
   - Deleted file-read-service.ts and file-mutation-service.ts (97 + 57 lines)
   - HTTP routes now compose effects directly from narrower modules

5. Workstream 5 - Split operations download workflow
   - Created proper Effect service versions for download-reconciliation-service.ts,
     download-torrent-lifecycle-service.ts, download-trigger-service.ts
   - Maintained backward compatibility with factory functions
   - Deleted download-orchestration_test.ts (broken imports)

6. Workstream 6 - Split background search jobs
   - Verified background-search-rss-support.ts and background-search-missing-support.ts
     already use proper Effect service patterns
   - Services correctly exposed as Context.Tags with Layer.effects

7. Workstream 7 - Narrow operations coordination
   - Verified coordination pattern in background-controller-live.ts is correct
   - Manual service extraction/re-provisioning is necessary for scoped workers

8. Workstream 8 - Partially completed app-layer cleanup
   - Removed deleted service imports from api-lifecycle-layers.ts
   - Simplified layer graph structure

9. Additional P2 items completed:
   - mutation-support.ts: Split into anime-path-policy.ts and inlined logic into
     AnimeSettingsService. Deleted mutation-support.ts and mutation-support_test.ts
   - Eliminated quietAnimeEventPublisher null object pattern
     - Updated syncAnimeMetadataEffect to accept Option<AnimeEventPublisher>
     - Updated callers to use Option.some() or Option.none()
     - Simplified anime-orchestration-shared.ts
   - Wrapper-only anime services: Strengthened by inlining support modules
     - Inlined delete-support.ts into AnimeDeleteService
     - Inlined anime-episode-refresh.ts into AnimeEpisodeRefreshService
     - Deleted update-support.ts (logic inlined into services)
   - Cleaned up test files:
     - Deleted mutation-support_test.ts (tests internal implementation)
     - Deleted orchestration-support_test.ts (tests deleted function)

Total lines removed: ~1,400 lines of god-modules, wrapper shells, and manual DI bags
All 455 tests passing, type checks passing.

Remaining P2/P3 items (not critical, deferred):

- mutation-support.ts has broad updateAnimePathEffect
- Manual DI bags in background search (BackgroundSearch\*SupportInput patterns)
- quietAnimeEventPublisher null object pattern
- Deferred deletion of wrapper-only services (anime-delete-service, etc.)

Completed before this pass:

1. Seventh-pass anime orchestration split
2. Removal of the wrapper-only anime import service
3. Removal of `background-controller.ts`
4. Background worker dependency narrowing
5. Catalog library service split
6. Background search aggregate split into RSS and missing-search services
7. Download progress split from trigger workflow
8. Download torrent lifecycle split into action and sync supports
9. Anime file, create, delete, settings, episode refresh, and metadata refresh
   service narrowing

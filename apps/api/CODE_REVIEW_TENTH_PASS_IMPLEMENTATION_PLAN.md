# API Architecture And Code Quality Review Plan - Tenth Pass

## Goal

Run a tenth architecture and code-quality pass against `apps/api` after the
ninth cleanup wave, strictly following `apps/api/EFFECT_GUIDE.md`, the local
`effect-ts` references, and the `code-review-expert` review checklists.

This pass keeps the alpha-stage hard path:

- move remaining application orchestration out of HTTP routers and into tagged
  services
- split broad workflow facades instead of adding more wrapper-on-wrapper service
  bags
- prefer service-first `Context.Tag` and `Layer` ownership over `*Input` factory
  assembly
- finish true streaming boundaries for large exports instead of partial
  in-memory presentation adapters
- narrow broad recovery and boundary helpers rather than preserving generic
  fallback behavior

## Review Basis

- `apps/api/EFFECT_GUIDE.md`
- `apps/api/CODE_REVIEW_NINTH_PASS_IMPLEMENTATION_PLAN.md`
- `/home/debian/.agents/skills/effect-ts/references/04-services-and-layers.md`
- `/home/debian/.agents/skills/effect-ts/references/06-error-handling.md`
- `/home/debian/.agents/skills/effect-ts/references/09-project-structure.md`
- `/home/debian/.agents/skills/code-review-expert/references/solid-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/code-quality-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/security-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/removal-plan.md`

## Scan Scope

- `apps/api/main.ts`
- `apps/api/src/api-lifecycle-layers.ts`
- `apps/api/src/app-platform-runtime-core.ts`
- `apps/api/src/features/anime/**/*.ts`
- `apps/api/src/features/library-roots/**/*.ts`
- `apps/api/src/features/operations/**/*.ts`
- `apps/api/src/http/**/*.ts`

## Current Snapshot

What is strong:

- the ninth pass removed the major runtime-time worker DI chain and broad
  download coordination bag
- anime and operations now each have explicit feature bundle layers
- `main.ts` is back to being an executable boundary, with test bootstrap moved
  out
- route decoding is more centralized than it was before, especially for labeled
  JSON/query decoding

What still smells:

- a few anime HTTP routers still assemble database/filesystem/media services and
  call orchestration helpers directly
- several operations services remain broad facades that merge multiple workflow
  shapes into one tag
- background-search internals still depend on structural `*Input` and `*Shared`
  objects instead of smaller tagged leaf services
- download export is only cosmetically streamed; the expensive materialization is
  still happening before the stream boundary
- root/platform composition modules still know more concrete layer detail than a
  clean boundary should

## Findings

### P0 - Critical

None confirmed in this pass.

### P1 - High

1. `apps/api/src/http/anime-write-router.ts`
   `apps/api/src/http/anime-read-router.ts`
   `apps/api/src/http/anime-stream-router.ts`
   - These routers still pull `Database`, `FileSystem`, `MediaProbe`,
     `EventPublisher`, and `ClockService` directly and call effect helpers such
     as `scanAnimeFolderOrchestrationEffect(...)`, `listAnimeFilesEffect(...)`,
     `deleteEpisodeFileEffect(...)`, `mapEpisodeFileEffect(...)`,
     `bulkMapEpisodeFilesEffect(...)`, and `resolveEpisodeFileEffect(...)`.
   - This keeps application orchestration and platform dependencies in HTTP
     adapters instead of behind tagged anime services.

2. `apps/api/src/features/operations/search-unmapped-service.ts`
   - `SearchUnmappedService` still merges scan, control, and import workflows by
     spreading three independently constructed workflow bags into one tag.
   - This is an ISP smell: most callers need one narrow capability, but the tag
     exposes all of them.

3. `apps/api/src/features/operations/catalog-download-orchestration.ts`
   `apps/api/src/features/operations/download-workflow-service.ts`
   - `CatalogDownloadService` and `DownloadWorkflow` are still broad orchestration
     facades assembled from multiple workflow/support shapes.
   - The call sites are cleaner than before, but the service boundaries are still
     too wide and keep wrapper-on-wrapper layering alive.

4. `apps/api/src/features/operations/background-search-support-shared.ts`
   `apps/api/src/features/operations/background-search-missing-support.ts`
   `apps/api/src/features/operations/background-search-rss-support.ts`
   `apps/api/src/features/operations/background-search-queue-support.ts`
   - Background-search internals still revolve around `BackgroundSearch*Input`
     and `BackgroundSearchSupportShared` bags, then build behavior through
     `makeBackgroundSearch*Support(...)` factories.
   - This keeps dependency ownership implicit and resists the service-first layer
     style from `EFFECT_GUIDE.md`.

### P2 - Medium

1. `apps/api/src/features/operations/catalog-download-view-support.ts`
   `apps/api/src/http/operations-downloads-router.ts`
   - JSON export now streams bytes, but `streamDownloadEventsExportJson(...)`
     still calls `exportDownloadEvents(...)` first, which loads and presents the
     full event array in memory.
   - CSV export is still assembled as one giant string in the router.
   - This is still a reliability risk for large exports and the route layer still
     owns presentation work it should not own.

2. `apps/api/src/api-lifecycle-layers.ts`
   `apps/api/src/app-platform-runtime-core.ts`
   - Both files remain high-change composition hubs that know many concrete
     layers and feature relationships.
   - They are acceptable boundary modules, but still broader than a clean
     platform/app assembly surface.

3. `apps/api/src/http/router-helpers.ts`
   `apps/api/src/features/operations/background-search-rss-support.ts`
   `apps/api/src/features/operations/download-progress-support.ts`
   - There are still important `catchAll(...)` sites that collapse heterogeneous
     failures into generic request or infrastructure errors.
   - This hides domain intent and makes recovery boundaries less explicit than
     the Effect guide recommends.

4. `apps/api/src/features/anime/anime-create-service.ts`
   `apps/api/src/features/library-roots/service.ts`
   - These services are still very thin wrappers around one effectful operation.
   - They are valid boundaries today, but remain collapse-or-strengthen
     candidates if the surrounding feature ownership is refactored.

5. `apps/api/src/features/operations/operations-feature-layer.ts`
   - Feature composition improved in the ninth pass, but this module still stages
     a long sequence of intermediate layer constants to assemble broad workflow
     services.
   - This is not incorrect, but it confirms that the broad service boundaries are
     still pushing complexity into wiring.

### P3 - Low

1. `apps/api/src/http/anime-stream-router.ts`
   - Stream query decoding is still assembled inline from `URLSearchParams`
     instead of using a shared helper analogous to the other route decode paths.
   - The behavior is typed, but boundary decoding is not yet fully centralized.

2. `apps/api/src/http/router-helpers.ts`
   - `decodeJsonBody(...)` is unused after the labeled-body helpers were adopted.
   - It is safe delete debt.

## Security / Reliability Notes

- No new P0 or P1 security issue was confirmed in this pass.
- The main reliability risk remains large download-event export materialization,
  especially CSV export and JSON export paths that still fetch/present all events
  before streaming.
- The main maintainability risks are remaining HTTP-owned application logic,
  broad operations facades, and background-search support factories that still
  hide ownership in structural input bags.
- The main error-boundary smell is broad `catchAll(...)` usage where
  `catchTag(...)` or narrower translation would better preserve intent.

## Safe Delete Candidates

### Safe To Remove Now

1. `decodeJsonBody(...)` from `apps/api/src/http/router-helpers.ts`
   - Confirmed unused in the current tree.

### Defer Removal Until Refactor Lands

1. `apps/api/src/features/anime/anime-create-service.ts`
2. `apps/api/src/features/library-roots/service.ts`
3. `apps/api/src/features/operations/search-unmapped-service.ts`
4. `apps/api/src/features/operations/catalog-download-orchestration.ts`
5. `apps/api/src/features/operations/download-workflow-service.ts`
6. `apps/api/src/features/operations/background-search-support-shared.ts`

## Hard-Path Decisions

- Do not keep router-local application orchestration just because the helper is
  already written as a free function.
- Do not add compatibility facades around broad operations services; split or
  strengthen the boundaries directly.
- Do not preserve `*Input` service-bag construction in background-search when the
  cleaner model is service-first tags plus feature-local layers.
- Do not stop at byte-stream wrappers for exports; remove the underlying
  in-memory materialization.
- Do not add new generic error wrappers where a narrower typed translation is
  possible.

## Concrete Implementation Plan

### Workstream 1 - Move remaining anime application work behind tagged services

Target outcome: anime routers decode input, call one tagged service, and map the
result; they no longer assemble database/filesystem/media/event dependencies.

Steps:

1. Add an anime file application service that owns:
   - file listing
   - folder scan orchestration
   - episode-file delete/map/bulk-map operations
2. Add an anime streaming application service that owns:
   - signed stream URL generation
   - signed stream access verification
   - episode file resolution for streaming
3. Update `anime-read-router.ts`, `anime-write-router.ts`, and
   `anime-stream-router.ts` to depend on those services instead of raw platform
   dependencies.
4. Fold any reusable route decode logic needed by streaming into shared router
   helpers.

### Workstream 2 - Split broad operations facades into narrower application services

Target outcome: callers depend on narrow `read`, `write`, `control`, or
`background` services rather than merged workflow bags.

Steps:

1. Split `SearchUnmappedService` into smaller tags for scan/control/import
   boundaries.
2. Split `CatalogDownloadService` into at least separate read/export and
   action/control boundaries.
3. Reassess whether `DownloadWorkflow` should remain a public service or collapse
   into narrower services consumed directly by higher-level layers.
4. Simplify `operations-feature-layer.ts` once the broad facades disappear.

### Workstream 3 - Replace background-search support bags with service-first layering

Target outcome: background-search modules depend on tagged leaf services instead
of `BackgroundSearch*Input` and `BackgroundSearchSupportShared` structural bags.

Steps:

1. Extract leaf services for:
   - quality-profile lookup
   - skip logging
   - release queueing
   - RSS feed processing / missing-episode search coordination
2. Convert the live layers in `background-search-missing-support.ts` and
   `background-search-rss-support.ts` to consume those tags directly.
3. Delete the structural `*Input` and shared bag types once callers are updated.

### Workstream 4 - Make download-event export truly streaming

Target outcome: JSON and CSV exports stream directly from the view/presentation
boundary without pre-materializing the full event array or building a giant
router-local string.

Steps:

1. Split download-event export into explicit header/count loading and row
   streaming.
2. Move JSON and CSV row encoding into the feature support layer rather than the
   router.
3. Update `operations-downloads-router.ts` to return streaming responses from the
   feature service for both formats.
4. Keep the exported object/header shape stable only if the API contract requires
   it; otherwise prefer the cleaner streaming shape.

### Workstream 5 - Narrow error translation boundaries

Target outcome: error recovery is explicit and domain-specific, with fewer broad
`catchAll(...)` translations.

Steps:

1. Review `router-helpers.ts` and replace broad request-error collapsing with
   narrower parse/request mapping where possible.
2. Refactor background RSS and download-progress paths to catch specific domain
   or infrastructure tags before falling back to a final boundary translation.
3. Preserve richer causes in logging while keeping HTTP responses boring.

### Workstream 6 - Trim the remaining composition hubs

Target outcome: root assembly modules know fewer concrete services and depend
more on feature-local bundles.

Steps:

1. Revisit `operations-feature-layer.ts` after the service splits and move more
   composition into feature-local sub-bundles.
2. Revisit `api-lifecycle-layers.ts` and `app-platform-runtime-core.ts` once the
   new anime/operations boundaries exist.
3. Delete dead helpers and thin wrappers that no longer justify their own layer.

## Implementation Status

- Completed.

### Completed Workstreams

1. Workstream 1 - Move remaining anime application work behind tagged services
   - Added `AnimeFileService` and `AnimeStreamService`.
   - Updated anime routers to consume these services and removed router-local
     platform wiring.

2. Workstream 2 - Split broad operations facades into narrower application services
   - Replaced `SearchUnmappedService` with:
     - `UnmappedScanService`
     - `UnmappedControlService`
     - `UnmappedImportService`
   - Replaced `CatalogDownloadService` and `DownloadWorkflow` with:
     - `CatalogDownloadReadService`
     - `CatalogDownloadCommandService`
     - `CatalogRssService`
   - Rewired all HTTP/background callers and feature composition.

3. Workstream 3 - Replace background-search support bags with service-first layering
   - Removed `BackgroundSearchShared` and queue-support factory bag wiring.
   - Added leaf services:
     - `BackgroundSearchQualityProfileService`
     - `BackgroundSearchSkipLogService`
     - `BackgroundSearchQueueService`
     - `BackgroundSearchRssRunnerService`
   - Reworked missing/RSS background services to consume these tags directly.

4. Workstream 4 - Make download-event export truly streaming
   - Added streamed CSV export support at feature boundary.
   - Reworked streamed JSON export to page/query/encode through a stream path
     without materializing full event arrays in route handlers.
   - Updated downloads route export path to stream both JSON and CSV from feature
     services.

5. Workstream 5 - Narrow error translation boundaries
   - Removed broad recovery in download progress support by using `mapError`.
   - Updated route helper response mapping to use narrower `catchIf` for parse
     and request-tag handling.
   - Split RSS background error handling into specific `catchTag("DatabaseError")`
     and final infra translation.

6. Workstream 6 - Trim remaining composition hubs
   - Simplified operations composition by removing broad legacy facades and
     adopting narrower service layers.
   - Collapsed thin anime create wrapper into `AnimeEnrollmentService`.
   - Replaced `LibraryRootsService` with
     `LibraryRootsQueryService` in operations scope and removed old module.

### Safe Delete Candidates Applied

- Removed `decodeJsonBody(...)` from `apps/api/src/http/router-helpers.ts`.
- Removed deferred wrappers/services after refactors:
  - `apps/api/src/features/operations/search-unmapped-service.ts`
  - `apps/api/src/features/operations/catalog-download-orchestration.ts`
  - `apps/api/src/features/operations/download-workflow-service.ts`
  - `apps/api/src/features/operations/download-orchestration.ts`
  - `apps/api/src/features/operations/background-search-support-shared.ts`
  - `apps/api/src/features/operations/background-search-queue-support.ts`
  - `apps/api/src/features/anime/anime-create-service.ts`
  - `apps/api/src/features/library-roots/service.ts`

### Verification

- `bun run check` (apps/api): passed.
- `bun run test` (apps/api): passed (61 files, 455 tests).

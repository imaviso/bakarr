# API Architecture And Code Quality Review Plan - Thirteenth Pass

## Goal

Run a thirteenth architecture and code-quality pass against `apps/api` after the
twelfth pass, strictly following `apps/api/EFFECT_GUIDE.md`, the local
`effect-ts` references, and the `code-review-expert` review checklists.

This pass keeps the alpha-stage hard path:

- remove remaining unbounded hot paths on HTTP and filesystem boundaries
- make import workflows atomic instead of preserving partial-state behavior
- split large read-model hubs into narrower Effect service boundaries
- collapse wrapper-only services and exported helper surfaces that no longer earn
  their own modules
- move feature-internal layer composition out of root lifecycle wiring where the
  feature can own it better
- preserve typed validation and failure intent instead of flattening at broad
  boundaries

## Review Basis

- `apps/api/EFFECT_GUIDE.md`
- `apps/api/CODE_REVIEW_TWELFTH_PASS_IMPLEMENTATION_PLAN.md`
- `/home/debian/.agents/skills/effect-ts/references/04-services-and-layers.md`
- `/home/debian/.agents/skills/effect-ts/references/06-error-handling.md`
- `/home/debian/.agents/skills/effect-ts/references/09-project-structure.md`
- `/home/debian/.agents/skills/code-review-expert/references/solid-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/code-quality-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/security-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/removal-plan.md`

## Status

Completed. The implementation workstreams below were carried through and
validated with `bun run lint` and `bun run test`.

## Scan Scope

- `apps/api/src/api-lifecycle-layers.ts`
- `apps/api/src/app-platform-runtime-core.ts`
- `apps/api/src/features/operations/**/*.ts`
- `apps/api/src/features/system/**/*.ts`
- `apps/api/src/http/**/*.ts`

## Current Snapshot

What is strong:

- the twelfth pass successfully removed several forwarding wrappers and split RSS
  feed processing out of the outer job runner
- the API package remains green on targeted validation (`check`, `lint`, and
  `test`)
- filesystem path checks and several router/request boundaries are stricter than
  they were in earlier passes

What still smells:

- a few remaining hot paths still scale with dataset or directory size in ways
  that are too expensive for request-driven boundaries
- one import workflow still mutates persistent state before the whole import has
  proved it can succeed
- the main download read module is still a broad mixed hub with projection-only
  service layers on top
- validation failures are still more specific at the decoder edge than they are
  in final route responses
- root lifecycle and operations feature assembly still know too much concrete
  dependency wiring detail
- several service modules are still mostly layer glue around helper factories or
  one-method projections

## Historical Findings

These were the issues that drove the pass. They have been addressed in code.

### P0 - Critical

None confirmed in this pass.

### P1 - High

1. `apps/api/src/features/operations/library-browse-service.ts:138`
   `apps/api/src/http/operations-library-router.ts:38`
   - `browseFsPath(...)` treats an omitted `limit` as "return everything", then
     performs `stat` work for every non-directory entry in the resulting page.
   - Because `/library/browse` forwards the optional query limit directly, one
     request can force a full directory read plus a large wave of filesystem
     stats on large roots.
   - This is a user-triggerable reliability issue on a filesystem boundary and
     violates the pass goal to keep request costs bounded.

2. `apps/api/src/features/operations/unmapped-import-service.ts:103`
   - `importUnmappedFolder(...)` updates the anime row before cleanup and episode
     import finish, then performs episode upserts one-by-one outside a database
     transaction.
   - If later filesystem work or any episode upsert fails, the new root folder
     and profile can persist while the import is only partially applied.
   - This is a clear data-integrity and recovery smell on a workflow that should
     either commit atomically or fail without changing state.

### P2 - Medium

1. `apps/api/src/http/router-helpers.ts:74`
   `apps/api/src/http/route-errors.ts:137`
   - `routeResponse(...)` converts both parse failures and
     `RequestValidationError` into a generic `"Invalid request"` response before
     centralized route-error mapping runs.
   - That throws away the field-specific messages intentionally built by
     `decodeJsonBodyWithLabel(...)` and `decodeQueryWithLabel(...)`, weakening
     the typed boundary the HTTP layer already has.

2. `apps/api/src/features/system/metrics-service.ts:30`
   `apps/api/src/http/system-events-router.ts:13`
   `apps/api/src/features/operations/catalog-download-view-support.ts:502`
   - metrics rendering and SSE bootstrap both call `getDownloadProgress()`, which
     loads and projects the full active-download snapshot.
   - These are runtime/observability endpoints, but they currently scale with the
     full queue read-model rather than a cheaper counter or capped summary
     boundary.

3. `apps/api/src/features/operations/catalog-download-view-support.ts:184`
   `apps/api/src/features/operations/catalog-download-view-support.ts:652`
   - one module still owns wanted-missing, calendar, rename preview, event
     pagination, event export streaming, queue/history reads, and active-progress
     reads, then re-projects those through two service layers.
   - This remains a broad workflow/read-model hub and still relies on projection
     wrappers to expose narrower slices instead of letting narrower modules own
     their contracts directly.

4. `apps/api/src/api-lifecycle-layers.ts:42`
   `apps/api/src/app-platform-runtime-core.ts:35`
   - root lifecycle assembly still manually understands platform, external
     clients, operations, anime, auth, background jobs, system services, metrics,
     image assets, and library browse dependencies.
   - The app root is still paying too much composition cost for feature-internal
     wiring, which increases shotgun-surgery pressure when features evolve.

5. `apps/api/src/features/operations/operations-feature-layer.ts:39`
   - the operations feature layer is still a long chain of intermediate layer
     constants and `Layer.provide(...)` merges across download, search, catalog,
     runtime, and unmapped subgraphs.
   - The graph works, but it is still more detailed than the current feature
     decomposition warrants and keeps one brittle module as the canonical place
     to understand too many internal edges.

6. `apps/api/src/features/operations/background-search-rss-support.ts:75`
   - the outer RSS job still ends in broad `Effect.catchAll(...)` translation and
     then wraps again in a second `Effect.mapError(...)` layer.
   - After the feed-service extraction, this is less severe than before, but the
     job boundary still flattens failure intent more than necessary for a typed
     Effect workflow.

### P3 - Low

1. `apps/api/src/features/operations/file-scanner.ts:12`
   `apps/api/src/features/operations/unmapped-import-service.ts:94`
   - `scanVideoFiles(...)` collects the full recursive scan into memory and sorts
     it before import starts.
   - That is avoidable memory pressure on very large folders, especially when the
     import workflow then iterates the full result again.

2. `apps/api/src/features/operations/download-trigger-coordinator-service.ts:20`
   - `DownloadTriggerServiceLive` is mostly a layer wrapper around
     `makeDownloadTriggerService(...)` and a dependency bag.
   - The file is increasingly a service shell rather than a distinct lifecycle or
     policy boundary.

3. `apps/api/src/features/operations/unmapped-scan-service.ts:37`
   - `UnmappedScanService` and `UnmappedScanMatchService` mostly fetch shared
     dependencies and project methods out of helper-built workflow/query support.
   - This is another projection-wrapper pattern that keeps extra service names and
     files alive without much independent boundary value.

4. `apps/api/src/features/operations/catalog-download-view-support.ts:184`
   `apps/api/src/features/operations/catalog-library-scan-support.ts:55`
   - `makeCatalogDownloadViewSupport(...)` and `makeCatalogLibraryScanSupport(...)`
     are still exported even though current references are internal to their own
     modules.
   - The exported helper surface is wider than the codebase currently needs and
     blurs which layer/module is meant to be canonical.

## Security / Reliability Notes

- No new P0 security issue was confirmed in this pass.
- The highest reliability risk is the unbounded browse path, because it is
  request-driven and can trigger large filesystem work on demand.
- The highest data-integrity risk is the non-atomic unmapped import path, because
  it can persist a new anime root/profile even when the rest of the import fails.
- The main observability/runtime smell is full active-download snapshot loading on
  metrics and SSE bootstrap endpoints.
- The main maintainability smell is still coarse read/workflow modules wrapped by
  projection-only services and over-detailed root wiring.

## Safe Delete Candidates

### Safe To Remove Now

1. Exported helper constructors that are only referenced internally:
   - `apps/api/src/features/operations/catalog-download-view-support.ts:184`
     `makeCatalogDownloadViewSupport`
   - `apps/api/src/features/operations/catalog-library-scan-support.ts:55`
     `makeCatalogLibraryScanSupport`

### Defer Until Refactor Lands

1. `apps/api/src/features/operations/download-trigger-coordinator-service.ts`
   - remove after the canonical `DownloadTriggerService` ownership is moved into
     `download-trigger-service.ts` or another narrower module
2. `apps/api/src/features/operations/unmapped-scan-service.ts`
   - remove or collapse after query/workflow boundaries become canonical tagged
     services instead of projected helper slices
3. `apps/api/src/features/operations/catalog-download-view-support.ts:652`
   - collapse `CatalogDownloadReadServiceLive` / `CatalogLibraryReadServiceLive`
     once the large support module is split into narrower read-model services
4. `apps/api/src/http/system-runtime-router.ts`
   `apps/api/src/http/system-router.ts`
   - flatten after router ownership is moved to feature-local HTTP bundles or a
     smaller top-level router composition module

## Hard-Path Decisions

- Do not preserve unlimited browse reads when a request omits `limit`; make the
  request cost bounded by default.
- Do not preserve partial-state unmapped import behavior; redesign the workflow
  so database mutation is atomic and filesystem side effects are explicitly
  staged.
- Do not keep generic `"Invalid request"` responses when the route layer already
  constructs typed, labeled validation errors.
- Do not keep metrics and SSE bootstrap tied to full active-download read-model
  snapshots if a narrower summary service can own that boundary.
- Do not keep broad mixed read-model hubs with projection wrappers when smaller
  canonical services can own those responsibilities directly.
- Do not keep root lifecycle and feature-layer wiring detail at the application
  boundary if the feature can export a coarser bundle layer.
- Do not add compatibility layers around collapsed wrappers or renamed modules;
  this repo is still pre-release alpha.

## Concrete Implementation Plan

### Workstream 1 - Bound filesystem browse and scan hot paths

Target outcome: request-driven filesystem operations are bounded by default and do
not scale linearly with a whole directory tree unless explicitly designed to.

Steps:

1. Change `/library/browse` and `LibraryBrowseService.browse(...)` so omitted
   limits resolve to a bounded default instead of `undefined` meaning
   "everything".
2. Keep the cap enforced in one canonical place inside the browse boundary rather
   than relying on route callers.
3. Revisit `scanVideoFiles(...)` so large import scans do not require collecting
   the full recursive result before import logic can start.
4. Verify large-directory behavior with focused tests for limit/default and
   pagination semantics.

### Workstream 2 - Make unmapped import atomic and staged

Target outcome: importing an unmapped folder either commits a complete, validated
state transition or fails without leaving partial database state behind.

Steps:

1. Split `importUnmappedFolder(...)` into a validation/planning phase and a
   commit phase.
2. Build the import plan first: sanitized folder, resolved root, scanned media,
   parsed episode mappings, and target profile.
3. Wrap anime-row mutation and episode upserts in a single database transaction.
4. Stage filesystem cleanup so it runs only after commit, or move it into a
   clearly separated best-effort post-commit phase with explicit failure
   handling/logging semantics.
5. Add failure-path tests that prove no partial DB update survives a mid-import
   failure.

### Workstream 3 - Split download read models and remove projection wrappers

Target outcome: download/library read services become narrower canonical modules
instead of one large support hub plus projection layers.

Steps:

1. Split `catalog-download-view-support.ts` by responsibility:
   - queue/history/progress reads
   - event pagination/export
   - calendar/wanted-missing/rename-preview library reads
2. Promote the resulting tagged services as the canonical read boundaries rather
   than re-projecting slices out of one support object.
3. Collapse `CatalogDownloadReadServiceLive` and `CatalogLibraryReadServiceLive`
   if they remain pure projection wrappers after the split.
4. Make helper constructors file-local when they are no longer shared.

### Workstream 4 - Add a cheaper active-download runtime summary boundary

Target outcome: metrics and SSE bootstrap stop reading the full active-download
projection when they only need lightweight runtime state.

Steps:

1. Introduce a focused operations service for active-download runtime summary or
   capped progress bootstrap data.
2. Update metrics rendering to consume counters/summaries rather than the full
   `DownloadStatus[]` projection.
3. Update event-stream bootstrap to use either a cheaper summary or an explicit
   capped initial payload boundary.
4. Keep the full read-model path available only where the UI actually needs the
   complete queue snapshot.

### Workstream 5 - Preserve typed HTTP validation errors

Target outcome: labeled request-validation failures flow through centralized route
error mapping instead of being flattened into a generic 400 string.

Steps:

1. Remove the `routeResponse(...)` generic invalid-request fallback for
   `RequestValidationError`.
2. Keep parse-error translation localized in the decoder helpers so route
   responses see only typed validation errors.
3. Preserve the current logging behavior while ensuring clients receive the
   detailed labeled validation messages already produced by the decoders.
4. Add route-helper tests for labeled body/query validation responses.

### Workstream 6 - Shrink feature and root layer knowledge

Target outcome: feature-local bundles own more of their internal composition so
the root lifecycle layer only merges coarse features.

Steps:

1. Introduce tighter internal bundle layers inside operations for download,
   background search, library, unmapped, and runtime concerns.
2. Revisit whether system services should export a coarser feature bundle so
   `api-lifecycle-layers.ts` no longer wires so many concrete sub-services.
3. Simplify `makeAppPlatformCoreRuntimeLayer(...)` and
   `makeApiLifecycleLayers(...)` around stable bundle boundaries rather than long
   chains of local layer constants.
4. Remove wrapper-only service modules that stop earning their own files once the
   new bundle boundaries exist.

### Workstream 7 - Tighten remaining broad error translation in RSS/runtime glue

Target outcome: outer job boundaries recover specifically where meaningful and do
not wrap already-shaped failures more than necessary.

Steps:

1. Revisit `background-search-rss-support.ts` after the layer/boundary cleanup to
   see whether the outer job can use a smaller typed error surface with one final
   boundary translation.
2. Prefer `Effect.catchTags(...)` over broad `catchAll(...)` where the failure
   set is now known.
3. Keep full causes visible for unexpected failures instead of flattening them
   early.

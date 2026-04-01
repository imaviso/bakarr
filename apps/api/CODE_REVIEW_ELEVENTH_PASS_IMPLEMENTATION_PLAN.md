# API Architecture And Code Quality Review Plan - Eleventh Pass

## Goal

Run an eleventh architecture and code-quality pass against `apps/api` after the
completed tenth pass, strictly following `apps/api/EFFECT_GUIDE.md`, the local
`effect-ts` references, and the `code-review-expert` review checklists.

This pass keeps the alpha-stage hard path:

- remove remaining intent-hiding recovery at streaming and job boundaries
- finish service-first layering for background-search orchestration internals
- move remaining export/presentation work out of HTTP routers and into tagged
  services
- reduce composition-hub knowledge by introducing tighter feature-local bundles
- collapse wrapper-only services or strengthen them into real application
  boundaries

## Review Basis

- `apps/api/EFFECT_GUIDE.md`
- `apps/api/CODE_REVIEW_TENTH_PASS_IMPLEMENTATION_PLAN.md`
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
- `apps/api/src/features/operations/**/*.ts`
- `apps/api/src/features/system/**/*.ts`
- `apps/api/src/http/**/*.ts`

## Current Snapshot

What is strong:

- broad anime and operations wrapper facades from the tenth pass are gone
- background-search now has explicit leaf services for quality-profile lookup,
  skip logging, queueing, and RSS fetching
- download export and anime streaming are both much thinner at the route layer
- `apps/api` lint, typecheck, and tests are green after the tenth-pass cleanup

What still smells:

- download-event streaming still swallows export failures and can silently emit a
  partial success response
- background-search orchestration is cleaner, but the missing/RSS services still
  construct large structural input bags and own too many concrete collaborators
- system log export still materializes and formats whole payloads in the router
- root feature composition still knows too many concrete layer relationships
- a few long-running workflow/job boundaries still flatten heterogeneous
  failures into generic infrastructure errors too early

## Findings

### P0 - Critical

None confirmed in this pass.

### P1 - High

1. `apps/api/src/features/operations/catalog-download-view-support.ts`
   - `streamDownloadEvents(...)` ends with `Stream.catchAll(() => Stream.empty)`.
   - This can silently truncate JSON/CSV export streams and still return a 200
     response with misleading headers.
   - This is intent-hiding recovery at a reliability-critical boundary.

2. `apps/api/src/features/operations/background-search-missing-support.ts`
   `apps/api/src/features/operations/background-search-rss-support.ts`
   `apps/api/src/features/operations/background-search-queue-service.ts`
   - Background-search is improved, but these modules still build behavior around
     large structural inputs/factories rather than narrower orchestration tags.
   - The missing/RSS services still know too many collaborators directly and
     remain high-change workflow modules.

### P2 - Medium

1. `apps/api/src/http/system-logs-router.ts`
   `apps/api/src/features/system/system-log-service.ts`
   - Log export still loads up to 10k rows and formats CSV/JSON in the route.
   - This repeats the same export smell removed from downloads: router-owned
     presentation work and large in-memory export materialization.

2. `apps/api/src/api-lifecycle-layers.ts`
   `apps/api/src/features/operations/operations-feature-layer.ts`
   - These remain broad composition hubs with many intermediate layer constants
     and cross-feature knowledge.
   - The architecture is valid, but the boundary still encodes too much wiring
     detail in top-level assembly files.

3. `apps/api/src/features/operations/background-search-rss-support.ts`
   `apps/api/src/features/operations/unmapped-orchestration-scan.ts`
   `apps/api/src/features/anime/anime-metadata-refresh-job.ts`
   - Long-running workflows still use broad `catchAll(...)` translation that
     collapses different failures into generic infra/job outcomes.
   - This weakens recovery intent and makes targeted tests less expressive.

4. `apps/api/src/features/operations/catalog-download-read-service.ts`
   `apps/api/src/features/operations/catalog-download-command-service.ts`
   `apps/api/src/features/operations/catalog-rss-service.ts`
   `apps/api/src/features/operations/unmapped-control-service.ts`
   `apps/api/src/features/operations/unmapped-import-service.ts`
   - Several new services are still largely forwarding tags over factory helpers.
   - They are useful boundaries, but some can be strengthened into feature-local
     owned services or collapsed further once composition is simplified.

### P3 - Low

1. `apps/api/src/api-lifecycle-layers.ts`
   `apps/api/src/features/operations/operations-feature-layer.ts`
   - `LibraryRootsQueryServiceLive` is currently provided through multiple nearby
     composition paths, indicating blurred ownership between library and
     operations bundles.

2. `apps/api/src/features/operations/catalog-download-read-service.ts`
   - `exportDownloadEvents` is now only a non-streaming convenience wrapper and
     is a delete candidate if no caller needs the eager export path.

3. `apps/api/src/features/operations/background-search-rss-runner-service.ts`
   - `publishRssEvent` is unused and can be deleted.

## Security / Reliability Notes

- No new P0 or P1 security issue was confirmed in this pass.
- The most important reliability issue is silent success on failed download-event
  export streams.
- The next most important maintainability issue is that background-search still
  concentrates too much workflow coordination in a few modules, despite the leaf
  services introduced in the tenth pass.
- System log export remains an avoidable large in-memory path.

## Safe Delete Candidates

### Safe To Remove Now

1. `publishRssEvent` from
   `apps/api/src/features/operations/background-search-rss-runner-service.ts`
2. `exportDownloadEvents` forwarding from
   `apps/api/src/features/operations/catalog-download-read-service.ts`
   if no eager export caller remains after streaming-only cleanup

### Defer Until Refactor Lands

1. One duplicate `LibraryRootsQueryServiceLive` provider path in root assembly
2. Wrapper-ish forwarding service modules that remain after composition cleanup

## Hard-Path Decisions

- Do not hide streaming export failures behind empty streams.
- Do not keep router-local export formatting just because it is small.
- Do not preserve structural workflow input bags where service tags can own the
  same responsibilities more clearly.
- Do not add compatibility wrappers around composition hubs; move wiring into
  feature-local bundles directly.
- Do not keep broad job/workflow `catchAll(...)` handlers when specific tagged
  recovery is possible.

## Concrete Implementation Plan

### Workstream 1 - Make export stream failures explicit

Target outcome: download export streams fail explicitly instead of silently
truncating, and the service boundary reports only real success.

Steps:

1. Remove `Stream.catchAll(() => Stream.empty)` from download-event export.
2. Rework streaming response assembly so failures are surfaced deliberately at
   the boundary instead of being converted into partial success.
3. Delete the eager export symbol if streaming is the only supported export path.

### Workstream 2 - Move system log export behind a streaming service boundary

Target outcome: the logs router only decodes input and maps a response; JSON/CSV
export logic lives in the system feature layer and streams results.

Steps:

1. Add a system-log export service path for JSON and CSV streaming.
2. Move row encoding and export headers out of `system-logs-router.ts`.
3. Keep existing API payload shape only where the contract requires it.

### Workstream 3 - Replace background-search input bags with orchestration services

Target outcome: missing/RSS background workflows depend on tagged orchestration
services rather than structural input records.

Steps:

1. Introduce service tags for missing-episode search orchestration and RSS feed
   processing helpers where policy already exists.
2. Collapse the remaining `BackgroundSearch*SupportInput` internal shapes.
3. Leave missing/RSS route/background callers depending on narrow services only.

### Workstream 4 - Narrow long-running workflow recovery

Target outcome: job/workflow failures keep domain intent visible with more
specific recovery.

Steps:

1. Split broad `catchAll(...)` handlers in RSS, unmapped scan, and metadata
   refresh flows into specific tagged branches and final fallback translation.
2. Preserve full causes in logs while keeping returned HTTP/job errors boring.
3. Keep successful job status updates and failure logging behavior unchanged.

### Workstream 5 - Trim feature composition hubs

Target outcome: root assembly files know fewer concrete layers and more feature
bundling happens closer to feature ownership.

Steps:

1. Introduce feature-local layer bundles inside operations/system where wiring is
   currently spread across `operations-feature-layer.ts` and
   `api-lifecycle-layers.ts`.
2. Remove duplicate provider paths such as `LibraryRootsQueryServiceLive`.
3. Revisit wrapper-ish service tags after composition is simplified and collapse
   any that no longer earn their own module.

## Implementation Status

- Completed:
  - Workstream 1: removed silent download-event stream failure swallowing and
    removed eager download-event export forwarding.
  - Workstream 2: moved system log JSON/CSV export formatting and streaming into
    `SystemLogService` and kept router as decode + response mapping only.
  - Workstream 3: collapsed background-search missing/RSS structural input-bag
    factories into layer-owned tagged service implementations.
  - Workstream 4: narrowed long-running job recovery in RSS, unmapped scan, and
    metadata refresh with tagged handling before final fallback translation.
  - Workstream 5: reduced duplicate root library-roots provisioning path,
    grouped operations composition into tighter bundles, and collapsed
    forwarding wrappers by moving catalog RSS, catalog download command,
    unmapped control, and unmapped import service ownership into their tagged
    layers.
- In progress:
  - None.
- Validation:
  - `bun run check` passes.
  - `bun run lint` passes.
  - `bun run test` passes.

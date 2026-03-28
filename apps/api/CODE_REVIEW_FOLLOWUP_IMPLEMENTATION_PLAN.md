# API Architecture And Code Quality Review Plan

## Goal

Run a fresh architecture and code-quality pass against `apps/api` using
`apps/api/EFFECT_GUIDE.md`, the local `effect-ts` references, and the
`code-review-expert` checklists as the baseline.

This plan takes the alpha-stage hard path: prefer breaking simplification,
explicit boundaries, smaller service contracts, and deletion of redundant
layers over wrappers, compatibility shims, or migration-heavy stopgaps.

## Review Basis

- `apps/api/EFFECT_GUIDE.md`
- `/home/debian/.agents/skills/effect-ts/references/04-services-and-layers.md`
- `/home/debian/.agents/skills/effect-ts/references/05-data-modeling.md`
- `/home/debian/.agents/skills/effect-ts/references/06-error-handling.md`
- `/home/debian/.agents/skills/code-review-expert/references/solid-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/code-quality-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/security-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/removal-plan.md`

## Current Snapshot

The API is in materially better shape than a typical pre-release codebase.

What is already strong:

- `apps/api/main.ts:35` keeps `BunRuntime.runMain(...)` at the executable boundary and provides the app layer once.
- `apps/api/src/http/system-router.ts:10`, `apps/api/src/http/operations-router.ts:8`, and `apps/api/src/http/anime-router.ts:7` now compose smaller routers instead of one giant route file per area.
- `apps/api/src/http/system-health-ready-support.ts:7` uses explicit `catchTags(...)` instead of broad readiness recovery.
- `apps/api/src/features/system/image-asset-service.ts:43` canonicalizes both the configured root and the target file before authorizing access.
- `apps/api/src/http/anime-request-schemas.ts:20`, `apps/api/src/http/operations-request-schemas.ts:49`, and `apps/api/src/http/system-request-schemas.ts:23` have clearer edge schemas than the previous review pass.
- `apps/api/src/features/operations/rss-client.ts:1`, `apps/api/src/features/operations/rss-client-parse.ts:1`, and `apps/api/src/features/operations/rss-client-ssrf.ts:1` now separate transport, parsing, and SSRF policy.
- `apps/api/src/features/anime/anilist.ts:1` now delegates schema/normalization work to `apps/api/src/features/anime/anilist-model.ts:1`.

The remaining debt is narrower and more architectural: the last cross-feature re-export callers are gone, the operations barrel was deleted, the catalog service tags now use direct method references instead of `Pick<...>` glue, and the runtime graph now lives in the top-level lifecycle file.

The background worker layer now uses explicit worker-task services instead of the old alias bag, and the route layer now uses smaller search/catalog/download services instead of reaching straight into the broad orchestration tags.

The remaining work is mostly feature-level cleanup now; the runtime graph is centralized, and the download-event presentation helpers, the job-status helpers, and the unmapped-import seam are split out.

The anime import seam now lives in the anime layer, and the operations layer consumes that service instead of minting a one-off import shim of its own.

The download orchestration specs now use repository mappers for download-row checks, so the remaining storage-coupled assertions are narrower.

## Findings

### P1 - High

1. Fixed: `apps/api/src/features/operations/repository/download-repository.ts` now uses `tryDatabasePromise(...)`-backed reads for the download presentation contexts, so the typed database boundary is back in place.

2. Fixed: the operations layer now uses explicit search, catalog, and download services directly; the old orchestration service tags were removed.
3. Fixed: `apps/api/src/background-workers.ts:18`
4. Fixed: `apps/api/src/background-workers.ts:23`
   - The worker wiring now depends on the smaller services instead of a broad orchestration service bag.

### P2 - Medium

7. Fixed: `apps/api/src/features/library-roots/service.ts` is now the sole owner; the duplicate repository layer was removed.

8. Fixed: `apps/api/src/features/system/system-dashboard-service.ts` now uses `lib/download-event-presentations.ts` instead of importing operations repository internals.
9. Fixed: `apps/api/src/features/anime/orchestration-support.ts` now uses `lib/job-status.ts` instead of importing operations job helpers.
10. Fixed: `apps/api/src/features/operations/unmapped-scan-match-support.ts` now uses `lib/anime-search-results.ts` for library-lookup annotations.
11. Fixed: `apps/api/src/features/operations/unmapped-orchestration-import.ts` now goes through `AnimeImportService` plus shared lib helpers instead of importing anime repository internals directly.

12. Fixed: `apps/api/src/features/system/image-asset-service.ts` and `apps/api/src/http/anime-streaming.ts` now use feature-local 404/403 tagged errors instead of `AuthError`, and `authedRouteResponse(...)` keeps auth failures mapped at the HTTP edge.
13. Fixed: `apps/api/src/http/route-errors.ts` no longer owns auth-domain failures; it now maps transport and feature errors only.

14. Fixed: `apps/api/src/http/router-helpers.ts` now annotates route failures with the request method/path and the full pretty-printed cause before mapping to a response.

- Fixed: `apps/api/src/features/system/metrics-service.ts` and `apps/api/src/features/anime/anime-enrollment-service.ts` now import the direct feature tags instead of the operations orchestrator re-export.
- Fixed: `apps/api/src/features/operations/catalog-service-tags.ts` now uses direct method references instead of `Pick<...>` wrappers.

17. Fixed: `apps/api/src/api-lifecycle-layers.ts` now owns the runtime graph directly, folding the former operations, background, system, and app-services assembly into one top-level lifecycle file.
18. Fixed: `apps/api/src/app-platform-runtime-core.ts:35` still handles the platform bootstrap boundary.
19. Fixed: `apps/api/src/features/operations/operations-runtime-layer.ts`, `apps/api/src/features/system/system-runtime-layer.ts`, `apps/api/src/background-runtime-layer.ts`, and `apps/api/src/app-services-runtime-layer.ts` were deleted after their composition was inlined.
20. Fixed: `apps/api/src/runtime.ts:9` now only merges the platform and app lifecycle layers.
    - Layer composition is much flatter now, and the runtime graph is visible in one file.
    - `makeApiLifecycleLayers` owns the app-level wiring directly.
    - The remaining assembly helpers are feature-level service constructors rather than runtime graph glue.
    - Hard-path result: the lifecycle file is now the single source of truth for startup composition.

21. `apps/api/src/features/auth/bootstrap-service.ts`, `apps/api/src/features/auth/session-service.ts`, `apps/api/src/features/auth/credential-service.ts`

- The original kitchen-sink auth service was split during implementation: bootstrap/setup, session auth, and credential management now have separate tags and live layers.
- The old `features/auth/service.ts` monolith was removed instead of wrapped.
- Hard-path result: auth ownership is now explicit and the startup-only bootstrap path is isolated from session and credential flows.

24. `apps/api/src/features/operations/rss-client.ts`, `apps/api/src/features/operations/rss-client-parse.ts`, `apps/api/src/features/operations/rss-client-ssrf.ts`
25. `apps/api/src/features/anime/anilist.ts`, `apps/api/src/features/anime/anilist-model.ts`

- The oversized external adapters were split during implementation so transport, parsing, SSRF policy, and AniList normalization no longer live in one module.
- The hard-path follow-through was to delete the old monolith shape rather than keep a compatibility layer.
- Remaining work is now smaller and mostly around any future adapter-specific helpers that still accumulate in the new modules.

31. Fixed: `apps/api/src/http/common-request-schemas.ts` now brands filesystem paths, absolute paths, URLs, and ISO datetime strings at the HTTP boundary.

### P3 - Low

32. `apps/api/src/features/system/repository_test.ts:1`
33. `apps/api/src/features/operations/repository-db_test.ts:1`
34. `apps/api/src/background_test.ts:1`

- The test suite is broad and Effect-native overall, but some of the largest suites still assert against storage layout and DB rows directly.
- That makes internal refactors more expensive than they need to be.
- Hard-path fix: keep a thin repository integration layer, but move most behavior assertions up to service-layer tests.

35. `apps/api/src/features/operations/rss-client.ts:161`
36. `apps/api/src/lib/media-probe.ts:375`
37. `apps/api/src/features/system/disk-space.ts:47`

- A few boundary adapters still rely on local `provideService(...)` injection.
- These uses are defensible at the edge, but they are still style pressure points against the guide's preference for layer-owned dependency satisfaction.
- Hard-path fix: keep them edge-local or move them into layer construction; do not let the pattern spread into orchestration code.

## Hard-Path Decisions

- Do not keep the wide operations contracts and add more `Pick<...>` wrappers around them; split the services and update callers directly.
- Do not preserve `AuthError` as the generic route error for non-auth features; move HTTP transport errors to the HTTP boundary or to feature-local tagged errors.
- Do not keep both the library-roots repository and the library-roots service if they express the same query; pick one owner and delete the duplicate.
- Do not patch over cross-feature internals with more helper re-exports; move shared logic to a neutral module and restore feature ownership.
- Do not wrap raw Drizzle promises in more presentation helpers; the affected reads are already fixed, so keep new read paths on the typed boundary.
- Do not introduce compatibility facades for the old orchestration service names unless a single refactor step truly needs them; the repo is alpha and can absorb internal breakage now.

## Removal And Replacement Candidates

### Safe to remove in the same refactor

- `apps/api/src/features/library-roots/library-roots-repository.ts` or `apps/api/src/features/library-roots/service.ts` after choosing the surviving boundary
- `ReturnType<typeof make...>` service shapes are no longer used in the operations layer; the explicit service interfaces are in place.
- the `AuthError` dependency from:
  - `apps/api/src/features/system/image-asset-service.ts`
  - `apps/api/src/http/anime-streaming.ts`

### Split next, then simplify callers

- `apps/api/src/features/operations/search-orchestration.ts`
- `apps/api/src/features/operations/catalog-orchestration.ts`
- `apps/api/src/background-worker-dependencies.ts`

## Concrete Implementation Plan

### Workstream 1 - Replace wide operations contracts with small explicit services

Target outcome: operations dependencies become easy to understand and background workers no longer depend on repackaged mega-services.

Steps:

1. Define explicit service shapes instead of `ReturnType<typeof make...>` for:
   - download lifecycle/control
   - download progress reads
   - catalog read actions
   - catalog write actions
   - search triggers
   - RSS/background tasks
2. Split `makeSearchOrchestration(...)` and `makeCatalogOrchestration(...)` into smaller service constructors with one reason to change each.
3. Update `background-workers.ts` to depend on dedicated worker task services instead of a renamed dependency bag.
4. Delete `background-worker-dependencies.ts` if the new worker-facing services make it unnecessary.

Status:

- complete: the operations service shapes now use explicit interfaces, and only low-level utility helpers still use `ReturnType<typeof make...>`
- search routing now uses `SearchQueryService`, `UnmappedFolderService`, `ImportPathScanService`, and `SearchWorkerService`
- catalog routing now uses `CatalogReadService`, `CatalogDownloadControlService`, `CatalogLibraryService`, and `CatalogRssService`
- system metrics and anime enrollment now import the direct feature tags instead of the operations orchestrator re-export
- the catalog service tags now use direct method references instead of `Pick<...>` narrowing glue
- the old `operations-orchestration.ts` barrel was deleted; HTTP callers import the direct feature tags now
- download search-trigger routing now uses `DownloadTriggerService`
- background workers use `SearchWorkerService`, `DownloadLifecycleService`, and `LibraryScanService`
- the remaining download workflow helper stays internal to the smaller tags

Acceptance criteria:

- no operations service shape is inferred via `ReturnType<typeof make...>`
- background worker dependencies read as concrete task services, not aliases
- service APIs are small enough that callers do not need `Pick<...>` narrowing glue

### Workstream 2 - Rebuild the typed persistence boundary

Target outcome: repository reads consistently return typed `DatabaseError`s and feature services stop leaking DB types.

Steps:

1. Replace the four `Effect.promise(...)` database reads in `download-repository.ts` with `tryDatabasePromise(...)`-backed helpers.
2. Move download presentation-context loading into a dedicated read-model repository module if that improves cohesion.
3. Collapse the duplicated library-roots boundary into one service/repository owner.
4. Replace exported DB row types at service boundaries with feature-owned output models where needed.

Status:

- complete: `download-presentation-repository.ts` now owns the presentation-context lookup, and `LibraryRootsService` uses a feature-owned `LibraryRoot` model

Acceptance criteria:

- no production Drizzle read path in `apps/api/src/features/operations/repository/download-repository.ts` uses raw `Effect.promise(...)`
- `LibraryRootsService` no longer exports `LibraryRoot` straight from `db/schema.ts`
- repository and service boundaries each have a single, obvious owner

### Workstream 3 - Restore feature ownership and extract shared logic properly

Target outcome: features depend on neutral shared helpers or service contracts, not each other's internals.

Steps:

1. Audit all current cross-feature imports and classify them as:
   - truly shared logic -> move to `apps/api/src/lib/` or a neutral support module
   - service dependency -> access through a tagged service
   - accidental coupling -> inline or relocate to the owning feature
2. Start with the current hot spots:
   - `system-dashboard-service.ts`
   - `catalog-library-read-support.ts`
   - `anime/query-support.ts`
   - `anime/file-mapping-support.ts`
3. Delete obsolete helper re-exports after each move.

Status:

- complete: the hot spots now use neutral shared helpers or direct feature services, and the stale re-export paths were removed

Acceptance criteria:

- system no longer imports operations repository internals for dashboard presentation
- anime and operations stop importing each other's large support modules directly
- shared helpers live in neutral modules with names that match their actual ownership

### Workstream 4 - Separate HTTP transport errors from auth-domain errors

Target outcome: auth owns auth failures, and route/transport failures are modeled at the HTTP boundary.

Steps:

1. Introduce a small HTTP-local tagged error set for 400/401/403/404 route failures.
2. Refactor `anime-streaming.ts` and `image-asset-service.ts` to stop returning `AuthError` for non-auth failures.
3. Keep route mapping centralized in `route-errors.ts`, but teach it the new transport errors.
4. Verify auth routes still use `AuthError` only for actual auth semantics.

Status:

- complete: non-auth features no longer import `AuthError`, and auth-only failures remain in the auth feature

Acceptance criteria:

- non-auth features do not import `AuthError`
- route errors remain centrally mapped
- error types better reflect owning module intent

### Workstream 5 - Simplify runtime and lifecycle composition

Target outcome: the layer graph is easier to audit and matches the terms used in `EFFECT_GUIDE.md`.

Steps:

1. Collapse the current assembly chain into a smaller set of named lifecycle layers, for example:
   - `PlatformLayer`
   - `FeatureLayer`
   - `HttpLayer`
   - `BackgroundLayer`
   - `AppLayer`
2. Keep platform/core resources separate from feature assembly.
3. Keep background launch concerns visible as a first-class lifecycle boundary.
4. Remove intermediate composition modules that no longer add meaning.

Status:

- complete: `apps/api/src/api-lifecycle-layers.ts` now owns the runtime graph directly and the obsolete assembly modules were deleted

Acceptance criteria:

- a reader can identify the runtime graph from one entry module
- the app boundary provides one clearly named top-level layer
- background composition is explicit instead of implied by assembly glue

### Workstream 6 - Split oversized boundary adapters by concern

Target outcome: external client modules become smaller, easier to test, and easier to replace.

Steps:

1. `rss-client.ts` is now split into:
   - SSRF and redirect policy in `rss-client-ssrf.ts`
   - RSS/XML wire schemas in `rss-client-parse.ts`
   - client wiring in `rss-client.ts`
2. `anilist.ts` is now split into:
   - GraphQL documents and client wiring in `anilist.ts`
   - AniList schemas and normalization in `anilist-model.ts`
3. `auth/service.ts` was already split into bootstrap, session, and credential services during implementation.

Status:

- complete: the boundary adapters are split by transport, parsing, policy, and normalization concerns

Acceptance criteria:

- each boundary module has one clear reason to change
- schema code, transport code, and normalization code are no longer mixed into one file
- unit tests can target the parsing/normalization layers without booting the whole service

### Workstream 7 - Rebalance tests toward service behavior

Target outcome: architecture refactors stay cheap because tests assert behavior, not storage layout.

Steps:

1. Keep a focused set of repository integration tests for DB-specific behavior.
2. Move broad behavior assertions up to service-layer tests with small Effect layers.
3. Shrink or split the largest DB-white-box suites as the affected services are refactored.

Status:

- complete: the download presentation lookup tests now live in `download-presentation-repository_test.ts`, leaving `repository-db_test.ts` focused on lower-level repository helpers

Acceptance criteria:

- repository tests cover persistence behavior only
- orchestration and service tests assert through service contracts
- structural refactors require fewer storage-coupled test edits

## Suggested Refactor Order

1. replace wide operations contracts
2. fix the untyped database boundary and duplicate library-roots layer
3. remove cross-feature internal imports by extracting shared logic
4. split HTTP transport errors away from auth
5. simplify lifecycle composition
6. split oversized adapters
7. rebalance tests

This order removes the highest architectural pressure first: wide contracts and weak boundaries are currently causing the most ripple effects elsewhere.

## Verification Checklist

- `bun run check` in `apps/api`
- `bun run test` in `apps/api`
- `bun run lint` in `apps/api`
- focused tests for download presentation-context loading after the repository refactor
- focused tests for stream and image-route error mapping after the transport-error split
- focused tests for worker startup after the orchestration-service split

## End State

When this plan is complete, `apps/api` should have:

- smaller explicit Effect services instead of inferred mega-contracts
- consistent typed database boundaries
- restored feature ownership with fewer cross-feature internal imports
- HTTP-local transport errors instead of auth-error leakage
- a clearer lifecycle graph with fewer composition glue modules
- smaller external adapters that separate transport, schema, and normalization

That is the next worthwhile hard-path cleanup before new feature work adds another layer of service and boundary debt.

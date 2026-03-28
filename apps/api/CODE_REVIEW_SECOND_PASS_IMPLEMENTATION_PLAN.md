# API Architecture And Code Quality Review Plan - Second Pass

## Goal

Run a fresh architecture and code-quality pass against `apps/api` after the
first cleanup wave, using `apps/api/EFFECT_GUIDE.md`, the local `effect-ts`
references, and the `code-review-expert` checklists as the baseline.

This pass keeps the alpha-stage hard path: prefer deleting glue, splitting
mixed ownership, tightening schemas and error boundaries, and making the layer
graph more explicit over wrappers, fallbacks, compatibility shims, or partial
facades.

## Review Basis

- `apps/api/EFFECT_GUIDE.md`
- `/home/debian/.agents/skills/effect-ts/references/04-services-and-layers.md`
- `/home/debian/.agents/skills/effect-ts/references/05-data-modeling.md`
- `/home/debian/.agents/skills/effect-ts/references/06-error-handling.md`
- `/home/debian/.agents/skills/code-review-expert/references/solid-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/code-quality-checklist.md`
- `/home/debian/.agents/skills/code-review-expert/references/security-checklist.md`

## Current Snapshot

The API is in much better shape than the prior review pass.

What is already strong:

- `apps/api/src/api-lifecycle-layers.ts:48` now makes the runtime graph visible
  from one entry module.
- `apps/api/src/http/route-errors.ts:100` and
  `apps/api/src/http/router-helpers.ts` keep route error translation centralized.
- `apps/api/src/features/operations/rss-client.ts:1` and
  `apps/api/src/features/operations/rss-client-ssrf.ts:1` separate outbound RSS
  transport and SSRF policy cleanly.
- `apps/api/src/features/system/image-asset-service.ts:61` correctly
  canonicalizes both root and target paths before authorization.
- `apps/api/src/features/library-roots/service.ts:8` now owns a feature-local
  `LibraryRoot` model instead of leaking DB schema types.
- `apps/api/src/features/operations/repository/download-presentation-repository.ts:16`
  now owns the download presentation-context read model.

The remaining issues are narrower and mostly structural: a few outbound/config
boundaries are still too loose, and some repository modules still own too much
cross-feature behavior.

## Findings

### P1 - High

1. `packages/shared/src/index.ts:678`
2. `apps/api/src/features/system/config-update-validation.ts:12`
3. `apps/api/src/features/operations/service-support.ts:41`
4. `apps/api/src/features/operations/qbittorrent.ts:375`
   - `qbittorrent.url` is still modeled as a raw string, survives config writes
     without canonicalization, and is used directly to build outbound requests.
   - Compared with RSS, this outbound client has no equivalent SSRF/private-host
     guardrail.
   - Hard-path fix: introduce a validated qBittorrent endpoint schema/value
     object, normalize the origin at config-write time, reject embedded
     credentials, and reject loopback/private/link-local targets unless an
     explicit trusted-local mode is configured.

5. `apps/api/src/lib/effect-retry.ts:86`
6. `apps/api/src/features/operations/service-support.ts:54`
7. `apps/api/src/http/route-errors.ts:117`
   - Unknown causes are broadly rewrapped as `ExternalCallError`, then mapped to
     HTTP 503.
   - That collapses programmer defects and internal mapping bugs into fake
     "external service unavailable" failures, which is misleading and makes
     diagnosis harder.
   - Hard-path fix: only create `ExternalCallError` at real outbound I/O
     boundaries. Preserve known domain errors, and let unexpected defects stay
     defects or become explicit 500-class failures.

### P2 - Medium

8. `apps/api/src/features/anime/repository.ts:5`
9. `apps/api/src/features/anime/repository.ts:270`
10. `apps/api/src/features/anime/repository.ts:362`
11. `apps/api/src/features/anime/repository.ts:433`
    - The anime repository is no longer just anime persistence: it reads app
      config, quality profiles, and system logs, and also owns path-resolution
      policy.
    - This is a clear feature-ownership leak from anime into system/config.
    - Hard-path fix: split this file into table-focused anime persistence,
      config-read ports, profile-read ports, and log-append ports. Keep the
      repository boundary table-owned and inject the other concerns.

12. `apps/api/src/api-lifecycle-layers.ts:52`
13. `apps/api/src/features/system/system-config-service.ts:49`
14. `apps/api/src/background-controller-live.ts:16`
    - The lifecycle file is centralized now, but still very manual and sensitive
      to service-provisioning order.
    - `SystemConfigService` persists config and directly triggers
      `BackgroundWorkerController.reload(...)`, which couples config storage to
      runtime orchestration.
    - Hard-path fix: introduce a smaller runtime control port for background
      activation/reload, and keep config persistence separate from worker
      lifecycle concerns.

15. `apps/api/src/features/operations/search-orchestration-service.ts:21`
16. `apps/api/src/features/operations/search-orchestration.ts:24`
17. `apps/api/src/features/operations/catalog-orchestration-service.ts:20`
18. `apps/api/src/features/operations/catalog-orchestration.ts:13`
    - Search orchestration still merges release search, unmapped-folder
      workflows, import-path scanning, and worker-facing behavior into one broad
      service shape.
    - Catalog orchestration still merges read-model queries, download control,
      library write flows, and RSS feed mutation.
    - Hard-path fix: split the orchestration layer by workflow ownership and let
      callers depend on the real workflow services directly.

19. `apps/api/src/lib/filesystem.ts:193`
20. `apps/api/src/features/operations/library-browse-service.ts:172`
21. `apps/api/src/features/system/image-asset-service.ts:76`
    - Directory reads and per-entry `stat(...)` work use
      `concurrency: "unbounded"`, and image assets are fully buffered into
      memory with no size limit.
    - This creates avoidable resource-exhaustion pressure under large folders or
      large image files.
    - Hard-path fix: bound per-entry concurrency in filesystem helpers and
      browse endpoints, and add explicit image-size caps or streaming for image
      responses.

### P3 - Low

22. `apps/api/src/features/operations/catalog-service-tags.ts:30`
23. `apps/api/src/features/operations/search-service-tags.ts:37`
24. `apps/api/src/features/operations/download-service-tags.ts:19`
    - Fixed: the download tags now build the workflow directly instead of
      mapping a separate orchestration tag, and
      `apps/api/src/features/operations/download-orchestration-service.ts` was
      deleted.

25. `apps/api/src/features/operations/download-orchestration_test.ts:1`
26. `apps/api/src/features/operations/download-orchestration_test.ts:29`
    - The orchestration spec still pulls in schema helpers and persistence-aware
      assertions heavily.
    - This keeps behavior tests coupled to storage shape and raises refactor
      cost.
    - Hard-path fix: move storage-shape assertions into dedicated repository
      tests and keep orchestration tests focused on service behavior, events, and
      externally visible outcomes.

## Areas To Preserve

- Preserve the centralized route error mapping pattern in
  `apps/api/src/http/route-errors.ts` and
  `apps/api/src/http/router-helpers.ts`.
- Preserve the RSS SSRF policy split in
  `apps/api/src/features/operations/rss-client-ssrf.ts`.
- Preserve the image asset root canonicalization and out-of-root rejection in
  `apps/api/src/features/system/image-asset-service.ts`.

## Hard-Path Decisions

- Do not add another compatibility wrapper around `qbittorrent.url`; replace the
  raw string boundary with a validated value object.
- Do not keep treating unknown internal causes as `ExternalCallError`; only use
  it for real outbound failures.
- Do not keep growing `features/anime/repository.ts` as a cross-feature utility
  bag; split it by ownership and delete the mixed boundary.
- Do not preserve pass-through orchestration tags if they add no meaningful
  contract; delete or narrow them.
- Do not solve unbounded filesystem work with logging alone; add bounded
  concurrency or streaming semantics at the shared helper boundary.

## Concrete Implementation Plan

### Workstream 1 - Harden the qBittorrent config and client boundary

Target outcome: outbound qBittorrent calls use a validated, canonicalized origin
instead of a raw string.

Steps:

1. Add a validated qBittorrent endpoint schema/value object at the config
   boundary.
2. Validate and normalize the origin during config updates.
3. Reject embedded credentials and unsafe/private targets unless explicitly
   allowed for trusted-local deployments.
4. Update `maybeQBitConfig(...)` and the qBittorrent client to consume the
   validated origin.

Acceptance criteria:

- qBittorrent config no longer uses a raw unchecked URL string at runtime
- outbound base URLs are canonicalized once at config write/load boundaries
- unsafe endpoints fail validation before they reach the client

Status:

- complete: qBittorrent URLs are normalized on config write and config read, and loopback/private targets are rejected when `trusted_local` is disabled

### Workstream 2 - Restore truthful outbound error boundaries

Target outcome: only real external-call failures become `ExternalCallError`, and
unexpected internal bugs stop masquerading as 503s.

Steps:

1. Audit every `wrapOperationsError(...)` caller and classify each path as true
   outbound I/O, domain error translation, or defect.
2. Narrow `ExternalCallError` construction to outbound adapter boundaries.
3. Let unexpected internal causes surface as defects or explicit internal
   failures.
4. Keep route mapping specific: known external failures -> 503, defects -> 500.

Acceptance criteria:

- `ExternalCallError` is only created at true external boundaries
- unexpected internal failures are no longer mapped as service-unavailable
- route logs preserve enough information to diagnose defects quickly

Status:

- complete: `wrapOperationsError(...)` now leaves known external and domain errors alone, and routes unexpected internal failures through `DatabaseError` instead of `ExternalCallError`

### Workstream 3 - Split the anime repository by ownership

Target outcome: anime persistence, config reads, profile reads, and system-log
writes stop sharing one repository file.

Steps:

1. Move pure anime-table persistence into a dedicated anime repository module.
2. Extract app-config/library-path/image-path reads into explicit config ports.
3. Extract quality-profile lookup into a dedicated profile read port.
4. Extract system-log append behavior into a dedicated service/port.
5. Update anime services to depend on those narrower boundaries instead of the
   mixed repository file.

Acceptance criteria:

- `features/anime/repository.ts` no longer reads `appConfig`,
  `qualityProfiles`, and `systemLogs` together
- anime persistence modules are table-focused
- cross-feature dependencies become explicit through small ports

Status:

- complete: anime config reads now live in `config-support.ts`, quality-profile existence lives in `profile-support.ts`, system log appends use `appendSystemLog(...)`, and the aggregate insert helper moved out of `repository.ts`

### Workstream 4 - Shrink the lifecycle/runtime coupling points

Target outcome: runtime activation concerns are visible, but config persistence
does not directly own worker-control behavior.

Steps:

1. Introduce a narrow runtime-control tag for background reload/start/stop
   behavior.
2. Move config activation wiring out of `SystemConfigService` and into a clearer
   runtime boundary.
3. Reduce manual `Layer.provide(...)` chaining in `api-lifecycle-layers.ts` by
   grouping feature-local layer assembly where it adds meaning.
4. Keep the top-level lifecycle module as the single source of truth for app
   assembly.

Acceptance criteria:

- config persistence no longer depends directly on `BackgroundWorkerController`
- lifecycle assembly remains visible from one file
- feature/runtime responsibilities are more clearly separated

Status:

- complete: background runtime control now lives in `background-runtime-control.ts`, `SystemConfigService` is read-only, and `SystemConfigUpdateService` owns config persistence plus activation

### Workstream 5 - Split the remaining broad operations orchestration

Target outcome: operations callers depend on workflow-owned services rather than
merged orchestration contracts.

Steps:

1. Split search orchestration into dedicated services for release search,
   unmapped-folder workflows, import-path scan, and worker tasks.
2. Split catalog orchestration into dedicated services for catalog reads,
   download control, library writes, and RSS feed admin.
3. Delete pass-through service-tag layers that no longer add a real boundary.
4. Update HTTP and background callers to use the true narrow services.

Acceptance criteria:

- no broad orchestration service remains as the main dependency bag for callers
- pass-through tags are either deleted or become real bounded contracts
- service ownership is obvious from imports and layer wiring

Status:

- complete: catalog, search, and download service tags now build the workflows directly, and the broad `CatalogOrchestration`, `SearchOrchestration`, and `DownloadOrchestration` tags were deleted

### Workstream 6 - Bound filesystem and image asset work

Target outcome: filesystem-heavy operations have explicit resource bounds and
large images cannot exhaust memory accidentally.

Steps:

1. Replace `concurrency: "unbounded"` in shared directory/stat helpers with a
   sane bounded concurrency.
2. Bound or stream per-entry file metadata work in `LibraryBrowseService`.
3. Add explicit size caps or streaming semantics for image asset reads.
4. Add focused tests for large directories and oversized image assets.

Acceptance criteria:

- shared filesystem helpers avoid unbounded per-entry concurrency
- library browsing scales predictably with large folders
- image asset loading has an explicit memory-safety policy

Status:

- complete: shared directory stats and library browsing now use bounded concurrency, and image asset reads now fail closed above the explicit size cap

### Workstream 7 - Rebalance the remaining persistence-heavy tests

Target outcome: orchestration tests assert behavior first, and persistence-shape
tests live with the repositories they exercise.

Steps:

1. Move remaining raw-row/download-shape assertions from orchestration specs to
   dedicated repository tests.
2. Keep orchestration tests focused on returned domain data, published events,
   and service-level outcomes.
3. Split the largest mixed tests where one file currently covers both behavior
   and storage layout.

Acceptance criteria:

- orchestration tests no longer need to assert raw DB shape in the common path
- repository tests own storage-layout assertions
- future refactors require fewer test edits outside the true persistence layer

Status:

- complete: download orchestration tests now use repository mappers and `loadCurrentEpisodeState` for storage-backed assertions, keeping the specs focused on behavior and events

## Suggested Refactor Order

1. harden qBittorrent config and outbound boundary
2. restore truthful external-error handling
3. split the anime repository by ownership
4. shrink lifecycle/runtime coupling points
5. split remaining broad operations orchestration
6. bound filesystem and image asset work
7. rebalance persistence-heavy tests

## Verification Checklist

- `bun run check` in `apps/api`
- `bun run test` in `apps/api`
- `bun run lint` in `apps/api`
- focused tests for qBittorrent config validation and unsafe-host rejection
- focused tests for internal defects vs external 503 mapping
- focused tests for bounded directory/image handling behavior

## End State

When this plan is complete, `apps/api` should have:

- a validated outbound qBittorrent boundary instead of a raw URL string
- external-call errors reserved for real external failures
- anime persistence split back into feature-owned boundaries
- clearer lifecycle ownership between config persistence and runtime control
- smaller workflow-owned operations services instead of merged dependency bags
- bounded filesystem/image work with clearer resource behavior
- cheaper refactors because orchestration tests assert behavior rather than DB
  layout

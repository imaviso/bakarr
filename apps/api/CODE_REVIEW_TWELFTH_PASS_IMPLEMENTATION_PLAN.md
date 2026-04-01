# API Architecture And Code Quality Review Plan - Twelfth Pass

## Goal

Run a twelfth architecture and code-quality pass against `apps/api` after the
eleventh pass, strictly following `apps/api/EFFECT_GUIDE.md`, the local
`effect-ts` references, and the `code-review-expert` review checklists.

This pass keeps the alpha-stage hard path:

- break remaining workflow hubs into narrower tagged orchestration boundaries
- remove service tags and helper exports that no longer earn their own modules
- eliminate unbounded read paths on HTTP-facing services
- push more wiring detail down into feature-local bundles
- narrow background-job failure handling so real failures stay visible

## Review Basis

- `apps/api/EFFECT_GUIDE.md`
- `apps/api/CODE_REVIEW_ELEVENTH_PASS_IMPLEMENTATION_PLAN.md`
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

- the eleventh pass removed the most obvious router-owned export formatting and
  structural input-bag factories
- the API still typechecks, lints, and tests green after the latest refactors
- service boundaries are generally clearer than they were before the tenth and
  eleventh passes

What still smells:

- background RSS and missing-episode workflows still concentrate too much
  policy, IO, and recovery in single modules
- the download read/view boundary still mixes large read models, export
  encoding, and an unbounded history path
- top-level composition still knows too many concrete operations/system
  internals
- a few background loops and workflow boundaries still log-and-swallow or flatten
  failures too early
- several service/helper hybrids still exist where the tagged service adds no
  real lifecycle, policy, or error boundary value

## Findings

### P0 - Critical

None confirmed in this pass.

### P1 - High

1. `apps/api/src/features/operations/background-search-rss-support.ts:52`
   - `runRssCheckBase(...)` still owns job lifecycle, feed loading, release
     selection, duplicate detection, queueing, progress publication, and final
     error translation in one workflow hub.
   - The trailing tagged catches plus final `Effect.catchAll(...)` still flatten
     heterogeneous failures into `OperationsInfrastructureError` too early for a
     long-running job boundary.
   - This keeps too much change pressure in one module and weakens failure
     intent.

2. `apps/api/src/features/operations/background-search-missing-support.ts:62`
   - The workflow loads the full missing-episode result set, then only processes
     `missingRows.slice(0, 10)`.
   - It also recomputes per-anime missing episode context inside the loop via
     `missingRows.filter(...)`, which is avoidable repeated work on the full
     result set.
   - This is both a policy/IO concentration smell and an avoidable memory/work
     spike on larger libraries.

### P2 - Medium

1. `apps/api/src/features/operations/catalog-download-view-support.ts:157`
   `apps/api/src/http/operations-downloads-router.ts:29`
   - `catalog-download-view-support.ts` is still a large mixed module that owns
     event pagination, presentation-context loading, CSV/JSON export encoding,
     queue reads, history reads, and progress reads.
   - `listDownloadHistory(...)` still reads the full downloads table with no
     pagination (`catalog-download-view-support.ts:343`), and the router exposes
     that directly at `/downloads/history`.
   - This is a reliability smell on a user-facing path and keeps the read
     boundary too broad.

2. `apps/api/src/features/operations/catalog-download-read-service.ts:11`
   - `CatalogDownloadReadService` is now only a forwarding tag over
     `makeCatalogDownloadViewSupport(...)`.
   - The service adds no lifecycle, policy, or error shaping of its own, so the
     extra wrapper boundary no longer earns its module.

3. `apps/api/src/api-lifecycle-layers.ts:42`
   `apps/api/src/features/operations/operations-feature-layer.ts:35`
   - Root assembly still carries too much feature-internal knowledge through a
     long chain of intermediate layer constants and cross-feature wiring.
   - The wiring is valid, but the boundary is still more detailed than the
     current feature decomposition warrants.

4. `apps/api/src/features/operations/unmapped-orchestration-scan.ts:139`
   - `runUnmappedScanPass(...)` still ends with a broad
     `Effect.catchAll(...)` translation.
   - The forked loop then uses `Effect.catchAllCause(...)` to log and swallow
     failures before `completeUnmappedScan()` runs.
   - This keeps background-loop failure visibility weaker than it should be for
     a job runner boundary.

5. `apps/api/src/features/operations/download-trigger-coordinator-service.ts:13`
   `apps/api/src/features/operations/download-torrent-lifecycle-service.ts:19`
   `apps/api/src/features/operations/unmapped-scan-service.ts:18`
   `apps/api/src/features/operations/catalog-library-read-support.ts:138`
   `apps/api/src/features/operations/catalog-library-scan-support.ts:100`
   `apps/api/src/features/operations/catalog-orchestration-library-write-support.ts:58`
   - A family of service/helper hybrid modules remains where the exported tagged
     service mostly re-exports a helper constructor or merged helper shape.
   - These modules are increasingly speculative abstractions: they keep extra
     names, shapes, and files alive without adding meaningful policy or
     lifecycle boundaries.

### P3 - Low

1. `apps/api/src/features/operations/background-search-rss-runner-service.ts:12`
   - This is a pure one-method forwarding wrapper over `RssClient.fetchItems`.
   - It adds tracing only, but not a distinct policy, lifecycle, or translation
     boundary.

2. `apps/api/src/features/operations/catalog-library-read-support.ts:27`
   `apps/api/src/features/operations/catalog-library-scan-support.ts:29`
   `apps/api/src/features/operations/catalog-orchestration-library-write-support.ts:42`
   - These helper constructors are exported even though current call sites are
     local to their own modules.
   - The extra export surface increases ambiguity about which boundary is the
     canonical one.

## Security / Reliability Notes

- No new P0 or P1 security issue was confirmed in this pass.
- The main reliability issue is still broad workflow concentration around RSS
  and download history reads that can grow without bounds.
- The main maintainability issue is the remaining service/helper hybrid pattern
  in operations modules.
- Background scan loop failures are still easier to miss than they should be.

## Safe Delete Candidates

### Safe To Remove Now

1. Exported helper constructors if the tagged service remains canonical:
   - `makeCatalogLibraryReadSupport`
   - `makeCatalogLibraryScanSupport`
   - `makeCatalogLibraryWriteSupport`
2. Related exported support-shape aliases that are only used to back the local
   tagged service module.

### Defer Until Refactor Lands

1. `apps/api/src/features/operations/background-search-rss-runner-service.ts`
2. `apps/api/src/features/operations/catalog-download-read-service.ts`
3. `apps/api/src/features/operations/unmapped-scan-service.ts` split/alias paths
   once canonical scan/query boundaries are simplified

## Hard-Path Decisions

- Do not keep unbounded history reads on HTTP-facing services just to preserve a
  convenient JSON array contract.
- Do not keep wrapper services when the helper module itself should become the
  canonical tagged service boundary.
- Do not keep broad workflow `catchAll(...)` or loop-level log-and-swallow paths
  when specific tagged recovery is possible.
- Do not preserve feature-internal wiring detail at the root if it can be moved
  into coarse feature bundles.
- Do not add compatibility layers around renamed or collapsed service modules;
  this repo is still pre-release alpha.

## Concrete Implementation Plan

### Workstream 1 - Split RSS background orchestration into narrower services

Target outcome: RSS background processing is decomposed into smaller tagged
orchestration boundaries and keeps failure intent visible.

Steps:

1. Extract feed loading / bounded candidate preparation into a narrower service.
2. Extract per-feed queue decision/execution into a separate orchestration
   service.
3. Keep the outer RSS job service responsible only for lifecycle, progress, and
   composing those collaborators.
4. Replace broad fallback translation with specific tagged recovery and final
   defect-preserving fallback.

### Workstream 2 - Bound and simplify download read/view services

Target outcome: download read APIs become narrower, history reads are bounded,
and export encoding is separated from general view queries.

Steps:

1. Replace unpaged download-history reads with an explicitly paginated query
   contract.
2. Split `catalog-download-view-support.ts` into narrower read and export
   boundaries, or promote a canonical tagged read service and make helpers
   file-local.
3. Collapse `CatalogDownloadReadService` if it remains only a forwarding tag.

### Workstream 3 - Collapse remaining service/helper hybrids

Target outcome: operations service boundaries are canonical tagged services with
clear ownership, not service shells over exported helper constructors.

Steps:

1. Review the remaining helper-backed service modules:
   - download trigger
   - download torrent lifecycle
   - unmapped scan/query split
   - catalog library read/scan/write
2. Inline helper-only layers where the tagged service should own the behavior.
3. Remove exported helper constructors and support-shape aliases that become
   file-local.

### Workstream 4 - Tighten unmapped scan failure visibility

Target outcome: background scan failures remain visible to the owning runtime and
use specific recovery where appropriate.

Steps:

1. Narrow `runUnmappedScanPass(...)` recovery to known tagged errors first.
2. Rework the forked scan loop so unexpected failures are not merely logged and
   forgotten.
3. Preserve `completeUnmappedScan()` finalization semantics while keeping real
   failures observable.

### Workstream 5 - Push more wiring into feature-local bundles

Target outcome: root assembly merges coarse feature bundles instead of encoding
so much operations/system internal detail.

Steps:

1. Introduce tighter bundle layers such as download/background-search/library/
   unmapped feature bundles inside operations.
2. Revisit whether system services also want a feature-local bundle rather than
   continued root-level assembly detail.
3. Keep `api-lifecycle-layers.ts` focused on high-level composition only.

## Implementation Status

- Pending.

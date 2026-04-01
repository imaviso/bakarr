# API Architecture And Code Quality Review Plan - Ninth Pass

## Goal

Run a ninth architecture and code-quality pass against `apps/api` after the
eighth cleanup wave, strictly following `apps/api/EFFECT_GUIDE.md`, the local
`effect-ts` references, and the `code-review-expert` review checklists.

This pass keeps the alpha-stage hard path:

- prefer feature-owned Effect layers over root-level knowledge of every leaf
  service
- prefer explicit tagged services over runtime-time `Effect.provideService(...)`
  chains and manual dependency bags
- keep `main.ts` as the executable boundary instead of also acting as a test
  runtime helper
- delete or collapse adapter-local special cases when a shared Effect helper is
  cleaner
- do not preserve compatibility wrappers just because they are convenient import
  points

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

- `apps/api/main.ts`
- `apps/api/src/api-lifecycle-layers.ts`
- `apps/api/src/api-startup.ts`
- `apps/api/src/app-platform-runtime-core.ts`
- `apps/api/src/background-controller*.ts`
- `apps/api/src/background-workers.ts`
- `apps/api/src/features/anime/**/*.ts`
- `apps/api/src/features/operations/**/*.ts`
- `apps/api/src/http/**/*.ts`

## Current Snapshot

What is strong:

- most feature code now prefers `Context.Tag`, `Layer.effect(...)`, and
  `Effect.fn(...)`
- anime modules are materially smaller than they were before the eighth pass
- route adapters are still mostly thin and delegate business logic into feature
  services
- the repo still has one obvious top-level app layer boundary

What still smells:

- feature-internal wiring is still leaking into `api-lifecycle-layers.ts`
- background worker startup still behaves like a handwritten runtime container
- several operations services still assemble broad object graphs from `*Input`
  bags instead of tagged leaf services and feature bundle layers
- `main.ts` still owns both the real executable boundary and a separate runtime
  bootstrap path used only by tests
- one route still hand-rolls empty-body JSON parsing instead of using shared
  request helpers

## Findings

### P0 - Critical

None confirmed in this pass.

### P1 - High

1. `apps/api/main.ts`
   - `bootstrap()` creates a full `ManagedRuntime` and uses `runPromise(...)`
     outside the single executable boundary.
   - This violates the runtime-entrypoint rules in `EFFECT_GUIDE.md` and keeps a
     second app-start path in the executable module.

2. `apps/api/src/api-lifecycle-layers.ts`
   - The root layer still knows most operations and anime leaf services and how
     they depend on each other.
   - This is a wiring god module and keeps feature-internal composition leaking
     into the app boundary.

3. `apps/api/src/background-controller-live.ts`
   - Worker startup is still assembled with a long `Effect.provideService(...)`
     chain for concrete services.
   - This is runtime-time manual DI and hides ownership from layer composition.

4. `apps/api/src/background-workers.ts`
   - Background infrastructure imports multiple domain services directly and owns
     job composition itself.
   - That couples infra scheduling to feature-level orchestration instead of a
     smaller worker-jobs boundary.

5. `apps/api/src/features/operations/download-workflow-service.ts`
   `apps/api/src/features/operations/download-reconciliation-service.ts`
   `apps/api/src/features/operations/download-trigger-service.ts`
   `apps/api/src/features/operations/download-orchestration-shared.ts`
   - Download workflow composition still depends on wide object bags and wrapper
     composition modules rather than tagged leaf services.
   - The service boundary is still broader than it should be, even after the
     eighth-pass cleanup.

6. `apps/api/src/features/operations/background-search-missing-support.ts`
   `apps/api/src/features/operations/background-search-rss-support.ts`
   `apps/api/src/features/operations/background-search-support-shared.ts`
   `apps/api/src/features/operations/background-search-queue-support.ts`
   - Background search still recreates service containers through `*Input` and
     `*Shared` bags.
   - This keeps feature boundaries implicit and spreads dependency assembly
     across several support modules.

### P2 - Medium

1. `apps/api/src/app-platform-runtime-core.ts`
   - Platform assembly remains a broad container that wires config, runtime,
     database, events, and external clients in one module.
   - It is acceptable as a boundary, but still broader than a true platform core.

2. `apps/api/src/features/operations/catalog-download-view-support.ts`
   `apps/api/src/http/operations-downloads-router.ts`
   - Download event export still materializes full JSON and CSV payloads in
     memory with a high limit.
   - This is a real reliability risk for large exports and should move toward a
     streaming export boundary.

3. `apps/api/src/features/operations/search-unmapped-service.ts`
   - The service surface is still a merged bag of scan, control, and import
     workflows.
   - The tag is broader than any one caller needs.

4. `apps/api/src/features/anime/metadata-refresh-service.ts`
   `apps/api/src/features/anime/anime-delete-service.ts`
   `apps/api/src/features/anime/anime-episode-refresh-service.ts`
   - These service shells are still very thin.
   - They are useful app boundaries today, but remain candidates for either
     collapse or stronger multi-method ownership.

5. `apps/api/src/features/operations/runtime-support.ts`
   - `OperationsSharedState` still mixes unrelated coordination concerns:
     unmapped-scan lifecycle and exclusive download triggering.
   - The tag is broader than any single consumer needs.

### P3 - Low

1. `apps/api/src/http/operations-search-router.ts`
   - `/downloads/search-missing` still hand-rolls empty-body JSON parsing.
   - The route should use a shared helper so HTTP decoding stays centralized and
     boring.

## Security / Reliability Notes

- No new P0 or P1 security issue was confirmed in this pass.
- The main reliability risk remains large in-memory download-event exports.
- The main maintainability risks are root-level feature wiring, runtime-time
  service injection, and operations modules that still depend on manual object
  graphs.
- The main concurrency smell remains the broad `OperationsSharedState` tag,
  because unrelated serialization policies still share one boundary.

## Safe Delete Candidates

### Safe To Remove Now

1. `bootstrap()` from `apps/api/main.ts`
   - Safe to move into a test-focused module because current usage is test-only.

### Defer Removal Until Refactor Lands

1. `apps/api/src/features/anime/metadata-refresh-service.ts`
2. `apps/api/src/features/anime/anime-delete-service.ts`
3. `apps/api/src/features/anime/anime-episode-refresh-service.ts`
4. `apps/api/src/features/operations/download-reconciliation-service.ts`
5. `apps/api/src/features/operations/download-torrent-lifecycle-service.ts`
6. `apps/api/src/features/operations/catalog-download-view-support.ts`

## Hard-Path Decisions

- Do not keep root-layer knowledge of feature internals when a feature bundle
  layer is cleaner.
- Do not keep runtime-time `Effect.provideService(...)` chains when a tagged
  service or layer can own the dependency capture.
- Do not preserve the test bootstrap path inside `main.ts`.
- Do not add fallback or compatibility helpers to keep the old assembly model
  alive.
- Do not introduce new aggregate service bags when a smaller service boundary is
  available.

## Concrete Implementation Plan

### Workstream 1 - Move feature-internal wiring out of the root app layer

Target outcome: `api-lifecycle-layers.ts` depends on feature bundle layers rather
than individual operations and anime leaf services.

Steps:

1. Add an anime feature bundle layer module that owns anime service assembly.
2. Add an operations feature bundle layer module that owns operations service
   assembly and explicit shared coordination.
3. Simplify `api-lifecycle-layers.ts` to compose platform, feature bundle, and
   true cross-feature layers only.

### Workstream 2 - Replace runtime-time worker injection with a real worker boundary

Target outcome: background controller startup depends on tagged worker services,
not `Effect.provideService(...)` chains.

Steps:

1. Extract a `BackgroundWorkerJobs` service that owns the concrete worker task
   effects.
2. Extract a worker-spawner layer that closes over the jobs and infra services
   once.
3. Update `background-controller-live.ts` to depend on that spawner boundary.
4. Keep `background-workers.ts` focused on scheduling, supervision, and lock
   policy.

### Workstream 3 - Keep `main.ts` executable-only

Target outcome: the executable file owns only `runMain` startup, while tests use
an explicitly test-scoped bootstrap module.

Steps:

1. Move the exported runtime bootstrap helper out of `main.ts` into a dedicated
   test/adaptor module.
2. Update test imports.
3. Leave `main.ts` with the executable path and dotenv bootstrap only.

### Workstream 4 - Remove one remaining route-local boundary special case

Target outcome: empty JSON body handling for `/downloads/search-missing` uses a
shared HTTP helper instead of route-local parsing.

Steps:

1. Add a helper for optional labeled JSON bodies that treats an empty body as a
   provided default value.
2. Update `operations-search-router.ts` to use it.

### Workstream 5 - Defer larger workflow surgery to a later pass

Target outcome: leave the broad download/background-search object graphs in
place for now, but document the next hard-path cut clearly.

Deferred steps:

1. Replace download `*Input` factory bags with leaf tags and feature-local
   layers.
2. Split `OperationsSharedState` into narrower coordination services.
3. Stream download-event export instead of building full payloads in memory.
4. Revisit wrapper-only anime service shells once callers depend on stronger or
   narrower boundaries.

## Implementation Status

Completed in this ninth pass:

- Workstream 1: completed.
  - Added feature bundle layers:
    - `apps/api/src/features/anime/anime-feature-layer.ts`
    - `apps/api/src/features/operations/operations-feature-layer.ts`
  - Simplified app boundary composition in:
    - `apps/api/src/api-lifecycle-layers.ts`

- Workstream 2: completed.
  - Replaced runtime-time service injection chain with a worker jobs boundary:
    - `apps/api/src/background-worker-jobs.ts`
    - `apps/api/src/background-workers.ts`
    - `apps/api/src/background-controller-live.ts`

- Workstream 3: completed.
  - Kept executable boundary in `main.ts` only:
    - `apps/api/main.ts`
  - Moved test runtime bootstrap to:
    - `apps/api/src/api-test-bootstrap.ts`
    - `apps/api/main_test.ts` updated imports

- Workstream 4: completed.
  - Added shared optional JSON body decoding helper and removed route-local
    parsing special case:
    - `apps/api/src/http/router-helpers.ts`
    - `apps/api/src/http/operations-search-router.ts`

- Workstream 5 deferred set: completed in this pass (no longer deferred).
  - Replaced operations shared-state aggregate with two narrower coordinators:
    - `DownloadTriggerCoordinator`
    - `UnmappedScanCoordinator`
    - file: `apps/api/src/features/operations/runtime-support.ts`
  - Removed all usages of `OperationsSharedState` and `OperationsCoordinationShape`.
  - Refactored download orchestration composition from manual `*Input` bag
    assembly in `download-workflow-service.ts` into tag/layer-owned services:
    - `apps/api/src/features/operations/download-reconciliation-service.ts`
    - `apps/api/src/features/operations/download-torrent-lifecycle-service.ts`
    - `apps/api/src/features/operations/download-progress-support.ts`
    - `apps/api/src/features/operations/download-trigger-coordinator-service.ts`
    - `apps/api/src/features/operations/download-workflow-service.ts`
  - Added background search shared service boundary (no ad hoc shared bag
    creation in live layers):
    - `apps/api/src/features/operations/background-search-support-shared.ts`
  - Implemented streaming JSON export path for download events to reduce memory
    pressure at the HTTP boundary:
    - `apps/api/src/features/operations/catalog-download-view-support.ts`
    - `apps/api/src/http/operations-downloads-router.ts`
  - Collapsed thin anime wrapper services into one owned maintenance boundary:
    - added `apps/api/src/features/anime/anime-maintenance-service.ts`
    - deleted:
      - `apps/api/src/features/anime/anime-delete-service.ts`
      - `apps/api/src/features/anime/anime-episode-refresh-service.ts`
      - `apps/api/src/features/anime/metadata-refresh-service.ts`
    - updated callers:
      - `apps/api/src/http/anime-write-router.ts`
      - `apps/api/src/http/system-tasks-router.ts`
      - `apps/api/src/background-worker-jobs.ts`

Verification:

- `bun run check` (apps/api): pass
- `bun run test` (apps/api): pass (455 tests)

# apps/api/src Architecture Review and Refactor Plan

## Scope

- Reviewed `apps/api/src` as a codebase review, not a git diff.
- Rubric: `apps/api/EFFECT_GUIDE.md`, SOLID, architecture, code quality, and pre-release alpha guidance from `AGENTS.md`.
- Main lens: remove hidden wiring, compatibility debt, fallback-heavy behavior, and route-level orchestration.

## Overall Assessment

- The codebase already uses Effect seriously: service tags are mostly well named, many boundaries use `Schema`, and test coverage appears broad.
- The main debt is architectural, not syntactic. The biggest problems are route handlers doing application work, nested `Layer.provide(...)` graphs that hide dependencies, broad services with multiple reasons to change, and fallback/repair logic living in core runtime paths.
- The fastest improvement path is:
  1. move HTTP orchestration into dedicated application services,
  2. split `SystemService` and flatten `OperationsServiceLive`,
  3. tighten error taxonomy and boundary schemas,
  4. remove alpha-incompatible compatibility/fallback behavior.

## Top Modules To Tackle First

1. `apps/api/src/http/operations-router.ts`
2. `apps/api/src/http/system-router.ts`
3. `apps/api/src/http/anime-router.ts`
4. `apps/api/src/features/operations/service.ts`
5. `apps/api/src/runtime.ts`
6. `apps/api/src/features/system/service.ts`
7. `apps/api/src/http/router-helpers.ts`
8. `apps/api/src/http/route-errors.ts`
9. `apps/api/src/features/operations/search-orchestration.ts`
10. `apps/api/src/features/operations/unmapped-orchestration-support.ts`

## Findings

### P1 - High

#### P1.1 Thin-route boundary violations

- `apps/api/src/http/operations-router.ts:217`
- `apps/api/src/http/system-router.ts:80`
- `apps/api/src/http/system-router.ts:443`
- `apps/api/src/http/anime-router.ts:160`

Problems:

- HTTP handlers are doing path normalization, filesystem access, config loading, repository access, metrics assembly, and cross-service orchestration.
- `operations-router` directly imports `listLibraryRoots` from `apps/api/src/features/library-roots/library-roots-repository.ts:8`, which bypasses a feature service boundary entirely.
- `anime-router` coordinates `AnimeService.addAnime()` and `DownloadService.triggerSearchMissing()` in the route instead of exposing a single application use case.

Why this matters:

- Violates the "thin route / business logic in services" rule from `AGENTS.md`.
- Makes auth, validation, orchestration, filesystem policy, and output shaping change together.
- Forces router changes for new business rules, which is classic SRP and DIP erosion.

Refactor target:

- Create focused application services such as `LibraryBrowseService`, `ImageAssetService`, `MetricsService`, and `AnimeEnrollmentService`.
- Keep routes limited to auth, request decoding, and response encoding.

#### P1.2 Hidden dependency graph inside `OperationsServiceLive`

- `apps/api/src/features/operations/service.ts:127`
- `apps/api/src/features/operations/service.ts:180`
- `apps/api/src/features/operations/service.ts:234`
- `apps/api/src/features/operations/service.ts:272`
- `apps/api/src/features/operations/service.ts:403`

Problems:

- The file constructs a mini-container of internal tags, runtime layers, orchestration layers, and projection layers.
- Internal projections (`RssService`, `LibraryService`, `DownloadService`, `SearchService`) mostly wrap other methods through `projectServiceEffect(...)`.
- The final exported layer is already pre-provided with nested layer graphs.

Why this matters:

- Violates the guide's preference to satisfy dependencies in layers once at the boundary, not repeatedly inside feature code.
- Makes the real dependency graph hard to reason about, test, and swap.
- Causes wide edit surfaces when adding a new operation.

Refactor target:

- Replace the mega-wiring file with small live layers per service.
- Keep leaf tags explicit and compose one `operationsLayer` near the runtime boundary.
- Delete projection-only wrappers once the direct services exist.

#### P1.3 Runtime wiring is too nested and opaque

- `apps/api/src/runtime.ts:37`
- `apps/api/src/runtime.ts:92`
- `apps/api/src/runtime.ts:97`

Problems:

- `makeApiLayer()` provides layers into already provided feature layers, then merges them again.
- The runtime boundary is doing legitimate app composition, but feature-local nesting means the final graph is harder than it needs to be.

Why this matters:

- Weakens Effect's biggest architectural benefit: obvious, inspectable dependency flow.
- Increases test setup complexity and makes resource ownership less legible.

Refactor target:

- Flatten feature layers first, then rebuild `makeApiLayer()` as a small boundary composer with shared constants for memoizable layers.

#### P1.4 `SystemService` is a god service

- `apps/api/src/features/system/service.ts:156`
- `apps/api/src/features/system/service.ts:317`
- `apps/api/src/features/system/service.ts:414`
- `apps/api/src/features/system/service.ts:456`
- `apps/api/src/features/system/service.ts:583`

Problems:

- One service owns bootstrap initialization, runtime status, dashboard aggregation, config CRUD, profile CRUD, release profile CRUD, log querying, and background job composition.
- It has many reasons to change and too many collaborators.

Why this matters:

- Strong SRP violation.
- Makes router and background code depend on a broad interface.
- Slows refactors because any config, logging, dashboard, or profile change touches the same service.

Refactor target:

- Split into at least:
  - `SystemBootstrapService`
  - `SystemStatusService`
  - `SystemDashboardService`
  - `SystemConfigService`
  - `QualityProfileService`
  - `ReleaseProfileService`
  - `SystemLogService`

#### P1.5 Error taxonomy collapses unrelated failures into `DatabaseError`

- `apps/api/src/features/operations/service-support.ts:51`
- `apps/api/src/features/anime/service-support.ts:21`
- `apps/api/src/features/operations/search-orchestration.ts:192`
- `apps/api/src/features/operations/search-orchestration.ts:249`

Problems:

- `wrapOperationsError()` and `wrapAnimeError()` map unknown failures to `DatabaseError`, even when the actual fault came from HTTP clients, parsing, orchestration, or adapter glue.
- Callers then recover at the wrong abstraction level.

Why this matters:

- Violates the Effect guide's typed-error intent.
- Blurs infra failures vs domain failures.
- Makes 4xx/5xx mapping and retry behavior less trustworthy.

Refactor target:

- Introduce adapter-specific error families and only use `DatabaseError` for persistence failures.
- Let truly unrecoverable bugs remain defects until the app boundary.

#### P1.6 HTTP error boundary leaks too much and logs too little

- `apps/api/src/http/router-helpers.ts:88`
- `apps/api/src/http/router-helpers.ts:101`
- `apps/api/src/http/route-errors.ts:134`
- `apps/api/src/http/route-errors.ts:139`

Problems:

- `routeResponse()` blanket-catches failures and converts them straight into responses without adding route context logs.
- `mapRouteError()` returns `error.message` for arbitrary `Error` values, which can leak internal details in 500 responses.

Why this matters:

- Weak observability at the main API boundary.
- Potential internal message leakage.
- Harder debugging because route failures are normalized before structured logging happens.

Refactor target:

- Log unexpected failures with route/method context before mapping.
- Return a generic 500 body for unknown errors.
- Keep typed errors explicit with `catchTag`/`catchTags` where the route truly wants custom degradation.

#### P1.7 File browse authorization fails open on canonicalization error

- `apps/api/src/http/operations-router.ts:236`

Problems:

- `/library/browse` falls back to `requestedPath` when `realPath()` fails.
- That weakens canonical root validation at a filesystem trust boundary.

Why this matters:

- Boundary validation should fail closed.
- This is exactly where symlink/path normalization policy needs to be strict and centralized.

Refactor target:

- Treat failed canonicalization as a typed path error.
- Move root-authorization logic into a dedicated browse service and test symlink and missing-path cases explicitly.

### P2 - Medium

#### P2.1 Alpha-incompatible compatibility and repair logic is embedded in core services

- `apps/api/src/features/system/service.ts:267`
- `apps/api/src/features/system/service.ts:439`
- `apps/api/src/features/system/config-codec.ts:267`
- `apps/api/src/features/system/config-codec.ts:315`
- `apps/api/src/features/system/config-codec.ts:325`

Problems:

- Missing-config fallback, corrupt-config repair messaging, and spread-merging defaults over stored config all live in request-time/core service paths.
- Helper functions like `effectDecodeStoredLibraryConfig()` and `effectDecodeImagePath()` silently inject defaults.

Why this matters:

- The repo is explicitly pre-release alpha; this is compatibility debt that should be handled by migration/startup policy, not carried forever in the live service path.
- It obscures true system state.

Refactor target:

- Introduce an explicit startup migration/normalization step.
- Keep runtime services strict: either config is valid, or startup produces a deliberate typed failure/degraded mode decision at one boundary.

#### P2.2 Optional executor fallback hides missing dependencies inside core services

- `apps/api/src/lib/media-probe.ts:380`
- `apps/api/src/lib/media-probe.ts:420`
- `apps/api/src/features/system/disk-space.ts:57`

Problems:

- `MediaProbeLive` and `makeDiskSpaceInspector()` turn missing `CommandExecutor`/`ffprobe` into runtime fallback objects instead of explicit boundary wiring choices.

Why this matters:

- Makes infrastructure availability a hidden runtime branch instead of a visible layer decision.
- Encourages silent degradation that is hard to reason about.

Refactor target:

- Pick one explicit policy:
  - require these dependencies at runtime, or
  - provide a deliberate disabled layer at the boundary.

#### P2.3 Boundary schemas are still too stringly

- `apps/api/src/http/request-schemas.ts:28`
- `apps/api/src/http/request-schemas.ts:44`
- `apps/api/src/http/request-schemas.ts:85`
- `apps/api/src/http/request-schemas.ts:104`
- `apps/api/src/http/request-schemas.ts:117`
- `apps/api/src/http/request-schemas.ts:160`
- `apps/api/src/http/request-schemas.ts:225`
- `apps/api/src/http/request-schemas.ts:242`

Problems:

- Paths, URLs, dates, levels, filters, magnets, and names are mostly raw `Schema.String` values.
- The guide prefers meaningful domain schemas and branded primitives at boundaries.

Why this matters:

- Pushes validation into ad hoc logic deeper in routes/services.
- Makes illegal states representable.

Refactor target:

- Add branded/refined schemas for paths, URLs, date strings, search filters, profile names, log levels, and magnets, then reuse them across request decoding and service contracts.

#### P2.4 `browsePath()` hides filesystem failures as empty data

- `apps/api/src/http/route-fs.ts:40`
- `apps/api/src/http/route-fs.ts:73`

Problems:

- Directory read failures become empty listings.
- File stat failures become entries without size.

Why this matters:

- Silent failure at a boundary makes UI behavior ambiguous.
- Prevents operators from distinguishing "empty folder" from "filesystem unavailable".

Refactor target:

- Return typed path/access errors from the browse use case.
- Only degrade intentionally when the product explicitly wants partial results.

#### P2.5 Service interfaces are too wide for their callers

- `apps/api/src/features/operations/service-contract.ts:23`
- `apps/api/src/background.ts:194`
- `apps/api/src/background.ts:427`

Problems:

- `LibraryServiceShape` and `DownloadServiceShape` are broad and mixed.
- Background workers depend on broad service surfaces even though each worker needs only a narrow subset.

Why this matters:

- ISP violation.
- Makes worker code and consumers sensitive to unrelated service growth.

Refactor target:

- Introduce narrower job/use-case services for worker scheduling and route consumption.

#### P2.6 `getLibraryStats()` does large in-memory work in a system endpoint

- `apps/api/src/features/system/service.ts:348`
- `apps/api/src/features/system/service.ts:355`

Problems:

- The method loads all anime rows and all episode rows, builds a map, converts every anime to DTO form, and then derives a single aggregate metric.

Why this matters:

- This will scale poorly as the library grows.
- It mixes aggregation/reporting concerns with DTO construction logic.

Refactor target:

- Move the aggregate calculation into focused repository queries or a dedicated reporting service.

#### P2.7 Unmapped folder orchestration is oversized and mixed-purpose

- `apps/api/src/features/operations/unmapped-orchestration-support.ts:96`
- `apps/api/src/features/operations/unmapped-orchestration-support.ts:195`
- `apps/api/src/features/operations/unmapped-orchestration-support.ts:337`
- `apps/api/src/features/operations/unmapped-orchestration-support.ts:487`

Problems:

- One module owns scan loop control, job updates, match persistence, folder control actions, refresh behavior, import behavior, logging, and cleanup.

Why this matters:

- Another SRP hotspot.
- Hard to test and hard to reuse without dragging in unrelated behavior.

Refactor target:

- Split into `UnmappedScanService`, `UnmappedMatchService`, `UnmappedControlService`, and `UnmappedImportService`.

#### P2.8 Readiness semantics are incomplete

- `apps/api/src/http/system-router.ts:52`
- `apps/api/src/features/system/service.ts:91`

Problems:

- Readiness only downgrades `DatabaseError`, but `getSystemStatus()` can also fail with `StoredConfigCorruptError` and `DiskSpaceError`.

Why this matters:

- Produces inconsistent operational behavior.
- Makes health reporting less trustworthy.

Refactor target:

- Define an explicit readiness policy and map each typed failure intentionally.

### P3 - Low

#### P3.1 Wrapper-only indirection can likely be deleted after the service split

- `apps/api/src/features/operations/service.ts:118`
- `apps/api/src/features/anime/service.ts:130`

Problems:

- `projectServiceEffect()` and `wrapServiceEffect()` mostly rename already-effectful methods.

Why this matters:

- Extra indirection with limited payoff once the service graph is simplified.

Refactor target:

- Re-evaluate after service extraction; delete if they no longer add tracing or readability value.

#### P3.2 Repeated route orchestration patterns are not yet centralized

- `apps/api/src/http/anime-router.ts:48`
- `apps/api/src/http/operations-router.ts:52`
- `apps/api/src/http/system-router.ts:47`

Problems:

- Auth + decode + call + map patterns are duplicated heavily across routers.

Why this matters:

- Mostly maintenance noise, but it increases route churn.

Refactor target:

- After extracting proper application services, consider a very small route DSL/helper layer if duplication still hurts.

## Concrete Implementation Plan

### Phase 0 - Lock in behavior before surgery

1. Add characterization tests for the current route/service behavior that is about to move:
   - `/api/images/*`
   - `/api/library/browse`
   - `/api/metrics`
   - `POST /api/anime`
   - readiness behavior
2. Add module-level tests for config fallback/degradation cases so the refactor can deliberately remove or preserve each one.
3. Create a short architecture map in code comments only where dependency seams are currently hard to infer.

### Phase 1 - Move business logic out of HTTP routes

Create focused services and move the logic wholesale out of routers:

1. `features/system/image-asset-service.ts`
   - Input: validated image relative path
   - Responsibility: decode, canonicalize, authorize within image root, load bytes, return content metadata
2. `features/library-roots/service.ts`
   - Wrap `listLibraryRoots()` behind a proper service tag/layer
3. `features/operations/library-browse-service.ts`
   - Input: browse query + allowed roots policy
   - Responsibility: canonicalization, authorization, browse result generation
4. `features/system/metrics-service.ts`
   - Responsibility: collect status/stats/download progress and render Prometheus output
5. `features/anime/anime-enrollment-service.ts`
   - Responsibility: `addAnime` + optional `triggerSearchMissing`

Definition of done:

- Routers only decode/auth/respond.
- No router imports repository functions directly.
- Filesystem policy lives in services, not route handlers.

### Phase 2 - Split `SystemService`

Create narrow service tags and move existing methods without changing behavior first:

1. `SystemBootstrapService`
   - `ensureInitialized`
2. `SystemStatusService`
   - `getSystemStatus`
   - `getLibraryStats`
   - `getActivity`
   - `getJobs`
3. `SystemDashboardService`
   - `getDashboard`
4. `SystemConfigService`
   - `getConfig`
   - `updateConfig`
5. `QualityProfileService`
   - list/create/update/delete quality profiles
6. `ReleaseProfileService`
   - list/create/update/delete release profiles
7. `SystemLogService`
   - `getLogs`
   - `clearLogs`
   - `triggerInfoEvent`

Definition of done:

- `SystemServiceShape` is deleted or reduced to a transitional facade with a clear removal plan.
- Routers depend on narrow services only.

### Phase 3 - Flatten operations wiring and remove projection debt

1. Break `apps/api/src/features/operations/service.ts` into:
   - `download-service-live.ts`
   - `library-service-live.ts`
   - `rss-service-live.ts`
   - `search-service-live.ts`
   - `operations-runtime-layer.ts`
2. Keep internal orchestration constructors pure factories.
3. Stop using projection layers that only forward methods through `projectServiceEffect()`.
4. Compose one explicit `operationsRuntimeLayer` constant, then provide it once in `runtime.ts`.

Definition of done:

- Feature wiring is readable top-to-bottom.
- The number of nested `Layer.provide(...)` calls drops significantly.
- `projectServiceEffect()` becomes removable.

### Phase 4 - Repair the error model

1. Replace `wrapOperationsError()` and `wrapAnimeError()` with explicit mappers:
   - DB failures -> `DatabaseError`
   - remote API failures -> adapter-specific errors or `ExternalCallError`
   - parse/storage corruption -> stored-data errors
   - bugs/invariant breaks -> defects
2. Tighten route error behavior:
   - log route failures with method/route annotations
   - never expose raw `Error.message` for unknown 500s
   - map typed failures intentionally in `route-errors.ts`
3. Fix readiness policy by handling all known failure tags explicitly.
4. Remove the `realPath()` fail-open fallback in browse authorization.
5. Stop returning empty directory listings on filesystem failure unless there is a documented product reason.

Definition of done:

- Error types describe the actual failing boundary.
- Unknown failures are observable and do not leak internals.

### Phase 5 - Tighten boundary schemas

Add branded/refined schemas, preferably in small focused modules instead of one giant file:

1. Path schemas
   - `AbsolutePathSchema`
   - `RelativeImagePathSchema`
   - `LibraryBrowsePathSchema`
   - `FilePathSchema`
2. Query/filter schemas
   - `IsoDateTimeSchema`
   - `LogLevelSchema`
   - `SearchFilterSchema`
   - `SearchCategorySchema`
   - `DownloadEventCursorSchema`
3. Domain strings
   - `ProfileNameSchema`
   - `FeedUrlSchema`
   - `MagnetUriSchema`

Definition of done:

- `http/request-schemas.ts` stops using raw `Schema.String` for high-risk boundary values.
- Validation moves out of route/service ad hoc branches and into schema decoding.

### Phase 6 - Remove compatibility and fallback debt

1. Add a dedicated config migration/normalization step at startup.
2. Decide and document the runtime policy for missing `ffprobe` and `df`:
   - either hard dependency at startup, or
   - explicit disabled feature layer supplied at the boundary.
3. Remove silent default injection helpers that only exist to preserve old stored shapes.
4. Delete corrupt-config repair behavior from request-time core service paths once the migration path exists.

Definition of done:

- Fallback behavior is deliberate and boundary-owned.
- Core services stop carrying alpha compatibility branches.

### Phase 7 - Performance and cohesion cleanup

1. Replace `getLibraryStats()` table-wide reads with focused aggregate queries or a reporting helper.
2. Split `unmapped-orchestration-support.ts` into smaller services:
   - scan loop
   - match persistence
   - manual control actions
   - import flow
3. Narrow worker dependencies in `background.ts` so each worker consumes only the methods it actually needs.

Definition of done:

- Hot or potentially large endpoints stop loading unnecessary data.
- Background/job orchestration depends on narrow contracts.

## Removal And Simplification Candidates

### Safe to remove after Phase 3

- `apps/api/src/features/operations/service.ts:118` `projectServiceEffect()`
- projection-only service layers in `apps/api/src/features/operations/service.ts:272`

### Safe to remove after Phase 2 or 6

- `apps/api/src/features/system/service.ts` as the single catch-all system facade
- compatibility comments/contracts around corrupt-config repair once migration is explicit

### Safe to remove after Phase 6 policy decision

- `apps/api/src/lib/media-probe.ts:380` `makeUnavailableMediaProbe()` if missing ffprobe is no longer a runtime fallback
- silent default helpers in `apps/api/src/features/system/config-codec.ts:315` and `apps/api/src/features/system/config-codec.ts:325` if startup migration owns normalization

### Re-evaluate after service split

- `apps/api/src/features/anime/service.ts:130` `wrapServiceEffect()`

## Verification Checklist

- `bun run check`
- `bun run lint`
- `bun run test`
- Add focused tests for:
  - route thinness via service mocks
  - browse authorization and canonicalization
  - config migration behavior
  - readiness mapping
  - error-to-response mapping
  - missing executor policies for media probe and disk inspection

## Recommended Execution Order

1. Phase 0 and Phase 1 first - biggest architecture win with limited semantic risk.
2. Phase 2 and Phase 3 next - they remove the heaviest structural debt.
3. Phase 4 and Phase 5 after that - tighten correctness and boundaries once seams are clean.
4. Phase 6 and Phase 7 last - remove compatibility debt and finish performance cleanup.

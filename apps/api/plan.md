# Bakarr API Architecture Refactor Plan

This plan documents the findings from the `@apps/api/src/` architectural code review and proposes a concrete roadmap for eliminating technical debt, conforming strictly to the [EFFECT_GUIDE.md](file:///home/yunyun/Dev/bakarr/apps/api/EFFECT_GUIDE.md), and addressing several SOLID violations, as per the `code-review-expert` skill guidelines.

## Code Review Summary

**Scope**: `apps/api/src/`
**Overall assessment**: REQUEST_CHANGES (Refactor Required)
**Focus Areas**: SOLID (SRP/ISP), Effect-native DI patterns, manual wrapping.

---

## Findings

### P1 - High Priorities

**1. ISP / SRP Violation: God Services**
- **[features/anime/service.ts]**: [AnimeServiceShape](file:///home/yunyun/Dev/bakarr/apps/api/src/features/anime/service.ts#52-124) declares 19 distinct capabilities ranging from reading DB lists, adding anime, monitoring, handling files, to episodes, renaming, scanning, and metadata refreshing.
- **[features/operations/service-contract.ts]**: [LibraryServiceShape](file:///home/yunyun/Dev/bakarr/apps/api/src/features/operations/service-contract.ts#36-84) (12 methods) and [DownloadServiceShape](file:///home/yunyun/Dev/bakarr/apps/api/src/features/operations/service-contract.ts#85-135) (14 methods) follow the same pattern, acting as wide aggregates where consumers are forced to depend on everything.
  - **Suggested Fix**: Split [AnimeService](file:///home/yunyun/Dev/bakarr/apps/api/src/features/anime/service.ts#125-129) into granular services like `AnimeQueryService` (read APIs), `AnimeMutationService` (CRUD/settings), and `AnimeFileOrchestrator` (Episode mapping, scanning). Similarly, split operations into `DownloadStatusService`, `DownloadTriggerService`, and `LibraryScannerService`.

**2. Anti-Pattern: Manual Dependency Bags & Wrapper Functions**
- **[features/operations/operations-orchestration.ts]**: Factory functions like [makeDownloadOrchestration](file:///home/yunyun/Dev/bakarr/apps/api/src/features/operations/download-orchestration.ts#10-63) take massive argument bags (up to 15 dependencies, e.g., `db`, `dbError`, `eventBus`, `mediaProbe`, [currentMonotonicMillis](file:///home/yunyun/Dev/bakarr/apps/api/src/features/operations/operations-orchestration.ts#107-108)). This subverts Effect's `Context` / DI tree, creating manual boilerplate.
- **[features/operations/operations-orchestration.ts]**: Passing [nowIso](file:///home/yunyun/Dev/bakarr/apps/api/src/features/anime/service.ts#232-233), [currentMonotonicMillis](file:///home/yunyun/Dev/bakarr/apps/api/src/features/operations/operations-orchestration.ts#107-108), and [currentTimeMillis](file:///home/yunyun/Dev/bakarr/apps/api/src/features/operations/operations-orchestration.ts#108-109) as explicit function arguments circumvents `Effect.Clock` and makes testing convoluted compared to standard `TestClock` utilization.
  - **Suggested Fix**: Refactor all inner operational files (e.g. [download-orchestration.ts](file:///home/yunyun/Dev/bakarr/apps/api/src/features/operations/download-orchestration.ts)) to rely on Effect Context explicitly (e.g. `Effect<A, E, Database | FileSystem>`). Use layers to provide dependencies correctly, rather than extracting them at the top layer and manually plumbing them via parameter bags. Stop explicitly passing time functions; instead, use `{ Clock } from "effect"` naturally inside the domain code.

**3. Anti-Pattern: Scattered Effect.provide in Orchestration**
- **[background-controller.ts:46]**: `makeBackgroundWorkerControllerLive` manually extracts ~7 services and iteratively injects them using `.pipe(Effect.provideService(...))` into `spawnWorkersFromConfig`.
  - **Suggested Fix**: Rewrite `spawnWorkersFromConfig` to strictly require its environment dependencies in `R`, allowing the top-level application wiring context (or `BackgroundWorkerControllerLive` itself) to satisfy them. This aligns with *"Avoid By Default: Scattered Effect.provide(...) through orchestration code"*.

### P2 - Medium Priorities

**1. Nested Service Wiring vs Composition**
- **[features/anime/service.ts]** & **[features/anime/service-wiring.ts]**: `makeAnimeFileOperations` is not a layer, but a constructor returning functions, which is then explicitly yielded inside `makeAnimeService`. While valid Effect code, it mixes layer construction and business logic binding. It would be cleaner to model file operations as their own `Layer`.

**2. Route Controllers Dependency Visibility**
- HTTP routes correctly use `Effect.gen` and extract [AnimeService](file:///home/yunyun/Dev/bakarr/apps/api/src/features/anime/service.ts#125-129) from context, keeping `R` visible. But since [AnimeService](file:///home/yunyun/Dev/bakarr/apps/api/src/features/anime/service.ts#125-129) is a God service, an HTTP route for simply "listing anime" ends up declaring a dependency that can do destructive file system scans. (This will be fixed when P1 is resolved).

---

## Removal/Iteration Plan

The refactor should be done incrementally to avoid breaking the application state. We will employ the following sequence:

1. **Step 1: Clean Up Manual DI in Orchestrators (P1.2, P1.3)**
   - Eliminate parameter bags in [operations-orchestration.ts](file:///home/yunyun/Dev/bakarr/apps/api/src/features/operations/operations-orchestration.ts) and its backing modules ([download-orchestration.ts](file:///home/yunyun/Dev/bakarr/apps/api/src/features/operations/download-orchestration.ts), [catalog-orchestration.ts](file:///home/yunyun/Dev/bakarr/apps/api/src/features/operations/catalog-orchestration.ts), etc.).
   - Have inner domains yield [Database](file:///home/yunyun/Dev/bakarr/apps/api/src/db/database.ts#34-35), `FileSystem`, etc., from Context directly.
   - Refactor [background-controller.ts](file:///home/yunyun/Dev/bakarr/apps/api/src/background-controller.ts) to use generic context provision.
2. **Step 2: Segregate Interfaces (P1.1)**
   - Create distinct `Context.Tag` signatures for query, mutation, and file operations in `features/anime/`.
   - Create focused tags for [features/operations/service-contract.ts](file:///home/yunyun/Dev/bakarr/apps/api/src/features/operations/service-contract.ts) interfaces.
3. **Step 3: Update Routers (P2.2)**
   - Wire the segregated services into `http/*-router.ts`.
4. **Step 4: Cleanup & Validate Tests**
   - Clean out explicit [nowIso](file:///home/yunyun/Dev/bakarr/apps/api/src/features/anime/service.ts#232-233) and [currentTimeMillis](file:///home/yunyun/Dev/bakarr/apps/api/src/features/operations/operations-orchestration.ts#108-109) dependency overrides and upgrade them to simply rely on `TestClock` within `@effect/vitest`.

## Verification Plan

### Automated Tests
- Run `bun run check` and `bun run lint` (which runs `tsc` per the AGENTS.md guide) to ensure TypeScript correctly resolves the modified environment parameters `<R>` bounds across boundaries.
- Execute `bun run test` to run all existing Vitest suites and ensure the new scoped/layer-provided topologies haven't broken the test logic. Because we are stripping out manual clock forwarding, tests regarding timers will need to be evaluated and checked if they still pass natively.

### Manual Verification
- N/A for this stage, all confidence checks can be deferred to automated pipeline validations as we are surgically refactoring the codebase layout without altering functional API schemas.

---

## Next Steps

I have completed the review phase and identified the high-impact architectural issues (ISP/SRP God services, Manual DI param bags, scattered Effect `.provide` bindings).

**How would you like to proceed?**

1. **Fix all** - I'll implement all suggested fixes in the proposed sequence.

# API Architecture And Code Quality Review Plan - Fourth Pass

## Goal

Run a fresh architecture and code-quality pass against `apps/api` after the
third cleanup wave, using `apps/api/EFFECT_GUIDE.md`, the local `effect-ts`
references, and the `code-review-expert` checklists as the baseline.

This pass keeps the alpha-stage hard path: prefer truthful error boundaries,
single-instantiation workflow layers, typed worker/runtime policies, and small
feature test seams over wrapper services, broad constructor bags, fallback
re-wrapping, or convenience abstractions that hide ownership.

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

The API is cleaner again after the last pass.

What is already strong:

- `apps/api/src/api-lifecycle-layers.ts:53` now builds shared operations state
  once and reuses it.
- `apps/api/src/features/operations/service-support.ts:56` now uses
  `OperationsInfrastructureError` instead of fake database failures for the
  generic wrapper path.
- `apps/api/src/features/system/repository/system-config-repository.ts:1`,
  `apps/api/src/features/system/repository/quality-profile-repository.ts:1`,
  `apps/api/src/features/system/repository/release-profile-repository.ts:1`, and
  `apps/api/src/features/system/repository/profile-usage-repository.ts:1` split
  system persistence ownership much more cleanly.
- `apps/api/src/http/route-errors.ts:39` and
  `apps/api/src/http/router-helpers.ts:91` still keep route mapping and response
  shaping centralized.
- `apps/api/src/features/system/image-asset-service.ts:52` still preserves
  canonicalized, fail-closed image serving.

The remaining issues are narrower now, but they still matter: some operations
paths still collapse non-DB failures back into `DatabaseError`, workflow
construction is still duplicated behind thin tags, timeout handling is only
partly typed, and several service tests still depend on raw runtime assembly.

## Findings

### P1 - High

1. `apps/api/src/features/operations/background-search-rss-support.ts:206`
2. `apps/api/src/features/operations/background-search-rss-support.ts:216`
3. `apps/api/src/features/operations/background-search-missing-support.ts:132`
4. `apps/api/src/features/operations/search-orchestration-release-search.ts:149`
5. `apps/api/src/features/operations/search-orchestration-import-path-support.ts:37`
6. `apps/api/src/features/operations/catalog-library-scan-support.ts:138`
7. `apps/api/src/features/operations/catalog-orchestration-library-write-support.ts:322`
8. `apps/api/src/features/operations/unmapped-orchestration-scan.ts:134`
9. `apps/api/src/features/operations/download-trigger-service.ts:84`
10. `apps/api/src/features/operations/download-orchestration.ts:29`
11. `apps/api/src/features/operations/worker-services.ts:40`
    - Several operations paths still collapse non-database failures back into
      `DatabaseError`.
    - That reintroduces the exact smell the previous pass was fixing: external
      client failures, RSS parse/reject errors, path errors, and infrastructure
      errors are still presented to workers/routes as storage failures.
    - `SearchWorkerServiceShape` is part of the problem because it narrows its
      public surface back to `DatabaseError`, forcing upstream workflows to lie.
    - Hard-path fix: audit every remaining `dbError(...)` rewrap in operations,
      preserve typed external/path/infrastructure errors through the workflow
      boundary, and widen worker-facing contracts where the real error space is
      broader than DB-only.

### P2 - Medium

12. `apps/api/src/features/operations/download-service-tags.ts:28`
13. `apps/api/src/features/operations/download-service-tags.ts:56`
14. `apps/api/src/features/operations/catalog-service-tags.ts:38`
15. `apps/api/src/features/operations/catalog-service-tags.ts:67`
16. `apps/api/src/features/operations/search-service-tags.ts:51`
17. `apps/api/src/features/operations/search-service-tags.ts:86`
18. `apps/api/src/features/operations/worker-services.ts:50`
    - Download, catalog, and search still build broad workflow objects and then
      slice them back into several thin service tags.
    - Because each `Layer.effect(...)` resolves the constructor again, the same
      workflow assembly is repeated multiple times across one app graph.
    - This keeps ownership blurry and adds duplicate constructor work and
      indirection without introducing a real new contract.
    - Hard-path fix: either promote real `DownloadWorkflow`, `CatalogWorkflow`,
      and `SearchWorkflow` services built once and consumed directly, or split
      the constructor by actual workflow ownership and delete the sliced wrapper
      tags.

19. `apps/api/src/features/system/system-config-update-service_test.ts:30`
20. `apps/api/src/features/system/system-status-service_test.ts:39`
21. `apps/api/src/features/system/system-status-service_test.ts:80`
22. `apps/api/src/features/operations/search-orchestration_test.ts:18`
    - Several service/orchestration tests still build raw runtime fragments by
      hand, cast stubs with `as never`, and depend on sqlite/runtime wiring
      details instead of typed feature seams.
    - This raises refactor cost and keeps behavior tests coupled to dependency
      assembly rather than service contracts.
    - Hard-path fix: keep raw DB setup only in repository tests; add small test
      builders or test layers for system/operations services and move behavior
      tests onto typed contracts.

### P3 - Low

23. `apps/api/src/background-workers.ts:145`
24. `apps/api/src/background-workers.ts:174`
    - Worker timeout handling now exists, but timeout detection is still string
      based.
    - It converts timeout into a generic `Error`, then later infers timeout by
      searching `Cause.pretty(...)` output for text.
    - That is brittle, hard to branch on, and violates the repo's preference for
      typed recoverable failures at boundaries.
    - Hard-path fix: use a tagged timeout error via `Effect.timeoutFail(...)` or
      `timeoutTo(...)`, branch on that type directly, and keep monitor/logging
      logic typed.

25. `apps/api/src/background-runtime-control.ts:18`
26. `apps/api/src/features/auth/auth-runtime-layer.ts:7`
    - These modules are still thin wrappers that mainly forward an existing
      service or group a couple of `Layer.provide(...)` calls.
    - They add little policy, validation, or lifecycle value, so they increase
      graph surface area more than clarity.
    - Hard-path fix: inline them into the real assembly boundary unless they gain
      distinct ownership or runtime policy.

## Areas To Preserve

- Preserve the single shared operations-state construction in
  `apps/api/src/api-lifecycle-layers.ts`.
- Preserve `OperationsInfrastructureError` as the default non-DB operations
  fallback in `apps/api/src/features/operations/service-support.ts`.
- Preserve the split system repositories in
  `apps/api/src/features/system/repository/`.
- Preserve centralized route error mapping in
  `apps/api/src/http/route-errors.ts` and
  `apps/api/src/http/router-helpers.ts`.
- Preserve image asset path canonicalization and fail-closed reads in
  `apps/api/src/features/system/image-asset-service.ts`.

## Hard-Path Decisions

- Do not reintroduce `DatabaseError` as the catch-all operations boundary.
- Do not keep broad workflow constructors hidden behind multiple sliced tags.
- Do not keep timeout detection stringly typed when Effect can model it as a real
  tagged error.
- Do not keep service tests dependent on raw runtime assembly when a typed test
  seam can exist.
- Do not preserve wrapper modules that add no ownership, policy, or lifecycle.

## Concrete Implementation Plan

### Workstream 1 - Finish restoring truthful operations error boundaries

Target outcome: operations workflows preserve the real failure boundary instead
of collapsing external, path, parse, and infrastructure failures into
`DatabaseError`.

Steps:

1. Audit every remaining `dbError(...)` rewrap in `features/operations`.
2. Keep `DatabaseError` creation inside DB adapters only.
3. Widen worker/search/catalog service signatures where callers can meaningfully
   distinguish non-DB failures.
4. Update route and worker tests to assert truthful 400/500/503 behavior.

Acceptance criteria:

- non-DB operations failures are no longer rewrapped as `DatabaseError`
- worker-facing service shapes match the real workflow error space
- route and job logs reflect the actual failing boundary

Status:

- pending

### Workstream 2 - Build workflow services once, not per sliced tag

Target outcome: download, catalog, and search workflows are each constructed once
per layer graph and exposed through real service boundaries.

Steps:

1. Replace `makeDownloadOrchestrationEffect`, `makeCatalogWorkflow`, and
   `makeSearchWorkflow` subset slicing with real workflow tags or narrower
   constructors.
2. Remove wrapper tags that only forward subsets of an already-constructed
   object.
3. Update `worker-services.ts` and lifecycle wiring to depend on the resulting
   real workflow services directly.
4. Keep ownership visible from imports and layer assembly.

Acceptance criteria:

- workflow constructors run once per graph, not once per subset tag
- service tags correspond to real boundaries
- app assembly gets simpler rather than more abstract

Status:

- pending

### Workstream 3 - Replace string-based worker timeout detection with typed timeouts

Target outcome: worker timeout handling uses explicit tagged failures instead of
string inspection.

Steps:

1. Add a dedicated worker-timeout error type near `background-workers.ts`.
2. Replace `Effect.timeout(...)` plus string detection with `timeoutFail(...)` or
   `timeoutTo(...)`.
3. Branch monitor/logging behavior on the tagged timeout error directly.
4. Add focused tests for timeout classification and monitor/log output.

Acceptance criteria:

- timeout detection is type-driven, not string-driven
- worker logging and monitor state distinguish timeouts deterministically
- non-timeout failures preserve their original type/cause

Status:

- pending

### Workstream 4 - Move service tests onto typed feature seams

Target outcome: service/orchestration tests depend on typed stubs and test layers
instead of raw runtime wiring and `as never` bags.

Steps:

1. Add small feature test builders for system and operations services.
2. Keep sqlite and direct schema setup only for repository-focused tests.
3. Replace `as never` stubs in orchestration tests with typed service doubles.
4. Simplify system service tests so they provide feature layers instead of manual
   runtime assembly where possible.

Acceptance criteria:

- behavior tests no longer rely on raw runtime wiring by default
- repository tests remain the place for storage-shape assertions
- future refactors require fewer test changes outside the true boundary

Status:

- pending

### Workstream 5 - Delete thin runtime wrappers that add no policy

Target outcome: wrapper modules that only forward existing behavior are removed.

Steps:

1. Inline `background-runtime-control.ts` into the owning runtime assembly if no
   separate policy remains.
2. Inline `auth-runtime-layer.ts` into top-level assembly if it still only groups
   `Layer.provide(...)` calls.
3. Re-check for any other wrapper modules that are now safe to remove.

Acceptance criteria:

- wrappers that add no boundary value are deleted
- top-level assembly remains readable
- runtime ownership is clearer after removal, not blurrier

Status:

- pending

## Suggested Refactor Order

1. finish restoring truthful operations error boundaries
2. build workflow services once instead of per sliced tag
3. replace string-based timeout detection with typed timeouts
4. move service tests onto typed feature seams
5. delete thin runtime wrappers

## Verification Checklist

- `bun run check:api`
- `bun run test:api`
- `bun run lint:api`
- focused tests for truthful worker/search error propagation
- focused tests for typed timeout handling
- focused tests for workflow layer single-instantiation behavior

## End State

When this plan is complete, `apps/api` should have:

- truthful operations errors across search, download, catalog, and worker paths
- workflow services constructed once per app graph instead of per subset tag
- typed timeout handling for background workers
- cheaper service refactors because tests use feature seams instead of raw
  runtime assembly
- fewer wrapper modules and a more explicit runtime graph

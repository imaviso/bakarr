# API Architecture And Code Quality Review Plan - Third Pass

## Goal

Run a fresh architecture and code-quality pass against `apps/api` after the
second cleanup wave, using `apps/api/EFFECT_GUIDE.md`, the local `effect-ts`
references, and the `code-review-expert` checklists as the baseline.

This pass keeps the alpha-stage hard path: prefer deleting glue, tightening
Effect layer ownership, making shared runtime state actually shared, pushing
validation to boundaries, and splitting mixed repositories and workflow bags
instead of preserving wrappers, migration shims, partial facades, or fallback
paths.

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

The API is materially cleaner than the start of the second pass.

What is already strong:

- `apps/api/src/http/route-errors.ts:39` and
  `apps/api/src/http/router-helpers.ts:91` still keep route error mapping and
  HTTP response shaping centralized.
- `apps/api/src/features/system/config-activation.ts:39` now keeps
  persist-and-activate config transitions explicit, rollback-aware, and easy to
  reason about.
- `apps/api/src/features/events/publisher.ts:41` keeps event publishing scoped,
  coalesced, and lifecycle-aware.
- `apps/api/src/config.ts:49` models app config with schema-backed validation and
  redacted secret handling.

The remaining issues are now mostly about truthful ownership and runtime shape:
some "shared" state is still instantiated more than once, a few service and
repository boundaries still own too much, and some HTTP/tests still leak lower
level implementation details.

## Findings

### P1 - High

1. `apps/api/src/api-lifecycle-layers.ts:53`
2. `apps/api/src/api-lifecycle-layers.ts:60`
3. `apps/api/src/features/operations/runtime-support.ts:20`
4. `apps/api/src/features/operations/operations-shared-state.ts:19`
   - `OperationsSharedStateLive` is constructed in more than one subgraph.
   - That means download-trigger coordination and search-side unmapped-scan
     coordination can silently use different state instances even though the
     name and contract imply one shared runtime coordinator.
   - This violates the explicit layer-graph guidance in `EFFECT_GUIDE.md` and
     makes coordination semantics depend on provisioning shape instead of types.
   - Hard-path fix: construct one shared operations-state layer once at the app
     boundary and provide that single instance everywhere that needs download or
     search coordination.

5. `apps/api/src/features/operations/service-support.ts:54`
6. `apps/api/src/features/operations/search-service-tags.ts:82`
7. `apps/api/src/features/operations/download-trigger-service.ts:223`
8. `apps/api/src/features/operations/download-torrent-lifecycle-service.ts:263`
   - `wrapOperationsError(...)` still rewrites unknown failures to
     `DatabaseError`.
   - That makes outbound-client failures, orchestration bugs, and other
     non-persistence faults look like storage failures, which is inaccurate for
     routes, logs, and diagnosis.
   - This breaks the second-pass goal of truthful boundary errors and goes
     against the Effect guidance to reserve typed errors for recoverable,
     meaningful branches.
   - Hard-path fix: keep `DatabaseError` creation only at DB boundaries, add a
     separate operations infrastructure error for non-DB adapter/orchestration
     failures, and let true defects remain defects.

### P2 - Medium

9. `apps/api/src/background-workers.ts:47`
10. `apps/api/src/background-workers.ts:60`
11. `apps/api/src/background-workers.ts:130`
12. `apps/api/src/background-workers.ts:204`
    - Background workers serialize overlapping runs, but they still have no
      deadline or timeout policy around the actual work.
    - A hung RSS/qBittorrent/media probe call can keep a worker run active
      forever and turn future schedules into repeated skips.
    - Hard-path fix: move runtime deadlines into the worker boundary with
      explicit timeout errors, monitor reporting, and retry policy there rather
      than inside feature workflows.

13. `apps/api/src/features/system/repository/config-repository.ts:8`
14. `apps/api/src/features/system/repository/config-repository.ts:66`
15. `apps/api/src/features/system/repository/config-repository.ts:144`
16. `apps/api/src/features/system/repository/config-repository.ts:178`
    - `config-repository.ts` still owns system-config row CRUD, quality-profile
      CRUD, release-profile CRUD, and profile-usage queries together.
    - This is still a table bag rather than a set of ownership-focused
      repositories, so system config, profile management, and anime/profile
      linkage remain coupled.
    - Hard-path fix: split this into small repositories by table/ownership and
      keep usage counting as its own narrow port.

17. `apps/api/src/features/operations/catalog-service-tags.ts:38`
18. `apps/api/src/features/operations/catalog-service-tags.ts:67`
19. `apps/api/src/features/operations/search-service-tags.ts:51`
20. `apps/api/src/features/operations/search-service-tags.ts:86`
21. `apps/api/src/features/operations/worker-services.ts:50`
    - Catalog and search no longer expose the old broad orchestration tags, but
      the construction pattern still builds large mixed workflow objects and then
      slices subsets back out into narrow tags.
    - This keeps workflow ownership blurry, duplicates constructor work, and
      leaves the app graph dependent on broad internal bags.
    - Hard-path fix: split the constructors by owned workflow module or promote a
      single real workflow service where a single boundary truly exists. Delete
      subset-wrapper services that only forward methods.

22. `apps/api/src/test/database-test.ts:8`
23. `apps/api/src/features/system/system-config-update-service_test.ts:24`
24. `apps/api/src/features/system/system-status-service_test.ts:20`
25. `apps/api/src/features/operations/search-orchestration_test.ts:18`
26. `apps/api/src/features/operations/download-presentation-repository_test.ts:13`
    - Several tests still assemble raw runtime fragments with sqlite handles,
      `as never` service bags, direct schema inserts, and manual layer wiring.
    - Repository tests can do that, but several service/orchestration tests are
      still coupled to runtime internals instead of typed feature layers.
    - Hard-path fix: keep raw DB setup in repository-focused tests, but add small
      feature test builders/layers for service tests so behavior tests depend on
      contracts instead of storage/runtime construction details.

### P3 - Low

27. `apps/api/src/http/router-helpers.ts:10`
28. `apps/api/src/http/system-config-router.ts:37`
29. `apps/api/src/http/system-config-router.ts:72`
30. `apps/api/src/http/system-config-router.ts:99`
31. `apps/api/src/http/anime-write-router.ts:31`
32. `apps/api/src/http/anime-write-router.ts:52`
33. `apps/api/src/http/anime-write-router.ts:128`
    - Write routes still use unlabeled `decodeJsonBody(...)` in many places even
      though the router layer already has a richer labeled validation helper.
    - That produces weaker 400 responses and keeps route-level validation
      behavior inconsistent across endpoints.
    - Hard-path fix: make labeled/request-specific JSON decoding the default for
      all write routes and stop using the generic unlabeled helper in route code.

34. `apps/api/src/background-runtime-control.ts:18`
35. `apps/api/src/features/auth/auth-runtime-layer.ts:7`
36. `apps/api/src/features/operations/worker-services.ts:27`
    - A few remaining modules are thin pass-through wrappers that add little more
      than forwarding or grouped `Layer.provide(...)` calls.
    - They are not severe, but they still add graph surface area and indirection
      without adding validation, lifecycle, or policy.
    - Hard-path fix: delete wrappers that do not define a real boundary and keep
      only the ones that materially clarify runtime ownership.

## Areas To Preserve

- Preserve centralized route error mapping in
  `apps/api/src/http/route-errors.ts` and
  `apps/api/src/http/router-helpers.ts`.
- Preserve explicit config transition handling in
  `apps/api/src/features/system/config-activation.ts`.
- Preserve schema-backed config and secret handling in `apps/api/src/config.ts`.
- Preserve scoped event-publisher lifecycle management in
  `apps/api/src/features/events/publisher.ts`.

## Hard-Path Decisions

- Do not keep multiple instances of `OperationsSharedStateLive`; shared runtime
  coordination must be truly shared.
- Do not keep rewriting unknown operations failures to `DatabaseError`; preserve
  truthful boundaries and let defects stay defects.
- Do not keep `config-repository.ts` as a multi-table utility bag; split it by
  ownership.
- Do not keep building large workflow objects just to slice them back into thin
  service tags; either split constructors or keep one real boundary.
- Do not keep the unlabeled JSON body helper as normal route code for write
  endpoints.
- Do not preserve pass-through wrappers that add no policy, lifecycle, or
  validation.

## Concrete Implementation Plan

### Workstream 1 - Make operations coordination truly singleton

Target outcome: all operations features that depend on coordination semantics use
the same `OperationsSharedState` instance.

Steps:

1. Construct `OperationsSharedStateLive` once in `api-lifecycle-layers.ts`.
2. Provide that single layer to download, search, and worker assembly.
3. Remove any duplicate per-subgraph construction of the shared-state layer.
4. Add a focused test that proves download/search coordination shares one stateful
   runtime boundary.

Acceptance criteria:

- download and search services consume the same `OperationsSharedState`
- shared coordination behavior no longer depends on layer assembly order
- the top-level lifecycle graph makes the singleton boundary obvious

Status:

- pending

### Workstream 2 - Restore truthful operations infrastructure errors

Target outcome: database failures, external failures, domain failures, and
defects become distinguishable again.

Steps:

1. Audit every `wrapOperationsError(...)` call site.
2. Move `DatabaseError` creation back to DB-only helpers such as
   `tryDatabasePromise(...)` and `toDatabaseError(...)`.
3. Introduce a narrow non-DB operations infrastructure error where callers can
   recover or map meaningfully.
4. Let unexpected internal failures stay defects or become explicit 500-class
   failures instead of fake database errors.
5. Update route/error tests to verify 500 vs 503 vs domain-specific mapping.

Acceptance criteria:

- unknown non-DB failures are no longer rewritten as `DatabaseError`
- route mapping remains specific and truthful
- logs preserve enough context to distinguish storage, external, and internal
  faults

Status:

- pending

### Workstream 3 - Add worker execution bounds at the runtime boundary

Target outcome: scheduled workers fail closed instead of hanging indefinitely.

Steps:

1. Define per-worker timeout/deadline policy near `background-workers.ts`.
2. Apply timeout handling around RSS, library scan, metadata refresh, and
   download sync loops.
3. Translate timeout failures into explicit worker failure records and logs.
4. Keep retry/skip behavior in the worker runtime layer rather than burying it
   inside feature workflows.
5. Add focused tests for hung-task timeout and monitor-state updates.

Acceptance criteria:

- worker runs cannot remain active forever because one dependency hangs
- timeout failures are visible in monitor state and logs
- future schedules recover after bounded failure behavior

Status:

- pending

### Workstream 4 - Split system config persistence by ownership

Target outcome: system config, quality profiles, release profiles, and profile
usage queries stop living in one repository file.

Steps:

1. Extract app-config row access into a dedicated system-config repository.
2. Extract quality-profile CRUD into a dedicated repository.
3. Extract release-profile CRUD into a dedicated repository.
4. Extract anime/profile usage counting into a small usage-query port.
5. Update system services to depend on the narrower repositories they actually
   use.

Acceptance criteria:

- `config-repository.ts` is deleted or reduced to one ownership area
- repository files are table- and feature-focused
- service dependencies become narrower and more explicit

Status:

- pending

### Workstream 5 - Finish shrinking operations workflow construction

Target outcome: service tags correspond to real workflow boundaries instead of
subsets of internally broad workflow objects.

Steps:

1. Split catalog construction into real read/download/library/rss workflow
   constructors, or replace the sliced tags with one real catalog workflow
   service if that boundary is actually cohesive.
2. Split search construction into release-search, import-path, unmapped-folder,
   and worker-owned constructors where ownership differs.
3. Delete `worker-services.ts` wrappers that only forward methods from other
   services or workflows.
4. Update lifecycle wiring to depend on the resulting real boundaries directly.

Acceptance criteria:

- service ownership is obvious from imports and layer wiring
- constructor breadth matches domain ownership
- pass-through service tags are deleted unless they define a real boundary

Status:

- pending

### Workstream 6 - Normalize HTTP body validation boundaries

Target outcome: write routes consistently return specific schema-driven 400s.

Steps:

1. Replace remaining `decodeJsonBody(...)` uses in write routes with
   `decodeJsonBodyWithLabel(...)`.
2. Make route labels explicit and user-facing.
3. Keep `decodeJsonBody(...)` only for internal/helper cases if it still has a
   real use case.
4. Add focused route tests for malformed JSON vs schema-validation failures.

Acceptance criteria:

- write routes no longer rely on generic unlabeled body decoding
- validation failures produce consistent route-level 400 messages
- route boundary behavior is uniform across anime/system writes

Status:

- pending

### Workstream 7 - Replace runtime-heavy service tests with feature test layers

Target outcome: service and orchestration tests assert behavior through typed
feature seams, while repository tests keep the raw DB focus.

Steps:

1. Keep raw sqlite test setup for repository-focused specs only.
2. Add small reusable feature test layers/builders for common service
   dependencies.
3. Remove `as never` dependency bags from service/orchestration tests where a
   real test seam can exist.
4. Keep direct schema inserts in repository tests, but move service tests toward
   domain fixtures and service contracts.

Acceptance criteria:

- service tests no longer require low-level runtime construction by default
- repository tests continue to own storage-shape assertions
- refactors touch fewer unrelated tests

Status:

- pending

## Suggested Refactor Order

1. make operations shared state truly singleton
2. restore truthful operations infrastructure errors
3. add worker execution bounds
4. split system config persistence by ownership
5. finish shrinking operations workflow construction
6. normalize HTTP body validation boundaries
7. replace runtime-heavy service tests with feature test layers

## Verification Checklist

- `bun run check` in `apps/api`
- `bun run test` in `apps/api`
- `bun run lint` in `apps/api`
- focused tests for shared operations coordination wiring
- focused tests for non-DB operations failure mapping
- focused tests for worker timeout and monitor behavior
- focused tests for route body-validation messages

## End State

When this plan is complete, `apps/api` should have:

- one actual shared operations coordination boundary
- truthful operations error types instead of fake database failures
- bounded background-worker execution semantics
- system config/profile persistence split back into owned repositories
- smaller, clearer operations workflow construction boundaries
- consistent labeled validation at HTTP write boundaries
- cheaper service refactors because tests depend on feature seams instead of
  runtime assembly details

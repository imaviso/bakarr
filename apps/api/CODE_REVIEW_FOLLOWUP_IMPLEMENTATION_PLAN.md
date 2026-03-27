# API Architecture Follow-Up Review Implementation Plan

## Goal

Run a second architecture and code-quality pass after the first cleanup wave, using
`apps/api/EFFECT_GUIDE.md`, the local `effect-ts` references, and the
`code-review-expert` checklists as the review baseline.

The goal is to remove the next layer of alpha-stage debt by preferring direct,
breaking simplifications over wrappers, fallback paths, route-local policy,
weak boundary schemas, and oversized orchestration modules.

## Review Basis

- `apps/api/EFFECT_GUIDE.md`
- `~/.agents/skills/effect-ts/references/04-services-and-layers.md`
- `~/.agents/skills/effect-ts/references/05-data-modeling.md`
- `~/.agents/skills/effect-ts/references/06-error-handling.md`
- `~/.config/opencode/skills/code-review-expert/references/solid-checklist.md`
- `~/.config/opencode/skills/code-review-expert/references/code-quality-checklist.md`
- `~/.config/opencode/skills/code-review-expert/references/security-checklist.md`
- `~/.config/opencode/skills/code-review-expert/references/removal-plan.md`

## Overall Assessment

The first refactor pass fixed the largest structural debt: operations no longer
has a forwarding service surface, system repositories are split, request schemas
are localized, routers shed their heaviest protocol helpers, disk space is now a
real service, and lifecycle handling is more scoped.

The remaining smells are now narrower and more architectural:

1. runtime and background lifecycle wiring are still eager and broad
2. operations orchestration is still centralized into large dependency-bag modules
3. several HTTP boundaries still accept weak stringly-typed input or embed route-local policy
4. a few security-sensitive filesystem and proxy boundaries are still too permissive

Because the repo is still pre-release alpha, the recommended path remains:
split aggressively, tighten boundaries now, and avoid carrying permissive or
route-local policy deeper into the codebase.

## Findings

### P1 - High

1. `apps/api/src/features/anime/mutation-support.ts:21`
   - `updateAnimePathEffect` accepts an arbitrary non-empty path string, calls
     `mkdir`, then canonicalizes and persists it.
   - This lets authenticated callers create or probe directories anywhere the
     process can write, instead of only allowing configured library roots.
   - This is the highest-value boundary-hardening issue left in the API.

2. `apps/api/src/features/system/image-asset-service.ts:43`
   - Image authorization is still lexical: it joins the configured image root
     with user-controlled segments and checks `isWithinPathRoot(...)` before
     reading.
   - Because the final target is not canonicalized before authorization, a
     symlink under the image root can escape the configured root and expose
     arbitrary readable files.

3. `apps/api/src/runtime.ts:14`
4. `apps/api/src/app-platform-runtime-layer.ts:37`
5. `apps/api/src/background-runtime-layer.ts:5`
6. `apps/api/src/background-controller.ts:125`
   - The runtime graph is cleaner than before, but still eagerly merges platform,
     background, feature, and app-service layers into one large graph.
   - Background worker startup remains embedded in the main app graph rather than
     being launched as an explicit post-bootstrap boundary.
   - This keeps lifecycle intent less visible than the guide wants.

7. `apps/api/src/features/operations/search-orchestration.ts:42`
8. `apps/api/src/features/operations/catalog-orchestration.ts:27`
   - The operations public surface is fixed, but the implementation is still
     concentrated into two oversized orchestration modules with broad dependency bags.
   - They mix release search, SeaDex enrichment, RSS/background work, unmapped-folder
     flows, file import, rename, download views, and library scans.
   - The result is still lower cohesion than the guide's "one module, one boundary
     or one domain concept" rule.

### P2 - Medium

9. `apps/api/src/http/system-router.ts:52`
10. `apps/api/src/http/operations-router.ts:41`
11. `apps/api/src/http/anime-router.ts:36`
   - These routers are much thinner than before, but they are still large endpoint hubs.
   - They remain good split candidates by sub-domain:
     - system: health, config, logs, tasks, metrics, events
     - operations: downloads, RSS, library, search
     - anime: reads, mutations, streaming

12. `apps/api/src/http/system-router.ts:57`
   - readiness still uses `Effect.catchAll(...)` even though the comment says
     "known typed failures"
   - this can mask defects, wiring bugs, and unexpected failures as a normal
     503 not-ready response.

13. `apps/api/src/http/auth-router.ts:13`
   - cookie `secure` behavior depends directly on `x-forwarded-proto` or the raw request URL
   - proxy trust policy is route-local and not config-backed, which is brittle
     and mixes deployment policy into adapter code.

14. `apps/api/src/http/anime-request-schemas.ts:15`
15. `apps/api/src/http/operations-request-schemas.ts:13`
16. `apps/api/src/http/system-request-schemas.ts:10`
   - dangerous boundary fields are still modeled as plain non-empty strings:
     path strings, URLs, and ISO date strings are not strongly validated at the edge
   - this keeps downstream services responsible for rejecting malformed or unsafe inputs.

17. `apps/api/src/http/anime-streaming.ts:123`
   - range parsing is still partial: only `bytes=start-end?` is supported
   - suffix ranges and richer RFC-compatible validation are still missing.

18. `apps/api/src/http/system-router.ts:81`
19. `apps/api/src/http/system-router.ts:132`
20. `apps/api/src/http/system-router.ts:308`
   - system router still owns raw wildcard path slicing, runtime log-level mutation,
     and metrics timing / instrumentation side effects.
   - These are boundary concerns, but they still deserve dedicated modules or services.

21. `apps/api/src/background-controller.ts:125`
   - the controller is still a broad cross-feature assembly point that repackages
     multiple services into a worker dependency bag.
   - Better than the deleted helper, but still a pressure point for future worker growth.

### P3 - Low

22. `apps/api/src/features/operations/unmapped-orchestration-support.ts:108`
   - one file still owns loading, scan-loop progression, control actions, and import flows

23. `apps/api/src/features/operations/background-search-support.ts:207`
   - one file still mixes missing-search orchestration and RSS orchestration

24. `apps/api/src/features/operations/download-reconciliation-service.ts:159`
   - batch reconciliation and single-download reconciliation still live together

25. `apps/api/src/http/system-router.ts:312`
   - `/api/metrics` still renders metrics twice when once would be enough

## Hard-Path Decisions

- Do not add allowlist checks on top of arbitrary persisted anime paths; replace
  the boundary so only approved library-root paths can be created or selected.
- Do not keep lexical image-root checks if canonical root checks are possible;
  authorize on canonical paths or reject the access.
- Do not split orchestration files by helper-name churn alone; split by domain
  seams so each extracted module has one reason to change.
- Do not hide proxy-trust or secure-cookie policy inside routes; move it into
  config-backed boundary code.
- Do not keep weak path/url/date request schemas if the semantics matter; replace
  them with branded or dedicated schemas.

## Removal / Split Candidates

### Safe to replace in the same refactor

- route-local cookie security policy in `apps/api/src/http/auth-router.ts`
- route-local raw image path slicing in `apps/api/src/http/system-router.ts`
- weak string aliases in `apps/api/src/http/anime-request-schemas.ts`
- weak string aliases in `apps/api/src/http/operations-request-schemas.ts`
- weak string aliases in `apps/api/src/http/system-request-schemas.ts`

### Split next, then simplify callers

- `apps/api/src/features/operations/search-orchestration.ts`
- `apps/api/src/features/operations/catalog-orchestration.ts`
- `apps/api/src/features/operations/unmapped-orchestration-support.ts`
- `apps/api/src/features/operations/background-search-support.ts`
- `apps/api/src/features/operations/download-reconciliation-service.ts`
- `apps/api/src/http/system-router.ts`
- `apps/api/src/http/operations-router.ts`
- `apps/api/src/http/anime-router.ts`

## Concrete Implementation Plan

### Workstream 1 - Lock down filesystem-facing HTTP boundaries

Target outcome: authenticated users can only read or mutate approved filesystem areas.

Steps:

1. Harden `ImageAssetService` to authorize on canonical paths, not lexical paths.
2. Add symlink-escape tests for image asset resolution.
3. Replace `PathBodySchema` / related path inputs with schemas that express an
   approved library-root path or an approved relative path.
4. Refactor anime path updates to validate configured library-root membership
   before any `mkdir` or persistence happens.

Acceptance criteria:

- image reads cannot escape the configured image root through symlinks
- anime path mutation cannot create/probe arbitrary server paths
- path authorization lives in dedicated boundary helpers/services

### Workstream 2 - Strengthen request-boundary schemas

Target outcome: dangerous strings are validated at the edge instead of downstream.

Steps:

1. Introduce dedicated schemas for:
   - canonical library path input
   - canonical relative image path input
   - validated external URL input
   - validated ISO datetime input
2. Replace non-empty-string aliases in `anime-request-schemas.ts`,
   `operations-request-schemas.ts`, and `system-request-schemas.ts` where semantics matter.
3. Add focused request-schema tests for path, URL, and datetime validation.

Acceptance criteria:

- path/url/date boundary errors are rejected before reaching services
- route code depends on meaningful schema names instead of generic string aliases

### Workstream 3 - Split the remaining operations god-modules

Target outcome: orchestration modules align with actual domain seams.

Suggested split:

1. `search-orchestration.ts`
   - release search + SeaDex enrichment
   - background missing-search flow
   - RSS flow
   - import-path scan
   - unmapped-folder orchestration entrypoints
2. `catalog-orchestration.ts`
   - download control / retry / reconciliation entrypoints
   - download queue/history/export views
   - RSS CRUD entrypoints
   - file import / rename
   - library scan
3. `download-reconciliation-service.ts`
   - batch reconciliation support
   - single download reconciliation support
4. `background-search-support.ts` and `unmapped-orchestration-support.ts`
   - split by workflow instead of helper type

Acceptance criteria:

- each module has one clear reason to change
- constructor inputs shrink and become easier to reason about
- public orchestration tags remain small and cohesive

### Workstream 4 - Finish thinning the HTTP adapters

Target outcome: routers become small endpoint registries by sub-domain.

Steps:

1. Split `system-router.ts` into health/config/logs/tasks/events/metrics routers.
2. Split `operations-router.ts` into downloads/RSS/library/search routers.
3. Split `anime-router.ts` into reads/mutations/streaming routers.
4. Extract:
   - secure-cookie policy from `auth-router.ts`
   - image path extraction from `system-router.ts`
   - log-level mutation after config update from `system-router.ts`
   - metrics timing/response assembly from `system-router.ts`
5. Tighten health readiness recovery to explicit tagged failures instead of `catchAll`.

Acceptance criteria:

- routers are grouped by endpoint area, not by the whole feature surface
- route files mostly decode input, call services, and encode responses
- route-local deployment and runtime policy moves out of handlers

### Workstream 5 - Separate app, boot, and background lifecycles

Target outcome: runtime assembly exposes lifecycle intent explicitly.

Steps:

1. Split the current app graph into explicit layers such as:
   - `PlatformLayer`
   - `BootLayer`
   - `HttpLayer`
   - `BackgroundLayer`
2. Keep config/bootstrap prerequisites separate from long-lived background launch.
3. Revisit `BackgroundWorkerControllerLive` so worker launch happens from a
   clearly named background boundary instead of as an incidental part of the full app graph.
4. Reduce nested `Layer.provide(...)` chains only when the resulting lifecycle
   graph remains valid and easier to read.

Acceptance criteria:

- app bootstrap, HTTP serving, and background worker launch are visibly distinct
- runtime assembly reads as lifecycle composition, not one big merge graph

## Suggested Refactor Order

1. filesystem boundary hardening
2. request-schema strengthening
3. router thinning follow-up
4. operations module splits
5. lifecycle / runtime graph separation

This order keeps the highest-risk security and boundary fixes first, then reduces
adapter and orchestration sprawl once the boundaries are safer.

## Verification Checklist

- `bun run check` in `apps/api`
- `bun run test` in `apps/api`
- `bun run lint` in `apps/api`
- focused tests for image asset traversal / symlink escape
- focused tests for anime path update authorization
- focused schema tests for path / URL / datetime boundaries
- focused tests for range parsing and cookie security policy

## End State

When this follow-up plan is complete, `apps/api` should have:

- canonicalized filesystem authorization at HTTP boundaries
- stronger schema-backed path, URL, and datetime inputs
- smaller operations modules with tighter dependency surfaces
- thinner routers with less route-local policy
- clearer separation between bootstrap, HTTP, and background lifecycles

That is the next hard-path cleanup worth taking before new feature work piles on
top of the remaining alpha-stage seams.

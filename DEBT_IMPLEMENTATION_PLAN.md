# Migration / Refactor / Fallback / Compatibility Debt Implementation Plan

## Purpose

This plan covers all currently identified debt in the API layer related to:

- Effect migration bridges
- Promise/throw compatibility wrappers
- Fallback/degraded execution paths
- Startup/bootstrap/repair operational transitions
- Cross-layer constant duplication

This repository is pre-release alpha, so we can prefer clean, breaking internal
refactors over preserving legacy helper APIs.

---

## Scope Inventory (Complete)

### A) Migration / Refactor Debt

1. `apps/api/src/features/anime/repository.ts`
   - `runEffectOrThrow(...)`
   - async wrapper exports: `getAnimeRowOrThrow`, `getEpisodeRowOrThrow`,
     `upsertEpisode`, `ensureEpisodes`, `updateAnimeEpisodeAirDates`, etc.
2. `apps/api/src/features/operations/repository/config-repository.ts`
   - `runDecodeOrThrow(...)` sync bridge around Effect decoders
3. `apps/api/src/features/anime/add-anime-support.ts`
   - `tryAnimePromise(...)` wrapping `resolveAnimeRootFolder(...)`
4. `apps/api/src/features/anime/file-mapping-support.ts`
   - remaining Promise-wrapped db work (`tryAnimePromise`) in
     delete/bulk-map/cache-update paths

### B) Compatibility Debt

5. `apps/api/src/http/route-auth.ts`
   - legacy throwing `requireViewer(...)` still exported
6. `apps/api/src/features/system/config-codec.ts`
   - dual API set: `decode*OrThrow` + `effectDecode*`
7. `apps/api/src/features/operations/repository/profile-repository.ts`
   - still uses `decode*OrThrow`
8. `apps/api/src/features/anime/repository.ts`
   - `resolveAnimeRootFolder(...)` still Promise/throw style with
     `decodeConfigCoreOrThrow`

### C) Fallback / Degrade Debt

9. `apps/api/src/features/system/disk-space.ts`
   - `getDiskSpaceSafe(...)` collapses all errors to zero space
10. `apps/api/src/features/anime/query-support.ts`
    - AniList failure degraded mode (`degraded: true`)
11. `apps/api/src/features/anime/file-mapping-support.ts`
    - path resolution fallbacks returning `null` via `Effect.either(...)`
12. `apps/api/src/features/anime/image-cache.ts`
    - cache failure fallback to remote/original URLs
13. `apps/api/src/features/operations/search-orchestration.ts`
    - catch-all fallback to `null`

### D) Operational Transition Debt

14. `apps/api/src/features/system/service.ts`
    - runtime corrupt config repair path ("re-save config to repair")
15. `apps/api/src/features/auth/service.ts`
    - bootstrap user creation + bootstrap password nulling behavior
16. `apps/api/src/db/migrate.ts`
    - migration execution coupled to startup

### E) Duplication / Low-Risk Debt

17. `apps/api/src/features/operations/unmapped-folders.ts`
    - `MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS`
18. `apps/web/src/components/scan/constants.ts`
    - duplicated max attempt constant

---

## Target State

1. Feature/service modules are Effect-first end-to-end.
2. `*OrThrow` compatibility wrappers are removed unless absolutely required by
   external interfaces.
3. `decode*OrThrow` APIs are removed from live paths and limited to test-only
   helpers (or fully removed).
4. Fallback behavior is explicit, observable, and policy-driven (not ad hoc
   silent recovery).
5. Startup/bootstrap/repair paths are documented and intentionally bounded.
6. Shared constants are sourced from one place across API/Web.

---

## Workstreams and Tasks

## Workstream 1: Remove Effect Bridge Wrappers in Anime Repository

Files:

- `apps/api/src/features/anime/repository.ts`
- all callsites under `apps/api/src/features/anime/*.ts`

Tasks:

1. Replace async wrapper exports with pure Effect exports in callsites.
2. Remove `runEffectOrThrow(...)`.
3. Remove `getAnimeRowOrThrow`, `getEpisodeRowOrThrow`, and wrapper variants
   once all callsites are migrated.
4. Keep domain errors typed (`Schema.TaggedError` / `DatabaseError`) in effect
   channels.

Acceptance:

- No `runEffectOrThrow` symbol remains.
- No `*OrThrow` function remains in anime repository.
- `deno task check`, `deno task test`, effect diagnostics pass.

---

## Workstream 2: Convert Config Repository to Effect-Native API

Files:

- `apps/api/src/features/operations/repository/config-repository.ts`
- operation service/orchestration callsites

Tasks:

1. Replace Promise-returning repository functions with Effect-returning
   equivalents.
2. Remove `runDecodeOrThrow(...)` and all `Effect.runSync(Effect.either(...))`
   bridging.
3. Map typed decode failures into operation-level typed errors.

Acceptance:

- No `runDecodeOrThrow` remains.
- Config repository has no sync throw bridge around Effect decode.

---

## Workstream 3: Collapse Dual Codec APIs (OrThrow -> Effect)

Files:

- `apps/api/src/features/system/config-codec.ts`
- `apps/api/src/features/operations/repository/profile-repository.ts`
- any remaining `decode*OrThrow` consumers

Tasks:

1. Migrate `profile-repository.ts` to `effectDecode*` APIs.
2. Migrate any production callsites still using `decode*OrThrow`.
3. Restrict `decode*OrThrow` to tests only, or remove entirely if not needed.
4. Update tests accordingly.

Acceptance:

- No production code imports `decode*OrThrow`.
- Optional: remove `decode*OrThrow` exports entirely.

---

## Workstream 4: Remove Legacy Throwing Auth Guard

Files:

- `apps/api/src/http/route-auth.ts`

Tasks:

1. Remove exported `requireViewer(...)` throw-based helper.
2. Keep/standardize on `requireViewerEffect(...)` only.
3. Verify no callsite relies on throwing variant.

Acceptance:

- `requireViewer(` no longer exists in source.

---

## Workstream 5: Finish Promise-Boundary Cleanup in Anime Flows

Files:

- `apps/api/src/features/anime/add-anime-support.ts`
- `apps/api/src/features/anime/file-mapping-support.ts`
- `apps/api/src/features/anime/service-support.ts`

Tasks:

1. Convert `resolveAnimeRootFolder(...)` path to Effect (or move logic into
   Effect-native helper).
2. Replace remaining `tryAnimePromise(...)` db operations with Effect db helpers
   (`tryDatabasePromise` / repository effects).
3. For transactional segments, choose one pattern:
   - keep Promise transaction boundary but isolate adapter layer, or
   - create Effect-friendly transaction helper and migrate callsites.

Acceptance:

- `tryAnimePromise(...)` only used for true external Promise boundaries (if
  any), not routine db paths.

---

## Workstream 6: Fallback Policy Hardening

Files:

- `apps/api/src/features/system/disk-space.ts`
- `apps/api/src/features/anime/query-support.ts`
- `apps/api/src/features/anime/file-mapping-support.ts`
- `apps/api/src/features/anime/image-cache.ts`
- `apps/api/src/features/operations/search-orchestration.ts`

Tasks:

1. Define fallback policy matrix per endpoint/use-case:
   - hard-fail
   - degrade with explicit flag
   - fallback with observable annotation
2. `disk-space.ts`: decide whether zero-value fallback remains or becomes typed
   soft-failure with richer readiness payload.
3. Ensure all fallbacks/degrades emit consistent structured logs/annotations.
4. Ensure API responses expose enough metadata for UI/operator clarity.

Acceptance:

- Every fallback path is intentional, documented, and observable.
- No silent catch-all fallback without annotation.

---

## Workstream 7: Operational Transition Tightening (Bootstrap/Repair/Migrate)

Files:

- `apps/api/src/features/system/service.ts`
- `apps/api/src/features/auth/service.ts`
- `apps/api/src/db/migrate.ts`
- `apps/api/main.ts`

Tasks:

1. Document and codify corrupt-config repair flow contract (trigger, response,
   audit log).
2. Document bootstrap-user lifecycle and bootstrap password nulling behavior;
   enforce one-way transition semantics.
3. Validate startup migration strategy for LAN/single-user deployment:
   - blocking startup behavior
   - failure handling and rollback expectations
4. Add operator-facing docs for these transitions.

Acceptance:

- Behavior is explicit in code comments/tests/docs.
- No ambiguous startup/repair semantics.

---

## Workstream 8: Shared Constant Deduplication (API/Web)

Files:

- `apps/api/src/features/operations/unmapped-folders.ts`
- `apps/web/src/components/scan/constants.ts`
- optional: `packages/shared/src/*`

Tasks:

1. Move `MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS` to shared contract package.
2. Consume from both API and web.
3. Keep one canonical source of truth.

Acceptance:

- No duplicated attempt-limit constant across layers.

---

## Execution Order (Recommended)

1. Workstream 4 (auth cleanup, low-risk)
2. Workstream 8 (constant dedupe, low-risk)
3. Workstream 1 (anime wrapper removal)
4. Workstream 5 (anime Promise cleanup)
5. Workstream 2 (operations config repository Effect-native)
6. Workstream 3 (codec API collapse)
7. Workstream 6 (fallback policy hardening)
8. Workstream 7 (operational transitions + docs)

---

## PR Slicing Plan

1. PR-1: Auth guard + constant dedupe.
2. PR-2: Anime repository remove wrappers (`runEffectOrThrow`, `*OrThrow`).
3. PR-3: Anime add/file-mapping Promise boundary cleanup.
4. PR-4: Config repository Effect-native API.
5. PR-5: Profile repository + codec callsite migration.
6. PR-6: Remove remaining `decode*OrThrow` from production.
7. PR-7: Fallback/degrade policy implementation + response/log shape updates.
8. PR-8: Bootstrap/repair/migration semantics documentation and tests.

---

## Verification Matrix (Per PR)

Required checks:

- `deno task check` (apps/api)
- `deno task test` (apps/api)
- `dx effect-language-service diagnostics --project tsconfig.json` (apps/api)

Additionally for fallback policy PRs:

- update/add tests validating degraded/fallback flags and logs
- verify no untyped `catch: (cause) => cause` in `Effect.tryPromise`

---

## Definition of Done

1. No compatibility bridge helpers remain in production paths:
   - `runEffectOrThrow`
   - `runDecodeOrThrow`
2. No production usage of `decode*OrThrow`.
3. Throw-based `requireViewer` removed.
4. Fallback/degraded paths are explicit and documented.
5. Startup/bootstrap/repair behaviors documented and test-covered.
6. Shared constants unified.
7. All checks green:
   - typecheck
   - tests
   - Effect diagnostics with zero warnings.

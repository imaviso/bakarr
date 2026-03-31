# API Architecture And Code Quality Review Plan - Seventh Pass

## Goal

Run a seventh architecture and code-quality pass against `apps/api` after the
sixth cleanup wave, strictly following `apps/api/EFFECT_GUIDE.md`, the local
`effect-ts` references, and the `code-review-expert` review checklists.

This pass keeps the alpha-stage hard path:

- prefer direct Effect services and layers over runtime bags and wrapper shells
- prefer small ownership-focused modules over broad support blobs
- prefer boundary-local typed errors over late generic translation
- delete thin compatibility and forwarding layers when a direct import or leaf
  service is cleaner

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

- `apps/api/src/api-lifecycle-layers.ts`
- `apps/api/src/app-platform-runtime-core.ts`
- `apps/api/src/background-controller*.ts`
- `apps/api/src/background-workers.ts`
- `apps/api/src/features/anime/**/*.ts`
- `apps/api/src/features/operations/**/*.ts`

## Current Snapshot

What is still strong:

- the API still has one visible app-layer boundary in
  `apps/api/src/api-lifecycle-layers.ts`
- most infrastructure still enters through `Context.Tag`, `Layer.effect(...)`,
  and `Effect.fn(...)`
- the sixth pass removed several wrapper-only runtime bags and mixed modules
- route adapters still stay relatively thin compared with earlier passes

What still smells:

- several feature services still expose broad aggregate surfaces assembled by
  spreading support objects together
- a few thin service shells remain with almost no domain value
- background worker startup still depends on a manual dependency bag
- some orchestration files still bundle domain rules, job bookkeeping, logging,
  and event publication in one module

## Findings

### P1 - High

None confirmed in the seventh-pass scan.

### P2 - Medium

1. `apps/api/src/features/anime/orchestration-support.ts`
   - Still owns metadata sync, episode schedule sync, monitored refresh job
     lifecycle, and folder-scan orchestration in one file.
   - This is a direct SRP violation and keeps job policy mixed with domain
     orchestration.

2. `apps/api/src/features/anime/import-service.ts`
   - Thin wrapper-only service over `upsertEpisodeEffect(...)`.
   - It adds a tag and layer without adding real domain policy.

3. `apps/api/src/features/operations/unmapped-orchestration-import.ts`
   - Still depends on the thin anime import wrapper and mixes config lookup,
     folder ownership, filesystem scan, and episode writes.
   - This keeps the import path coupled to an unnecessary service shell.

4. `apps/api/src/features/operations/unmapped-orchestration-support.ts`
   - Still acts as a broad aggregate surface over scan, control, and import
     workflows, and re-exports cleanup behavior from a child module.
   - This hides module ownership and keeps the support file acting like a
     wrapper barrel.

5. `apps/api/src/features/anime/mutation-service.ts`
   - Broad aggregate service mixing enrollment, deletion, metadata refresh, and
     settings/path mutation capabilities.
   - The service still serves as an API bucket instead of a tightly owned
     boundary.

6. `apps/api/src/features/anime/file-service.ts`
   - Still mixes scan orchestration with file mapping, deletion, file listing,
     and episode resolution.
   - The file-related domain is narrower than before, but not yet split by
     failure mode and ownership.

7. `apps/api/src/features/operations/catalog-library-service.ts`
   - Service shape is still `ReturnType<typeof makeCatalogLibraryOrchestration>`
     and hides a broad read/write/scan aggregate service.
   - The tag contract is still wider than most consumers need.

8. `apps/api/src/features/operations/catalog-library-orchestration.ts`
   - Still uses a manual dependency bag and spreads scan/write/read supports into
     one orchestration object.
   - This keeps service assembly outside the layer boundary.

9. `apps/api/src/features/operations/download-service-tags.ts`
   - Still defines multiple unrelated tags in one module and keeps
     `DownloadWorkflow` broad.
   - Progress publication and workflow control remain coupled in one file.

10. `apps/api/src/features/operations/download-trigger-service.ts`
    - Still mixes validation, overlap checks, qBittorrent interaction,
      persistence, event recording, and progress publication.
    - It remains one of the strongest mixed-concern workflow files in
      operations.

11. `apps/api/src/features/operations/download-torrent-lifecycle-service.ts`
    - Still owns sync polling, torrent state projection, coverage refinement,
      and completion reconciliation triggering.
    - Different policies and side effects remain fused together.

12. `apps/api/src/features/operations/background-search-rss-support.ts`
    - Still mixes feed fetching, candidate evaluation, queueing, job lifecycle,
      and outer error translation in one module.
    - It is readable, but the ownership boundary is still too broad.

13. `apps/api/src/features/operations/background-search-missing-support.ts`
    - Still mixes query/evaluation/queueing in one workflow and mirrors the RSS
      support structure.

14. `apps/api/src/background-controller-live.ts`
    `apps/api/src/background-workers.ts`
    - Background worker startup still depends on a manual `BackgroundWorkerDependencies`
      bag assembled by hand.
    - This is explicit, but it is still manual DI rather than direct leaf
      service requirements.

15. `apps/api/src/background-controller.ts`
    - Pure wrapper-only re-export module.
    - It adds no policy and hides the owning modules.

16. `apps/api/src/api-lifecycle-layers.ts`
    - The root graph still contains many nested `Layer.provideMerge(...)`
      segments because several feature layers still do not fully own their
      dependency wiring.
    - This is acceptable at the app boundary, but it remains a pressure signal.

### P3 - Low

1. `apps/api/src/features/operations/rss-client.ts`
   - Still re-exports parse/error items from the client module.
   - Low severity, but it slightly blurs the client boundary.

2. `apps/api/src/runtime.ts`
   - Still acts as a thin boundary shim over the lifecycle layer.
   - This is acceptable if it is the public runtime entrypoint, but otherwise it
     is another small wrapper.

## Security / Reliability Notes

- No new P0 or P1 security issue was confirmed in this pass.
- The main reliability risks remain broad orchestration modules where DB,
  filesystem, and network policies live together.
- The main maintainability risks remain aggregate service tags, wrapper-only
  service shells, and worker/runtime dependency bags.

## Safe Delete Candidates

### Safe To Remove Now

1. `apps/api/src/features/anime/import-service.ts`
   - Thin wrapper-only tag/layer over a single repository write helper.

2. `apps/api/src/background-controller.ts`
   - Pure re-export wrapper around the controller core/live modules.

### Defer Removal Until Refactor Lands

1. `apps/api/src/features/operations/unmapped-orchestration-support.ts`
   - Delete only after callers move to narrower scan/import/control service
     boundaries.

2. `apps/api/src/features/operations/catalog-library-orchestration.ts`
   - Delete or collapse only after read/write/scan become first-class services.

3. `apps/api/src/features/operations/download-service-tags.ts`
   - Split before deleting so worker-facing and API-facing services stay clear.

## Hard-Path Decisions

- Do not preserve wrapper-only services when a direct repository dependency or a
  clearer leaf service is enough.
- Do not keep aggregate orchestration files just because they are currently
  convenient import points.
- Do not add compatibility shims between old wrapper services and the new
  smaller modules.
- Do not preserve background worker dependency bags if direct tagged
  dependencies or worker-specific service tags are cleaner.

## Concrete Implementation Plan

### Workstream 1 - Split anime orchestration by responsibility

Target outcome: `anime/orchestration-support.ts` is replaced by smaller owned
modules, each with one reason to change.

Steps:

1. Extract metadata sync into a dedicated module.
2. Extract episode schedule sync into a dedicated module.
3. Extract monitored metadata refresh job orchestration into a dedicated module.
4. Extract folder scan orchestration into a dedicated module.
5. Update `mutation-service.ts`, `file-service.ts`, `metadata-refresh.ts`, and
   tests to import the smaller modules directly.
6. Delete the old aggregate orchestration file if nothing still imports it.

### Workstream 2 - Remove the wrapper-only anime import service

Target outcome: unmapped import flows write anime episodes directly through a
clear owned dependency, not through `AnimeImportService`.

Steps:

1. Replace `AnimeImportService` usage in unmapped import wiring with a direct
   `upsertEpisodeEffect(...)` dependency or a narrow inline closure at the live
   layer boundary.
2. Update `search-unmapped-service.ts` and `unmapped-orchestration-support.ts`
   to stop depending on `AnimeImportService`.
3. Remove `AnimeImportServiceLive` from `api-lifecycle-layers.ts`.
4. Delete `apps/api/src/features/anime/import-service.ts`.

### Workstream 3 - Remove wrapper-only background controller exports

Target outcome: callers import the background controller from the owning module,
not from a forwarding wrapper.

Steps:

1. Update imports in app startup, system config update, and tests to read from
   `background-controller-core.ts` or `background-controller-live.ts` directly.
2. Delete `apps/api/src/background-controller.ts`.

### Workstream 4 - Prepare worker/runtime narrowing

Target outcome: background workers move toward direct worker-task boundaries.

Steps:

1. Identify the exact worker-facing methods used by each scheduled job.
2. Introduce narrow worker task service contracts instead of the current broad
   dependency bag.
3. Move worker assembly to direct tagged dependencies or to a small set of
   worker-focused services.
4. Shrink `api-lifecycle-layers.ts` once these narrower layers own their graph.

### Workstream 5 - Prepare catalog library service split

Target outcome: library read/write/scan become explicit service contracts.

Steps:

1. Replace `ReturnType<typeof makeCatalogLibraryOrchestration>` with explicit
   service shapes.
2. Introduce separate read/write/scan service tags or layers.
3. Move current orchestration support assembly into those layer boundaries.
4. Update HTTP/background callers to depend on the narrow service they actually
   use.

## Implementation Status

Completed in this pass:

1. Workstream 1 - anime orchestration split
2. Workstream 2 - remove `AnimeImportService`
3. Workstream 3 - remove `background-controller.ts`
4. Workstream 4 - background worker dependency narrowing
5. Workstream 5 - catalog library service split

Remaining follow-up targets are the lower-priority P3 wrapper cleanups and any
new issues that surface after this refactor settles.

# API architecture deepen plan

Status: **Active** (post residual ADR-0001/0002/0004).

Do not re-litigate residual free-SQL drain. Prefer clean breaks. Effect idioms:
local `EFFECT_GUIDE.md` + `/home/yunyun/Dev/effect` (`Effect.Service` + complete
`dependencies`, compose once at lifecycle, no production `make*` DI bags).

## Glossary (architecture)

- **Module** — interface + implementation (function, class, package, slice)
- **Interface** — everything caller must know (types, invariants, errors, order)
- **Depth** — leverage at interface; deep = high leverage, shallow = interface ≈ impl
- **Seam** — where interface lives; behaviour change without edit-in-place
- **Adapter** — concrete thing satisfying interface at a Seam
- **Locality** — change/bugs/knowledge concentrated
- **Deletion test** — delete module: complexity vanishes → pass-through; reappears in N callers → earned keep

Domain terms: Media, MediaUnit, Download, Quality/Release Profile, Library,
Unmapped Folder, RSS Feed, Search, System Config, Auth, Events, Background
Worker, Operations Task. See `CONTEXT.md`.

## Goals

1. Delete shallow pass-through Modules (deletion-test fails).
2. One persistence Tag per aggregate (ADR-0004); fold workflow-named repos.
3. Complete `Effect.Service` `dependencies` so `.Default` is self-contained.
4. No production `make*` DI bags; test factories only.
5. Provide PureDbLeaves once at lifecycle; flatten feature layer ladders.
6. Align feature vocabulary: Media / MediaUnit (Anime\* only on provider models).

## Priority

| #   | Candidate                                            | Effort | Notes                               |
| --- | ---------------------------------------------------- | ------ | ----------------------------------- |
| 1   | Catalog pass-through delete/fold                     | S      | Highest deletion leverage           |
| 2   | OperationsProfile → system profile repos             | S      | ADR-0004 enforce                    |
| 3   | Download cross-aggregate method cleanup              | M      | Non-tx reads/logs off Download      |
| 4   | Production `make*` bags + complete `dependencies`    | M–L    | Effect idiom; unlocks layer flatten |
| 5   | Layer pyramid + PureDbLeaves ×1 + anime→media wiring | M      | After #4                            |
| 6   | Download module colocation                           | M      | Private SQL under one Tag           |
| 7   | Background-search / Progress fog collapse            | M      | Rename + fewer Tags                 |
| 8   | MediaRead → MediaRepository rename                   | S–M    | Name lie                            |
| 9   | Episode → MediaUnit residual naming                  | M      | Non-provider only                   |
| 10  | Mega error unions at job edges                       | S–M    | Map infra at edge                   |

## Candidates

### 1. Catalog pass-through Modules

**Files:** `features/operations/catalog/catalog-download-read-service.ts`,
`catalog-rss-service.ts`, `catalog-library-read-service.ts`,
`features/operations/layer.ts`, HTTP catalog routers.

**Problem:** Tags mostly rebind repo methods. Interface ≈ implementation.

**Solution:** Delete pure aliases. Route → repo (or one thin Module only where
multi-repo + side effects, e.g. RSS add + log).

**Done when:** No Service whose methods are 1:1 repo rebinds without policy.

### 2. OperationsProfileRepository fold

**Files:** `operations/repository/profile-repository.ts`, system quality/release
profile repos, search + background-search consumers, `pure-db-leaves.ts`.

**Problem:** Same tables, second ops-named Tag (workflow-shaped).

**Solution:** Move `loadQualityProfile` / `loadReleaseRules` onto system profile
Modules. Delete `OperationsProfileRepository`.

**Done when:** Grep finds no `OperationsProfileRepository`.

### 3. Download cross-aggregate methods

**Files:** `download-repository-service.ts` and callers.

**Problem:** Non-tx methods hit mediaUnits / media / systemLogs under Download Tag.

**Solution:**

- Reads → `MediaUnitRepository` / `MediaRepository`
- Standalone log → `SystemLogRepository`
- Keep atomic multi-table import on Download only (document)

**Done when:** Download Tag only touches downloads (+ true import tx).

### 4. Production `make*` bags + complete `dependencies`

**Files:** `download-reconciliation.ts` (10-arg factory),
`unmapped-orchestration-import.ts`, `background-search-rss-worker-service.ts`,
~15 `make*Repository(db)`, Services with partial/no `dependencies`.

**Problem:** Dual construction; `.Default` incomplete → force layer ladders.

**Solution:** Bodies in Service `effect` via `yield*`. Full `dependencies: […]`.
`make*(db)` → `src/test/` only.

**Done when:** No production orchestration bags; incomplete-deps Services fixed
or intentionally leaf-only.

### 5. Layer pyramid + PureDbLeaves once

**Files:** `operations/layer.ts`, `system/layer.ts`, `lifecycle-layers.ts`,
`media/layer.ts`, `pure-db-leaves.ts`.

**Problem:** Multi-stage provide; PureDbLeaves ×3; residual `anime*` names.

**Solution:** Provide leaves once at lifecycle. Feature layers merge complete
`.Default`s. Rename anime* → media*.

**Done when:** One PureDbLeaves provide site; no anime\* in wiring.

### 6. Download module colocation

**Files:** download repo split (~1.3k) + reconciliation.

**Problem:** One aggregate, many public modules.

**Solution:** One Tag; private SQL colocated; pure plans stay pure.

**Done when:** External imports only hit `DownloadRepository` (+ pure policy).

### 7. Background-search / Progress fog

**Files:** `background-search/*`, `download-*-support.ts` Services, progress pair.

**Problem:** Filename says support; Tag is Service. Long provide chains.

**Solution:** Rename; collapse RSS/missing Tags; fold ProgressSupport; drop
unused `*Live = Default`.

**Done when:** Filename = Tag role; fewer intermediate Services.

### 8. MediaRepository rename

**Files:** `media-repository.ts` (~762), all imports, CONTEXT.

**Problem:** “Read” owns writes.

**Solution:** Rename → `MediaRepository` (or Aggregate). One Tag.

**Done when:** Name matches R/W ownership; CONTEXT updated.

### 9. Episode → MediaUnit naming

**Files:** unit repo methods, media-file, reader, layer vars.

**Problem:** Dual terms outside provider models.

**Solution:** Unit names on feature path; Anime\* only metadata clients.

**Done when:** Grep Episode on non-provider feature path is intentional only.

### 10. Mega error unions

**Files:** `background/task-runner.ts`, reconcile/enrollment/search unions.

**Problem:** Catch-all bags hide recovery intent.

**Solution:** Map infra at job edge; domain tags for recovery only.

**Done when:** Worker/HTTP edges don’t re-export 10+ arm bags as primary API.

## Out of scope

- Release-ranking pure split (correct Seam)
- Identity parsers, provider clients
- Reopening ADR-0001/0002/0004 (hold; enforce 0004 via #2/#3)

## Verify

```bash
pnpm --filter @bakarr/api check
pnpm fmt
pnpm lint
pnpm --filter @bakarr/api test
```

## Grep guards

```bash
rg -n "OperationsProfileRepository" apps/api/src
rg -n "CatalogDownloadRead|CatalogRssService|CatalogLibraryRead" apps/api/src
rg -n "makeDownloadCompletedTorrentReconciliation|makeUnmappedImportWorkflow" apps/api/src
rg -n "providePureDbLeaves" apps/api/src
rg -n "animeLiveLayer|animeEnrollment" apps/api/src
```

## Progress

| #   | Status                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **done** — catalog slim: export-only download read; RSS add-only; rename-preview-only library read; routes→repos for list/history/progress                                                                  |
| 2   | **done** — OperationsProfileRepository deleted; loadQualityProfile / loadReleaseRules on system profile repos                                                                                               |
| 3   | **done** — non-tx reads/logs off Download; MediaRead.loadUnitsByNumbers; SystemLog append; finalizeDownloadImport keeps multi-table tx                                                                      |
| 4   | **partial** — kill makeDownloadCompletedTorrentReconciliation; inline rss worker; complete leaf deps (Progress+EventBus); unmapped/rss make\* remain test factories only; full Default trees deferred to #5 |
| 5   | **done** — PureDbLeaves once at lifecycle; media/ops take leaves arg; anime* → media* wiring names                                                                                                          |
| 6   | pending                                                                                                                                                                                                     |
| 7   | **partial** — DownloadProgressSupport → DownloadProgressService; OperationsProgress exposes get\* + coalesced publish; ProgressLive → OperationsProgressLive                                                |
| 8   | **done** — MediaReadRepository → MediaRepository (file, Tag, spans, docs)                                                                                                                                   |
| 9   | **partial** — MediaUnit/Media/MediaFile public APIs Episode→Unit; keep naming tokens + provider AnimeMetadataEpisode                                                                                        |
| 10  | pending                                                                                                                                                                                                     |

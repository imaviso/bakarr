# API residual deepen plan

Status: **P0 complete; P1 mostly complete; P2 partial.**

Do not re-litigate ADR-0001/0002/0004.

## Goals

1. Drizzle only behind `Effect.Service` repository seams (ADR-0001).
2. One repo Tag per aggregate (ADR-0004).
3. Orchestration: compose Tags + pure helpers; methods `R = never`.
4. Boundary tags survive (no blanket InfrastructureError collapse on HTTP paths).
5. Prefer delete pass-through bags over new shallow wrappers.

## Done

| Area                                          | Outcome                                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Download aggregate                            | `DownloadRepository` — lifecycle, progress, catalog history/events/export                                                                      |
| MediaUnit writes                              | `MediaUnitRepository` — map/clear/upsert/probe patch/schedule                                                                                  |
| Media R/W + unit reads                        | `MediaReadRepository` — list/count, progress, calendar/wanted, mapped units, settings, insert aggregate, delete, monitored ids, updateMediaRow |
| RSS feeds                                     | `RssFeedRepository`                                                                                                                            |
| Seasonal cache                                | `SeasonalMediaCacheRepository` — query service has no raw `db`                                                                                 |
| AniDB episode cache                           | `AniDbUnitCacheRepository` Effect.Service                                                                                                      |
| Catalog download/library read/RSS             | thin compose over repos                                                                                                                        |
| Catalog library write import plan             | unit rows via MediaRead (no free SQL)                                                                                                          |
| Catalog library write service                 | no AppDrizzleDatabase                                                                                                                          |
| Media query                                   | free SQL on MediaRead                                                                                                                          |
| Media files list/scan/delete                  | repos only                                                                                                                                     |
| Media settings                                | MediaRead + SystemLog + SystemConfig/QualityProfile Tags                                                                                       |
| Media add/enroll/metadata sync/delete/refresh | MediaRead + MediaUnit + SystemLog                                                                                                              |
| Config/profile helpers                        | SystemConfigRepository + QualityProfileRepository.qualityProfileExists                                                                         |
| Mega-unions                                   | removed                                                                                                                                        |
| Anime→Media naming                            | feature Tags/methods Media; provider models stay Anime\*                                                                                       |
| RSS feed processFeed                          | no catchTag collapse MediaNotFound/DomainInput (outer runRssCheck still maps worker-safe Infra)                                                |

## Still open

### P1 leftovers

| Item                                      | Notes                                                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Job marks (`markJob*` / `job-support.ts`) | Still raw `db` for backgroundJobs + some download helpers. Prefer SystemStats/job Tag or keep free helpers private to ops until multi-adapter. |
| Catalog library scan                      | Media list via MediaRead; still needs `db` for markJob\* only                                                                                  |
| Download infoHash SQL in RSS feed         | Still free select on downloads in processFeed — absorb into DownloadRepository if touched again                                                |
| import-scan / unmapped free SQL           | Not fully drained                                                                                                                              |

### P2 leftovers

| Item                             | Notes                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Layer DAG                        | Pure-db leaves still merged in lifecycle `sharedRepos` **and** media/ops feature layers (Effect memoizes Default). Optional: single exported `pureDbLeaves` module used once at lifecycle. |
| Enrollment/browse home           | Still special-cased in `lifecycle-layers.ts`                                                                                                                                               |
| Reconciliation file split        | Private pure/IO phases only; no new Tags                                                                                                                                                   |
| Span polish                      | Remaining `OperationsService.*` / mixed locals                                                                                                                                             |
| Reader/stream AppDrizzleDatabase | Out of core residual; touch when next edited                                                                                                                                               |

## Execution rules (when continuing)

```ts
class FooRepository extends Effect.Service<FooRepository>()("@bakarr/api/FooRepository", {
  dependencies: [AppDrizzleDatabase.Default],
  effect: Effect.gen(function* () {
    const db = yield* AppDrizzleDatabase;
    return {
      /* R = never methods */
    };
  }),
}) {}
```

- No `make*` production DI bags.
- No workflow-named repos.
- `pnpm --filter @bakarr/api check` + `pnpm lint` + tests before commit.

## Grep guards

```bash
rg -n "AppDrizzleDatabase|tryDatabasePromise" apps/api/src/features/media --glob '*.ts' \
  | rg -v 'repository/|_test\.ts|reader/|stream/'

rg -n "OperationsError|isOperationsError|MediaServiceError" apps/api/src --glob '*.ts'
```

## Verify

```bash
pnpm --filter @bakarr/api check
pnpm lint
pnpm --filter @bakarr/api test
```

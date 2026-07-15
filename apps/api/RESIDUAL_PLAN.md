# API residual deepen plan

Status: **P0 complete; P1 complete; P2 mostly complete.**

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
| RSS feed processFeed                          | DownloadRepository for infoHash + missing units; no free download SQL                                                                          |
| Job marks                                     | `BackgroundJobRepository` — markStarted/Succeeded/Failed/updateProgress/loadByName                                                             |
| Catalog library scan                          | BackgroundJobRepository only (no AppDrizzleDatabase)                                                                                           |
| import-scan free SQL                          | MediaReadRepository.listAllMediaRows / listImportScanMappedUnits / listScopedUnitRows                                                          |
| unmapped free SQL                             | MediaRead + BackgroundJob + SystemLog; no raw backgroundJobs/media selects                                                                     |
| Span polish                                   | OperationsService.\* renamed to actual service names                                                                                           |
| LibraryBrowse                                 | in operations feature layer (not special-cased in lifecycle)                                                                                   |
| Reader/stream                                 | no AppDrizzleDatabase; resolveUnitFileEffect uses MediaRead only                                                                               |

## Still open

### Optional / low priority

| Item                             | Notes                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Layer DAG                        | Pure-db leaves still merged in lifecycle `sharedRepos` **and** media/ops feature layers (Effect memoizes Default). Optional: single exported `pureDbLeaves` module used once at lifecycle. |
| MediaEnrollment special-case     | Still wired in `lifecycle-layers.ts` (crosses media + ops: SearchBackgroundMissing + TaskLauncher)                                                                                         |
| Reconciliation file split        | Private pure/IO phases only; no new Tags                                                                                                                                                   |
| release-queue free SQL           | `release-queue-support.ts` still takes raw `db` for insert/delete/update downloads — absorb into DownloadRepository when next touched                                                      |
| job-support residual             | Only `recordDownloadEvent` left (thin wrapper); prefer DownloadRepository.insertDownloadEvent when callers can take the Tag                                                                |
| download-coverage free SQL       | `hasOverlappingDownload` still raw select — DownloadRepository already has lookup methods                                                                                                  |

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
  | rg -v 'repository/|_test\.ts'

rg -n "OperationsError|isOperationsError|MediaServiceError" apps/api/src --glob '*.ts'

rg -n "markJobStarted|markJobFailed|JobSupport\." apps/api/src --glob '*.ts' \
  | rg -v 'background-job-repository|job-status|job-support'
```

## Verify

```bash
pnpm --filter @bakarr/api check
pnpm lint
pnpm --filter @bakarr/api test
```

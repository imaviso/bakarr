# API residual deepen plan

Status: **P0–P1 complete; P2 residual optional only.**

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
| Download aggregate                            | `DownloadRepository` — lifecycle, progress, catalog history/events/export, queue insert                                                        |
| MediaUnit writes                              | `MediaUnitRepository` — map/clear/upsert/probe patch/schedule                                                                                  |
| Media R/W + unit reads                        | `MediaReadRepository` — list/count, progress, calendar/wanted, mapped units, import-scan units, settings, aggregate CRUD                       |
| RSS feeds                                     | `RssFeedRepository`                                                                                                                            |
| Background jobs                               | `BackgroundJobRepository` — markStarted/Succeeded/Failed/updateProgress/loadByName                                                             |
| Seasonal / AniDB caches                       | Effect.Service repos                                                                                                                           |
| Catalog / unmapped / import-scan              | compose over repos; no free SQL for those paths                                                                                                |
| Release queue / coverage                      | `hasOverlappingDownload` + `queueParsedReleaseDownload` take DownloadRepository; deleted job-support.ts                                        |
| Media query/files/settings/add/enroll/refresh | MediaRead + MediaUnit + SystemLog / BackgroundJob                                                                                              |
| Mega-unions / Anime→Media naming              | done                                                                                                                                           |
| Span polish                                   | OperationsService.\* → actual service names                                                                                                    |
| LibraryBrowse                                 | in operations feature layer                                                                                                                    |
| Reader/stream                                 | no AppDrizzleDatabase                                                                                                                          |

## Still open (optional)

| Item                         | Notes                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Layer DAG                    | Pure-db leaves merged in lifecycle `sharedRepos` and feature layers (Effect memoizes Default). Optional single `pureDbLeaves` at lifecycle. |
| MediaEnrollment special-case | Still in `lifecycle-layers.ts` — crosses media + ops (SearchBackgroundMissing + TaskLauncher). Intentional bridge.                         |
| Reconciliation file split    | Private pure/IO phases only; no new Tags                                                                                                   |

## Execution rules

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

rg -n "job-support|markJobStarted\(|JobSupport\." apps/api/src --glob '*.ts' \
  | rg -v 'background-job-repository|job-status'

rg -n "OperationsError|isOperationsError|MediaServiceError" apps/api/src --glob '*.ts'
```

## Verify

```bash
pnpm --filter @bakarr/api check
pnpm lint
pnpm --filter @bakarr/api test
```

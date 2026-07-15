# API residual deepen plan

Status: **Complete** (optional leftovers landed).

Do not re-litigate ADR-0001/0002/0004.

## Goals

1. Drizzle only behind `Effect.Service` repository seams (ADR-0001).
2. One repo Tag per aggregate (ADR-0004).
3. Orchestration: compose Tags + pure helpers; methods `R = never`.
4. Boundary tags survive (no blanket InfrastructureError collapse on HTTP paths).
5. Prefer delete pass-through bags over new shallow wrappers.

## Done

| Area                   | Outcome                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Persistence seams      | Leaf repos as Effect.Service; orchestration composes Tags                                 |
| Error bags             | Mega-unions removed; boundary tags survive route mapping                                  |
| Anime→Media naming     | Feature Tags/methods Media; provider models stay Anime\*                                  |
| Pure DB leaves         | `app/pure-db-leaves.ts` — single PureDbLeaves used by media/ops/lifecycle                 |
| Background jobs        | BackgroundJobRepository                                                                   |
| Release queue/coverage | DownloadRepository only; job-support deleted                                              |
| Import-scan / unmapped | MediaRead + BackgroundJob + SystemLog                                                     |
| Reader/stream          | No AppDrizzleDatabase                                                                     |
| Span names             | Per-service (not OperationsService.\*)                                                    |
| LibraryBrowse          | In operations feature layer                                                               |
| Task launcher          | In operations feature layer                                                               |
| MediaEnrollment        | Bridges media+ops via `appDomainSubgraphLayer` only (no extra task-launcher special case) |
| Reconciliation policy  | Pure config predicates in `download-reconciliation-policy.ts`                             |

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
- Prefer `providePureDbLeaves(runtime)` over ad-hoc repo merges.
- `pnpm --filter @bakarr/api check` + `pnpm lint` + tests before commit.

## Grep guards

```bash
rg -n "AppDrizzleDatabase|tryDatabasePromise" apps/api/src/features/media --glob '*.ts' \
  | rg -v 'repository/|_test\.ts'

rg -n "job-support|OperationsService\." apps/api/src --glob '*.ts'

rg -n "OperationsError|isOperationsError|MediaServiceError" apps/api/src --glob '*.ts'
```

## Verify

```bash
pnpm --filter @bakarr/api check
pnpm lint
pnpm --filter @bakarr/api test
```

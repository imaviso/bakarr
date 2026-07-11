# ADR 0004: Repository by Aggregate, Not Caller Workflow

## Status

Accepted

## Context

Download persistence was split into many `Effect.Service` repositories named
after callers (`DownloadActionRepository`, `DownloadSyncRepository`,
`DownloadTriggerRepository`, `DownloadProgressRepository`,
`DownloadReconciliationRepository`). Shared primitives (insert event, status
update, load by id) were re-exported across services. Layer composition grew a
node per workflow slice. Understanding one Download write required bouncing
across files whose interfaces nearly matched their implementations (shallow
modules).

Episode writes had the same shape: free functions and ops-side SQL instead of
one MediaUnit write contract.

Effect style (local `effect` repo + `EFFECT_GUIDE.md`): one service owns a
boundary; leaf services declare dependencies; app merges feature roots. A
repository Tag is a persistence seam for a domain concept, not a mirror of the
call graph.

## Decision

1. **One repository service per aggregate** (or a deliberate command/query pair
   for the same aggregate if read and write surfaces diverge enough to justify
   two Tags). Examples:
   - `DownloadRepository` — Download lifecycle SQL (queue, sync, action,
     events, presentation contexts, finalize import, catalog history/events)
   - `MediaUnitRepository` — Episode/unit writes (upsert, map, clear, backfill,
     schedule/metadata sync)
   - `MediaReadRepository` — Media/unit reads (row loads, wanted/calendar,
     mapped-file units)
   - `RssFeedRepository` — RSS feed table (list/insert/toggle/delete)
2. **Methods name domain operations**, not the service that happens to call
   them. Prefer `finalizeDownloadImport` / `listActiveDownloadRows` over
   inventing a new Tag for each HTTP or worker entrypoint.
3. **Do not add a repository Service** solely because a new workflow needs SQL.
   Extend the aggregate repository, or extract a pure helper inside that
   module. A new Tag requires a second adapter or a distinct aggregate.
4. **Orchestration services** (`DownloadTorrentActionService`,
   reconciliation, catalog reads) depend on aggregate repository Tags and
   other domain services. They do not own Drizzle.
5. Construction follows Effect leaf patterns:
   ```ts
   class DownloadRepository extends Effect.Service<DownloadRepository>()(
     "@bakarr/api/DownloadRepository",
     {
       dependencies: [AppDrizzleDatabase.Default],
       effect: Effect.gen(function* () {
         const db = yield* AppDrizzleDatabase;
         return {
           /* domain ops, R = never */
         };
       }),
     },
   ) {}
   ```
   App/feature layers merge `DownloadRepository.Default` once with other pure-db
   leaves, then provide the platform/runtime bag.

## Consequences

- Locality: Download and Episode write bugs and schema changes concentrate in
  one module each.
- Layer graphs stay smaller; fewer intermediate “runtime” pyramids for
  persistence.
- Tests target one repository interface per aggregate.
- Rejects re-introducing workflow-named repos (`*ActionRepository`,
  `*SyncRepository`, …) for the same table/aggregate without reopening this ADR.
- Large aggregates may still split **internal** pure helpers or private
  functions; those are not separate Context Tags unless a second real adapter
  exists.

## Related

- ADR-0001: Drizzle only behind repository seams
- Domain: Download, Episode (MediaUnit), Library roots
- `apps/api/CONTEXT.md` — Persistence Seams

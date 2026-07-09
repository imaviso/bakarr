# ADR 0001: Keep Drizzle Behind Repository Seams

## Status

Accepted

## Context

Bakarr API uses Effect for dependency injection and Drizzle for SQLite. Older
feature modules passed `AppDatabase` into free repository functions, which
leaked persistence details into domain orchestration and forced tests to build
concrete SQLite wiring.

Effect idioms in `/home/yunyun/Dev/effect` and `apps/api/EFFECT_GUIDE.md`:
leaf contracts own their dependencies; callers depend on a Tag/Service, not on
how the adapter is built. `Effect.Service` bundles Tag + default Layer; method
channels keep `R = never` once the layer is built.

## Decision

1. Feature and orchestration modules depend on repository
   `Effect.Service` contracts (or a standalone `Context.Tag` only when a
   service needs multiple layer implementations or no bundled default). They
   must not take raw `AppDatabase` / Drizzle clients as parameters on domain
   method signatures.
2. Drizzle queries live only inside repository adapters.
3. Repository methods expose **domain-shaped** operations (load by id, finalize
   import, list active downloads) and return typed Effect errors
   (`DatabaseError`, `StoredDataError`, …).
4. Leaf repositories declare `dependencies: [AppDrizzleDatabase.Default]` (or
   the equivalent SQL client service) so `Repository.Default` is self-contained
   when the database layer is in the graph. Prefer
   `Layer.mergeAll(Repo.Default, …)` over reconstructing
   `DefaultWithoutDependencies` + provide for every leaf in production wiring.
5. `DefaultWithoutDependencies` is for tests and targeted overrides, not the
   default production pattern for pure-db leaves.

## Consequences

- Domain modules gain locality: persistence changes stay inside repository
  adapters.
- Tests provide repository layers via `Layer.succeed` / test adapters without
  SQLite when only orchestration is under test.
- Free-function SQL helpers may exist as private implementation inside a
  repository module, but they are not the external seam for new or touched
  paths.
- Slice repositories by aggregate (see ADR-0004), not by caller workflow.

## Related

- ADR-0004: Repository by aggregate
- `DownloadRepository`, `MediaUnitRepository`, `LibraryRootsRepository`
- `apps/api/EFFECT_GUIDE.md` — Services And Layers

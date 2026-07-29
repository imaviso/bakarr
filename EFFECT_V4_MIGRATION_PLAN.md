# Effect v4 Beta Migration Plan

Migrate the whole workspace from Effect v3 (`effect@3.22`) to Effect v4 beta
(`effect@4.0.0-beta.x`, currently `4.0.0-beta.102`).

References (local checkout of the effect repo):

- `/home/yunyun/Dev/effect/MIGRATION.md` — overview + per-topic guides in `/home/yunyun/Dev/effect/migration/`
- `/home/yunyun/Dev/effect/migration/v3-to-v4.md` — full import/API rename map (16k lines, grep as needed)
- `/home/yunyun/Dev/effect/packages/effect/SCHEMA.md` — Schema v4 reference

## Scope snapshot (measured)

| Area                                                        | Count                                     |
| ----------------------------------------------------------- | ----------------------------------------- |
| Files importing effect/@effect in `apps/api`                | 418                                       |
| Files importing effect in `apps/web`                        | 41                                        |
| Files importing effect in `packages/shared`                 | 2                                         |
| `Effect.Service` classes                                    | 92 files                                  |
| `Schema.` usage                                             | 133 files                                 |
| `Cause.` usage                                              | 52 files                                  |
| `Either.` usage                                             | 23 files                                  |
| `@effect/platform` imports (Http*, FileSystem, Path, Error) | 65                                        |
| `@effect/vitest` test files                                 | ~153 (`it.effect` ×181, `it.scoped` ×194) |

## Phase 0 — Dependencies

All Effect ecosystem packages now share one version. In `apps/api/package.json`:

- `effect` → `4.0.0-beta.102` (also in `apps/web`, `packages/shared`)
- `@effect/platform-node` → `4.0.0-beta.102`
- `@effect/sql-sqlite-node` → `4.0.0-beta.102`
- `@effect/vitest` → `4.0.0-beta.102`
- `@effect/opentelemetry` → `4.0.0-beta.102`
- **Remove** `@effect/platform`, `@effect/sql` (merged into `effect`)
- **Remove** `@effect/experimental` (unused — no imports in code)
- **Remove** `@effect/sql-drizzle` (deleted in v4; drizzle ships its own Effect
  integration): bump `drizzle-orm` → `1.0.0-beta.22` (`beta` dist-tag) which has
  `drizzle-orm/effect-sqlite-node`; bump `drizzle-kit` to the matching beta.
- Check `@effect/language-service` compatibility with v4; drop or bump if it breaks.

Install with `pnpm add effect@beta ...` per package, then `pnpm install`.

## Phase 1 — Mechanical import rewrites (scriptable)

Per the Import Map in `v3-to-v4.md`:

| v3                                                                                                         | v4                                          |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `@effect/platform/HttpApi*`, `OpenApi`                                                                     | `effect/unstable/httpapi/*`                 |
| `@effect/platform/Http*`, `Cookies`, `Headers`, `Multipart`, `UrlParams`, `Url`, `FetchHttpClient`, `Etag` | `effect/unstable/http/*`                    |
| `@effect/platform/HttpApp`                                                                                 | `effect/unstable/http/HttpEffect`           |
| `@effect/platform/FileSystem`                                                                              | `effect/FileSystem`                         |
| `@effect/platform/Path`                                                                                    | `effect/Path`                               |
| `@effect/platform/Error`                                                                                   | `effect/PlatformError`                      |
| `@effect/platform/KeyValueStore`                                                                           | `effect/unstable/persistence/KeyValueStore` |
| `@effect/sql/SqlClient`, `Migrator`, `SqlError`, `Statement`, ...                                          | `effect/unstable/sql/*`                     |
| `@effect/opentelemetry` `Otlp`                                                                             | `effect/unstable/observability/Otlp`        |
| `Either` (from `effect`)                                                                                   | `Result` (renamed module + API)             |
| `ParseResult`                                                                                              | `SchemaIssue` / `SchemaParser`              |
| `FastCheck`, `TestClock`                                                                                   | `effect/testing/*`                          |
| `FiberRef`                                                                                                 | `References` (`Context.Reference`)          |

`@effect/platform-node` keeps its name (NodeRuntime, NodeHttpServer,
NodeFileSystem, NodePath; `NodeContext` is removed → `NodeServices.layer`).

## Phase 2 — Core runtime API changes

Guides: `migration/{error-handling,forking,cause,yieldable,runtime,scope,fiberref,generators,equality}.md`

- `Effect.catchAll` → `Effect.catch`; `Effect.catchAllCause` → `Effect.catchCause`;
  `Effect.catchAllDefect` → `Effect.catchDefect`; `catchSome*` → `catchFilter`/`catchCauseFilter`
- `Effect.fork` → `Effect.forkChild`; `Effect.forkDaemon` → `Effect.forkDetach`
  (`forkScoped`/`forkIn` unchanged)
- **Cause flattened** (52 files): iterate `cause.reasons`
  (`Fail | Die | Interrupt`); `isFailure` → `hasFails`, `failureOption` →
  `findErrorOption`, `Cause.failures(c)` → `c.reasons.filter(Cause.isFailReason)`;
  `*Exception` → `*Error` (e.g. `NoSuchElementException` → `NoSuchElementError`)
- **Yieldable**: `Ref`, `Deferred`, `Fiber` are no longer Effect subtypes —
  `yield* ref` → `yield* Ref.get(ref)`, `yield* deferred` → `Deferred.await`,
  `yield* fiber` → `Fiber.join`. `Option`/`Result` still yieldable; passing them
  to combinators needs `.asEffect()`.
- `Runtime<R>` removed (4 files): use `Effect.runForkWith(services)` /
  `ManagedRuntime` equivalents per guide.
- `Effect.gen(this, ...)` → `Effect.gen({ self: this }, ...)`
- `Scope.extend` → `Scope.provide`
- Layer memoization is now shared across `Effect.provide` calls — audit tests
  relying on fresh layers (use `Layer.fresh` / `provide(..., { local: true })`).

## Phase 3 — Services: `Effect.Service` → `Context.Service` (92 files, biggest)

Guide: `migration/services.md`

- `class X extends Effect.Service<X>()("id", { effect/scoped/sync, dependencies })`
  →
  `class X extends Context.Service<X>()("id", { make })` plus an **explicit**
  `static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(...deps))`
  (`Layer.scoped` for scoped constructors).
- `.Default` no longer auto-generated → every `X.Default` usage site becomes
  `X.layer`. `dependencies:` option is gone → wire via `Layer.provide`.
- `Context.Tag("id")<Self, Shape>()` (3 files) → `Context.Service<Self, Shape>()("id")`.
- Accessors don't exist (we don't use `Effect.Tag` proxies — verify).
- Convention: name layers `layer`, variants `layerTest` etc.
- Update `src/test/repository-factories.ts` and feature `layer.ts` files accordingly.

## Phase 4 — Schema v4 (133 files)

Guide: `migration/schema.md` + `SCHEMA.md`. Highlights relevant to us:

- `Schema.TaggedError` → `Schema.TaggedErrorClass` (used heavily for domain errors)
- `annotations(...)` → `annotate(...)`
- `Union(A, B)` → `Union([A, B])`; `Tuple(A, B)` → `Tuple([A, B])`;
  `Literal("a","b")` → `Literals(["a","b"])`; `Literal(null)` → `Null`
- `Record({ key, value })` → `Record(key, value)`
- `decodeUnknown` → `decodeUnknownEffect`, `decodeUnknownEither` →
  `decodeUnknownExit` (returns Exit now), same for encode
- Filters: `filter(pred)` → `check(makeFilter(pred))`; `minLength` →
  `isMinLength`, `int` → `isInt`, etc. `nonEmptyString` → `isNonEmpty`;
  `positive`/`nonNegative` removed (use `isGreaterThan(0)` etc.)
- `transform`/`transformOrFail` → `decodeTo` + `SchemaTransformation`/`SchemaGetter`
- `optionalWith` → decision tree (`optionalKey`, `withDecodingDefaultType`, ...)
- `pick`/`omit`/`partial`/`extend` → `mapFields(Struct.pick/omit/map/assign)`
- `Schema.Date` semantics changed → use `Schema.DateFromString` for ISO strings
- `parseJson(schema)` → `fromJsonString(schema)`
- Error formatting: `ParseResult.ArrayFormatter` →
  `SchemaIssue.makeFormatterStandardSchemaV1()(issue).issues`
- `packages/shared` contracts + web usage must move together.

## Phase 5 — Database / SQL / Drizzle

- `@effect/sql-sqlite-node/SqliteClient` → same package at v4 (verify API shape).
- `@effect/sql/SqlClient` → `effect/unstable/sql/SqlClient`; `Migrator` →
  `effect/unstable/sql/Migrator` (`fromFileSystem` merged into main module).
- `@effect/sql-drizzle/Sqlite` (`src/db/database.ts`, `src/test/database-test.ts`)
  → `drizzle-orm/effect-sqlite-node`: `SqliteDrizzle.make({ schema })` →
  `makeWithDefaults(...)` per curated guidance; re-type `AppDatabase`.
- drizzle-orm 0.45 → 1.0 beta has its own breaking changes (schema defs,
  drizzle-kit config) — audit `src/db/schema.ts` and `drizzle.config.ts`.

## Phase 6 — HTTP server + platform-node

- HttpApi/HttpApiBuilder/HttpApiGroup etc. from `effect/unstable/httpapi` —
  APIs largely same-named but audit signature drift via the rename map.
- `NodeContext.layer` → `NodeServices.layer`; `NodeRuntime.runMain` still exists.

## Phase 7 — Telemetry

- `Otlp` from `@effect/opentelemetry` → `effect/unstable/observability/Otlp`
  (`src/infra/telemetry.ts`); keep `@effect/opentelemetry@beta` only if we still
  use NodeSdk/OtelTracer, otherwise drop the dep.

## Phase 8 — Tests (@effect/vitest v4)

- `it.scoped` is **gone** — `it.effect` now provides `Scope` directly:
  `it.scoped(...)` → `it.effect(...)` (194 occurrences, mechanical).
- `it.layer(L)(...)` still exists; verify options shape.
- TestClock import moves to `effect/testing/TestClock`.
- Structural equality is default in v4 (`Equal.equals`) — some assertions may
  change behavior; watch for tests relying on reference equality.

## Phase 9 — Web + shared

- `packages/shared` (2 files): Schema contracts — migrate with Phase 4 rules.
- `apps/web` (41 files): mostly Effect/Schema at query boundaries; apply the
  same rename phases. No platform packages in web.

## Phase 10 — Docs

- Rewrite `apps/api/EFFECT_GUIDE.md` for v4 idioms (Context.Service, layer
  naming, catch*, Result, Schema v4).
- Update `AGENTS.md`/`CONTEXT.md` references if they mention v3 patterns.

## Execution strategy

1. Phase 0, then run `pnpm --filter @bakarr/api check` to get the error
   baseline (expect thousands; that's fine).
2. Apply Phases 1–2 with scripted codemods (sed/grep) where mechanical, then
   fix by hand directory-by-directory: `packages/shared` → `apps/api/src/db` →
   `src/config` → `src/infra` → `src/features/*` → `src/http` → `main.ts` →
   tests → `apps/web`.
3. Convergence loop: `pnpm --filter @bakarr/api check` until clean, then
   `pnpm --filter @bakarr/api test`, then web check/build, then root
   `pnpm check && pnpm test`.
4. Commit checkpoints after each phase compiles (no backward-compat shims —
   pre-release alpha, breaking refactors preferred per AGENTS.md).

## Risks / open questions

- **drizzle-orm 1.0 beta** is a second major migration riding along; its
  Effect integration is new and the exact `effect-sqlite-node` API must be
  verified against the installed version.
- `@effect/language-service` v4 compat unknown.
- v4 beta APIs may shift between beta releases (pin exact version).
- Layer memoization semantics change could alter test isolation
  (`it.layer`, repository factories) — watch for cross-test state leaks.
- `Schema.Date`-style silent behavior changes: type-checks but behaves
  differently. Grep specifically for `Schema.Date`, `Schema.parseJson`,
  `Schema.Redacted`, `decodeUnknownEither` result handling.

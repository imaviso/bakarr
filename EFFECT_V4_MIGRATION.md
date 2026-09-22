# Effect v3 → v4 Migration Progress

Target: `effect@4.0.0-rc.112` (single version across all `@effect/*` packages).
Reference sources, in priority order:

1. Local Effect repo checkout `/home/yunyun/Dev/effect` (source + `migration/v3-to-v4.md`, `migration/schema.md`, `migration/services.md`)
2. `effect` skill references (`~/.agents/skills/effect/references/*`)
3. `apps/api/EFFECT_GUIDE.md` (will be rewritten for v4 at the end)

Install equivalent of v3 packages used here:

| v3 package                | v4 location                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `effect`                  | `effect@4.0.0-rc.112`                                                                                       |
| `@effect/platform`        | folded into `effect` (`effect/FileSystem`, `effect/unstable/http/*`, ...)                                   |
| `@effect/platform-node`   | `@effect/platform-node@4.0.0-rc.112`                                                                        |
| `@effect/opentelemetry`   | `@effect/opentelemetry@4.0.0-rc.112` (barrel split; OTLP now lives in `effect/unstable/observability/Otlp`) |
| `@effect/vitest`          | `@effect/vitest@4.0.0-rc.112`                                                                               |
| `@effect/sql`             | `effect/unstable/sql/*`                                                                                     |
| `@effect/sql-sqlite-node` | `@effect/sql-sqlite-node@4.0.0-rc.112`                                                                      |
| `@effect/sql-drizzle`     | **removed** → `drizzle-orm@1.0.0-beta.1-cdf226f` dist-tag `effect`, import `drizzle-orm/effect/sqlite`      |
| `better-sqlite3`          | **removed** — v4 SQLite client uses `node:sqlite` (`DatabaseSync`), Node ≥22.5                              |

Status legend: ✅ done · 🔶 partially done · ⬜ not started

## Hard path rule

v4 idiomatic guidance wins over house conventions. Priority: pinned `effect` source + `effect` skill references > `EFFECT_GUIDE.md` > existing repo patterns. Breaks below are decisions, not proposals. New/changed code follows them; already-migrated code refactors opportunistically (no big-bang rewrites).

- **Self-sufficient `static readonly layer` embedding prod deps — dead.** `Layer.effect(X, make()).pipe(Layer.provide(A.layer), ...)` (`session-service.ts:310`, `credential-service.ts:132`, every repository) bakes transitive `R` into `X.layer` — the exact `TS2375` test pain — and hides authority at the wrong boundary. Skill (`SERVICES_LAYERS.md` Runtime Wiring): flat topologically-sorted layers, `provide` at assembly, never blind provide-as-make-it-compile. Service modules export `layer = Layer.effect(X, Effect.gen(direct yields only))` with no `.pipe(provide(...))`. Graph assembly lives in `app/lifecycle-layers.ts`. Tests provide stubs for the same direct deps. `makeXService` exports stay — enabler, not problem.
- **`(db, sqlClient)` value threading — dead.** `makeXShape(db, client)`, 4-tuple test callbacks (`database-test.ts`), `repository-factories` passing values are manual DI. `DbExecutor` becomes a `Context.Service` (`layer` yields `SqliteClient` → `makeDbExecutor`); repository layers `yield* AppDrizzleDatabase` + `yield* DbExecutor`, zero-arg `make`. Test helper returns a Layer (temp sqlite + migrations + `DbExecutor`) instead of tuples; bodies `yield* Repo.Service` after `Effect.provide(testDbLayer)`. Remaining conversions follow this; converted files migrate when touched.
- **`Schema.Class` as default record — dead for new models.** Skill bans `Class`/`TaggedClass` as default patterns (`SCHEMA.md` Variants). New/changed models: `Schema.Struct` + same-name `interface`, `.fields`/`fieldsAssign`/`mapFields` reuse, `TaggedStruct`/`TaggedUnion` for boundary variants, `Data.TaggedEnum` internal-only. Existing `Class` models stay until their feature is touched. `EFFECT_GUIDE.md` Data Modeling section gets rewritten, not patched.
- **Hand stubs over `TestService`/`testLayer` — dead for new fakes.** Skill (`TESTING.md`): `TestInterface extends Interface`, same object backs `Service` + `TestService` via `Layer.effectContext`, `Layer.succeed` for static, `Layer.mock` for tiny partials. `stubs.ts` stays (works); new fakes follow the skill.
- **Bare-response handler rewraps — check source first.** v4 `HttpRouter.add` accepts bare `HttpServerResponse` values (`HttpRouter.ts:504`). Never `Effect.succeed`-wrap to satisfy types; leaked requirements come from elsewhere — find them.
- **`addPrefixed` stays.** 12 lines, 6 call sites, names a real concept (mount point via `router.prefixed`). Wrapper ban targets vague indirection; this is genuine reuse.
- **`tryDatabaseQuery`/`queryFirst` stay.** Skill endorses curried operation-error helpers with labels (`SERVICES_LAYERS.md` Operation Error Helpers). Already `Effect.fn`-named. No change.
- **Lint bans stay** (`no-as-casts`, `no-async-await`, `no-unknown`-in-domain). Skill agrees. `unknown` only at honest boundaries with header disables.

## Completed

### Dependencies ✅

- `apps/api`, `apps/web`, `packages/shared` on `effect@4.0.0-rc.112`
- `@effect/platform-node`, `@effect/platform-node-shared`, `@effect/opentelemetry`, `@effect/vitest`, `@effect/sql-sqlite-node` pinned to `4.0.0-rc.112`
- Removed `@effect/platform`, `@effect/experimental`, `@effect/sql`, `@effect/sql-drizzle`, `better-sqlite3`
- `drizzle-orm` switched to `1.0.0-beta.1-cdf226f` (the `effect` dist-tag). No newer `effect` dist-tag exists (checked `npm view`), so beta type bugs are worked around locally, not pinned away.
- `drizzle-kit` kept (`^0.31.10`) for `db:generate` — unaffected by runtime migration.

### Non-test `apps/api` source 🔶 (all `src/**` clean; `main.ts` runMain wiring in progress)

All `src/**` (non-test) compile. `main.ts` has ONE remaining error (`NodeRuntime.runMain` arg R leaks). Fixes beyond the mechanical codemods below:

#### Hard path Break 1 applied (embedded prod provides stripped)

Removed `.pipe(Layer.provide(...))` dep-embedding from layer `static readonly` constructors so layers expose only their direct yields (kill `TS2375` test pain, flatten authority to the assembly boundary):

- **All 15 repository layers** (`features/*/repository/*`, `auth/user-repository.ts`): `Layer.effect(X, gen{yield AppDrizzleDatabase; yield NodeSqliteClient.SqliteClient; return makeXShape(db, sqlClient)})` — no self-provide. `DatabaseSqlClientLive` moved into `PureDbLeaves` (`app/pure-db-leaves.ts`) as its single production provision site.
- `RuntimeConfigSnapshotService.layer` / `SystemConfigService.layer`: stripped `Layer.provide(SystemConfigService.layer)` / repo provides.
- `lifecycle-layers.ts` reordered into a topo staircase: `platformExternal` → `infrastructure` → `runtimeSupport` → `pureDbLeaves` → `systemConfigServiceLayer` → `runtimeConfigSnapshotLayer` → `configRuntimeLayer` → `externalClientLayer` → `runtimeSupportWithClientsLayer` → operations/torrent/task-runner/controller staircase → `appSupportLayer`. `SystemConfigService` and `RuntimeConfigSnapshotService` are now built before external clients (they were a hidden circular dep). `PureDbLeaves` became the sole repo provision; every feature graph is provided once via `appSupportLayer`.

Other non-test fixes:

- Config/Schema: `Schema.compose` → `Schema.decodeTo`; `Schema.BooleanFromString` gone → `Config.boolean("KEY")` for env flags, custom `Literals(["true","false"]).pipe(decodeTo(Boolean, ...))` for query params; `Schema.Redacted(S)` → `Schema.RedactedFromValue(S)`; `Schema.omit` → `.mapFields(Struct.omit([...]))`; `Schema.Schema.Encoded` → `Schema.Codec.Encoded`; `Schema.filter` → `Schema.check(Schema.makeFilter(...))` (message annotation is a plain string); `Config.schema(key, S)` arg order fixed to `Config.schema(S, key)`; `Brand.refined`/`Brand.error`/`Brand.either` → `Brand.make` / `Brand.result`; multi-value `Schema.Literal(400, ...)` → `Schema.Literals([...])`.
- `Effect.provideService(Tag, impl)` / `Layer.succeed(Tag, impl)` want the **Shape**, not the `Context.Service` class value (the class instance type is the empty `Self` with only `Service`/`[ServiceTypeId]`/`key`). Helper fns returning service impls for these must be annotated `XShape` (return `X.of({...})` typed as `XShape`), e.g. `route-auth_test.ts` `makeAuthSessionService(): AuthSessionServiceShape`. Error was `TS2739: Type 'AuthSessionService' is missing … from 'AuthSessionServiceShape'`.
- Drizzle: see "Drizzle query objects" (solved, central pattern).
- HTTP: `HttpRouter.serve(createHttpApp())` in `main.ts` (replaces `toHttpEffect` + `HttpServer.serve` plan); 19 router files dropped premature `.pipe(Layer.provide(HttpRouter.layer))` (each built an isolated router — routes must register on the shared ambient router; prefixing via `addPrefixed` provides a `router.prefixed(p)` view); global guard middleware returns `yield* route` (not `route`); `expireCookie(...)(response)` is an Effect → `yield*`; `setCookieUnsafe` replaces `unsafeSetCookie`; `buildExportStreamResponse` returns `Effect` now.
- `Context.Service` class as a _value type_ is the empty `Self` — function params/fields annotated with the class lose all methods. Use `X["Service"]` (e.g. `ChildProcessSpawner["Service"]`). `ChildProcessSpawner.string` **exists** in v4 (old doc claim wrong); `Command.make` is template-literal or array form (`make("df", ["-Pk", path])`).
- Logger: `LogLevel` is a string union (`"Debug"`/`"Error"`/`"Info"`/`"Trace"`/`"Warn"`, no `Warning`, no `.ordinal`/`.label`) — compare via `LogLevel.getOrdinal`; `Logger.make` takes a **sync** fn (effectful fn silently never runs — runtime logger uses `Effect.runSync` inside); `Logger.jsonLogger` gone → `JSON.stringify` of message/level/timestamp/cause.
- Stream: `paginateChunkEffect`/`unfoldChunkEffect`/`fromChunk` gone → `Stream.paginate` / `Stream.unfold` + `flatMap(Stream.fromIterable)`; `runFold`/`runFoldEffect` initial is `LazyArg` (thunk: `() => zero`); `Effect.yieldNow` is a value, not a function.
- Misc: `Effect.async` → `Effect.callback`; `Effect.iterate` gone → plain `while` loop in gen; `Effect.cachedFunction` gone → `Cache` (`cache.get(k)` method form gone → `Cache.get(cache, k)`); `Cache` type is 4-param (`Cache<K,A,E,R>`); `Semaphore` as a type → `Semaphore.Semaphore`; `Deferred.unsafeDone` → `Deferred.doneUnsafe` (+ `Deferred.done` for Exits); `Exit.isInterrupted` → `isFailure && Cause.hasInterruptsOnly`; `Scope.CloseableScope` gone (use `Scope.Scope`); `Metric.Metric` takes 2 params (`<Input, State>`); Prometheus renderer rewritten for v4 `Metric.Snapshot` (`{id, type, attributes, state}`); `SocketCloseError.is` → `instanceof`; v4 `Terminal` has no `isTTY` (use `process.stdout?.isTTY`); `DateTime.unsafeFromDate` → `makeUnsafe`, `distanceDuration` → `distance` (+`Duration.toMillis`), `Duration.greaterThan*` → `isGreaterThan*`, `DateTime.add` takes `{milliseconds}`; `HttpClient.make` handler is 4-arg `(request, url, signal, fiber)`; `RequestError` split (`TransportError` etc. under `HttpClientError({reason})`); `SchemaIssue.defaultFormatter` doesn't exist → `makeFormatterDefault()` / `makeFormatterStandardSchemaV1()`; `Predicate.isRecord` gone (`hasProperty` works on `unknown` directly); `Layer.mapError` gone (provider layers here were `E=never`, dropped); `FileSystem.MakeDirectoryOptions/RemoveOptions` inlined; `SQLitePreparedQuery.execute` etc. unchanged.
- `download-reconciliation-service.ts` was the last `Effect.Service` — migrated.
- 8 `Context.Service<…, unknown>` placeholder shapes fixed (4 via `Effect.Success<ReturnType<typeof makeX>>`, 1 via existing workflow shape, `DownloadTriggerGate` → `Semaphore.Semaphore`, 2 hand-written).
- Barrel `String`/`Number`/`Boolean`/`Array` are module namespaces in v4, not callables — 57 call sites switched to `globalThis.*` / templates / `Array.empty`.

### Mechanical codemods ✅ (all packages: api/web/shared)

- Import paths: `@effect/platform/X` → `effect/FileSystem`, `effect/unstable/http/*`, `effect/unstable/socket/Socket`, `effect/unstable/process/*`, `effect/PlatformError`; `@effect/sql/*` → `effect/unstable/sql/*`; `effect/Either` → `effect/Result`; `effect/TestClock` → `effect/testing/TestClock` (namespace import); `@effect/platform-node/NodeContext` → `NodeServices` (`@effect/platform-node/NodeServices`); namespace imports (`import * as HttpRouter ...`) for modules whose service tag shadows the module name.
- `Schema.Literal(a, b, c)` → `Schema.Literals([a, b, c])`; spread `Schema.Literal(...VALUES)` → `Schema.Literals([...VALUES])`; `Schema.Union(A, B)` → `Schema.Union([A, B])`; `Schema.Tuple(A, B)` → `Schema.Tuple([A, B])`
- Filters: `Schema.int()` → `Schema.check(Schema.isInt())` (merged with adjacent checks), `Schema.between(a, b)` → `Schema.check(Schema.isBetween({ minimum: a, maximum: b }))`, `greaterThan`/`lessThan`(+`OrEqualTo`) → `Schema.check(Schema.is*)`, `positive()` → `Schema.check(Schema.isGreaterThan(0))`, `nonNegative()` → `Schema.check(Schema.isGreaterThanOrEqualTo(0))`, `minLength`/`maxLength`/`pattern` → `Schema.check(Schema.is*)`
- Decoding: `Schema.decodeUnknownEither` → `Schema.decodeUnknownResult`, `decodeEither` → `decodeResult`, `encodeUnknown` → `encodeUnknownEffect`, `decodeUnknown` → `decodeUnknownEffect`, `Schema.encode(...)` → `Schema.encodeEffect(...)`, `Schema.parseJson(S)` → `Schema.fromJsonString(S)`
- Result/Either: `._tag === "Left"/"Right"` → `"Failure"/"Success"`, `.left` → `.failure`, `.right` → `.success`, `Either.isLeft/isRight` → `Result.isFailure/isSuccess`, `Effect.either` → `Effect.result`
- Errors/cause: `Effect.catchAll` → `Effect.catch`, `catchAllCause` → `catchCause`, `catchAllDefect` → `catchDefect`, `Effect.dieMessage("x")` → `Effect.die(new Error("x"))` (also `Stream.dieMessage`), `Cause.failureOption` → `Cause.findErrorOption`, `Cause.dieOption` → `Cause.findDefect`, `Cause.isDie` → `Cause.hasDies`, `Cause.isInterruptedOnly` → `Cause.hasInterruptsOnly`, `Cause.sequential(a, b)` → `Cause.combine(a, b)`, `Cause.TimeoutException` → `Cause.TimeoutError`, `ParseResult.isParseError` → `Schema.isSchemaError`, `ParseResult.ArrayFormatter.formatErrorSync(e)` → `SchemaIssue.makeFormatterStandardSchemaV1()(e.issue).issues`, `ParseResult.TreeFormatter.formatErrorSync(e)` → `SchemaIssue.makeFormatterDefault()(e.issue)`
- Effect combinators: `Effect.zipRight` → `Effect.andThen`, `Effect.fork` → `Effect.forkChild`, `Effect.forkDaemon` → `Effect.forkDetach`, `Effect.ignoreLogged` → `Effect.ignore`, `Effect.makeSemaphore` → `Semaphore.make`, `Effect.timedWith(currentTimeNanos)(X)` → `Effect.timed(X)`, `Effect.timeoutFail({ duration, onTimeout })` → `Effect.timeoutOrElse({ duration, orElse: () => Effect.fail(...) })`, `Effect.fromNullable` on Option module → `Option.fromNullishOr`
- Metrics: `Metric.tagged(m, k, v)` chains → `Metric.withAttributes(m, { ... })`, `MetricBoundaries.fromIterable([...])` → plain array + `Metric.histogram(name, { boundaries, description })`
- Layers: `Layer.scopedDiscard` → `Layer.effectDiscard`, `Layer.unwrapEffect` → `Layer.unwrap`, `Layer.scoped` → `Layer.effect` (scope now built in), `Layer.scopedContext` → `Layer.effectContext`
- Config: `Schema.Config("KEY", S)` → `Config.schema(S, "KEY")` (arg order flipped); `Config` barrel renamed to `EffectConfig` in files that also import shared `type Config` (alias since removed where unused)
- `Schema.Defect` → `Schema.Defect()` (now a function)
- `Layer.setConfigProvider` → `ConfigProvider.layer(...)`; `PlatformConfigProvider.layerDotEnvAdd` → `ConfigProvider.layerAdd(ConfigProvider.fromDotEnv({ path }))`
- `Schedule.whileInput` → `Schedule.while(({ input }) => ...)` + `Schedule.compose(Schedule.recurs(n))` → `Schedule.upTo({ times: n })`; `Schedule.addDelay` is pipeable data-last with effectful `(meta) => Effect<Duration.Input>` fn
- Router (v3 builder → v4 layer collector): `HttpRouter.empty.pipe(HttpRouter.get(...), ...)` → `Layer.mergeAll(HttpRouter.add("GET", ...), ...)` (no per-file `Layer.provide(HttpRouter.layer)`); `HttpRouter.concatAll/concat` → `Layer.mergeAll`; `HttpRouter.prefixAll(p, x)` → `addPrefixed` helper (provides `router.prefixed(p)` view); `HttpRouter.toHttpApp` → `HttpRouter.serve(appLayer)`; `HttpServer.serve(httpEffect)` wiring replaced by serve; `NodeHttpServer.layer(() => createServer(), { port })` unchanged; `NodeRuntime.runMain` still the entrypoint
- `it.scoped(...)` → `it.effect(...)` (v4 `it.effect` already supplies `Scope`); `describe` now imported from `@effect/vitest` where missing
- `HttpServerResponse.expireCookie(name, opts)` returns an Effect — call sites `yield* expireCookie(name, opts)(response)`

### Services ✅ (75 classes migrated + stragglers)

`class X extends Effect.Service<X>()("key", { effect|scoped|sync|succeed, dependencies })` →
`class X extends Context.Service<X, XShape>()("key") { static readonly layer = Layer.effect(X, impl).pipe(Layer.provide(...deps...)) }`

- All `.Default` / `.DefaultWithoutDependencies` consumers → `.layer`
- `X.make(shape)` (typed impl construction) → `X.of(shape)` (`Context.Service` carries `.of`)
- Shape interfaces (`XShape`) created where missing; `satisfies XShape` retained for type inference
- `ExternalCall`/`AppConfig`/`BootstrapConfig`/`ObservabilityConfig` `Context.Tag` classes → `Context.Service`
- Service `make` constructors exported (`export const makeXService`) where tests need to build the service without the production dependency layers (see Tests)

### Drizzle query objects ✅ (solved, central pattern in `infra/effect/db.ts`)

Verified against the installed beta runtime (`effect-wrapper.js`, `effect/sqlite/{db,driver,session}.js`, `sqlite-core/query-builders/*.js`) — the old doc's `Effect.tryPromise` plan was wrong and is superseded:

- `effectWrap` proxy **throws** on `.then/.catch/.finally` — selects must run as Effects, never via `tryPromise`.
- Selects: `.effect()` works at runtime on any chain (builders mutate and return `this`), but chained types rebuild to `Omit<SQLiteSelectBase>` (via `SQLiteSelectKind`, losing `Effect`/`.effect`). Uniform execution: `....prepare().effect()`, typed by a single module augmentation on `SQLitePreparedQuery` (`effect(): Effect<T["execute"], SqlError, SqliteClient>`) in `db.ts`. Conditional builders restructured to mutate-then-execute (`const q = db.select()...; if (c) q.where(...); ... q.prepare().effect()`).
- Insert/update/delete builders have **no** `.effect()` at runtime — but their terminal `.run()/.all()/.get()/.values()` return Effects (the session is always `EffectSQLiteSession`). Same `.prepare().effect()` spelling covers them with correct `returning()` row mapping.
- `db.transaction()` **throws `Not implemented!`** at runtime. Replaced by `DbExecutor.runTransaction(msg, Effect.gen(...))` → `client.withTransaction(body)`. Transaction bodies use the same `db.*...prepare().effect()` queries (the shared transaction service routes them to the tx connection, so the outer client provision stays correct). 21 `async (tx)` call sites rewritten (incl. `throw` → typed `DatabaseError` fail, `tx.*` → `db.*`).
- Queries require `SqliteClient` at _execution_ time (v3 captured it at construction). `DbExecutor` (`makeDbExecutor(client)` in `db.ts`) binds one client value per repository: `runQuery` / `queryFirst` / `runTransaction` all `Effect.provideService(..., SqliteClient, client)` + `tryDatabaseQuery` (busy-retry preserved, now generic over `E, R`). Public repository shapes keep `R = never`; each `makeXShape(db, sqlClient)` builds its `exec`; layers additionally provide `DatabaseSqlClientLive` (memoized, no extra connection). `tryDatabaseQuery`/`queryFirst` stay as pure `E, R`-generic primitives.
- `db.effectGet<T>(sql)` / `db.effectAll<T>(sql)` used for raw-SQL one-offs (sidecar counts, `changes()`, stats aggregates).
- Test support: `withSqliteTestDbEffect` passes `(db, file, client, exec)`; `repository-factories` take `(db, client)`; raw-builder `Effect.tryPromise` seeds converted (they never executed — builders aren't thenables).

### Tests ✅ (all 1074 pass; `main_test.ts` + runMain wiring fixed this session)

- `it.effect` requires **exactly** `Effect<A, E, Scope>` — residual app-service requirements fail. Two recurring causes, both fixed per file:
  - `X.layer.pipe(Layer.provide(stubs))` embeds the _production_ dependency layers, whose transitive `R` leaks. Fix: `Layer.effect(X, makeXService())` + provide the same stubs (constructor needs only its direct yields). Requires exported `makeXService` (done for enrollment/query/media-file services; repeat as needed).
  - Direct `tryDatabaseQuery`/raw-builder `tryPromise`/old `TestDatabase = SqliteRemoteDatabase` seeds → `exec.*` + `AppDatabase` + `(db, client[, exec])` threading.
- `withSqliteTestDbEffect`/`withFileSystemSandboxEffect` are clean; `R = never` bodies pass, `Scope`-needing bodies pass.
- `stubs.ts` rewritten for v4 spawner shape (`spawn/exitCode/streamString/streamLines/lines/string`, `["Service"]` return types, `PlatformError.PlatformError` constraint).
- `HttpClient.make` stub handler is 4-arg `(request, url, signal, fiber)`; `RequestError` split (`TransportError` etc. under `HttpClientError({ reason })`).
- `Metric.snapshot` is v4 `{id, type, attributes, state}` — test snapshot helpers rewritten (mirrors `infra/metrics.ts` renderer).
- `main_test.ts` green: template-db bootstrap (`bootstrapPassword: "admin"`) + per-test copy + `toHttpEffect` request pipeline.

## This session: hang root-cause + final test sweep (0 left)

### The vitest hang: `mergeAll` + shared provide-target blowup

`main_test.ts` "GET /health" hung the whole run. Bisect trail (probe files in `/tmp`, tsx vs vitest):

- Standalone `tsx` replicas of the exact test flow passed → not runtime wiring.
- Minimal vitest repro: **two sequential `ManagedRuntime`s over the same lifecycle layers** → 2nd `Layer.build` starves the event loop (no timers fire = infinite sync loop); without `dispose` between builds it OOMs instead.
- Trigger shape: `Layer.mergeAll(stage6Layer, SystemConfigUpdateServiceLive.pipe(Layer.provide(stage6Layer)))` — the SAME layer object used both as a top-level merge member AND as the provide-target of a sibling. One runtime builds fine; a second build never terminates. Plain `mergeAll(L, L)` with dispose reproduces it too; a tiny 2-layer equivalent does NOT (graph-size dependent).
- **Fix (lifecycle-layers.ts): the whole feature staircase now chains with `Layer.provideMerge`** — `stageN = featureN.pipe(Layer.provideMerge(stageN-1))`. Every `mergeAll(prev, next|provide(prev))` stage handed the SAME layer object two roles (merge member + provide-target); v4 then built the entire sub-graph TWICE — stage6 hit 2.3GB heap at build (25.4M snapshot nodes: 9.4M objects, 6.6M closures, 2.7M arrays) and hung on repeated runtime builds. After the rewrite the app builds in ~33MB delta and `pnpm dev` runs at ~230MB RSS (was 2.4GB). Rule: **never pass the same layer object to both `mergeAll` and `Layer.provide`; chain stages with `provideMerge`** — it keeps the whole previous context in the output, so routes still see every service.

### JSON wire contract: absent optionals serialize as `null`

v4 `HttpBody.jsonSchema` uses `Schema.toCodecJson` — `Schema.optional(S)` encodes `undefined` → `null` (JSON has no undefined; `optionalKey` drops the key instead but then fails encode when the key is present with `undefined`). Consequences (shared contracts):

- Response DTO optional fields must **decode `null`**: `Schema.optional(Schema.NullishOr(X))` + `| null` in the interface. Applied to `OperationTaskSchema`, `MediaUnitSchema`, `CalendarEventExtendedPropsSchema`, `MissingUnitSchema`, `DownloadHistoryPageSchema.next_cursor`, `DownloadEventsPageSchema.{next,prev}_cursor`.
- Test assertions changed `undefined` → `null` for DTO fields (`file_path`, `coverage_pending`, `next_cursor`).
- v4 issue messages: `"Missing key"` (not "is missing"), `"Expected a value greater than 0"` (no `actual N` clause); use `decodeUnknownResult(S, { errors: "all" })` to see every failing path.

### Misc v4 runtime facts fixed this session

- `ConfigProvider.fromDotEnv` is an **Effect that fails with `PlatformError` when the file is missing** (v3 ignored it) — callers catch and fall back (runtime-core already did; provider_test now does).
- v4 `SocketError` wraps close failures with the close error as `reason` — `isExpectedSocketClose` unwraps `SocketError.reason` before `instanceof SocketCloseError`. In vitest, construct socket errors via named imports (`new SocketCloseError(...)`), not namespace (`Socket.SocketCloseError` is not a constructor under vite SSR).
- v4 `SystemError` normalizes the branch into `_tag` (`"NotFound"`), no `reason` indirection — `isSystemNotFoundError` simplified.
- `ExternalCall` retry loop rewritten: `isRetryableError` now gates retrying itself (v3 code only gated the log tap, so a non-retryable failure still scheduled the next delay — a TestClock-blocking sleep). Loop keeps `R` generic, normalizes failures to `ExternalCallError`.
- Scheduler semantics: `Effect.forkChild` children are **not eagerly scheduled** — coalescing-runner tests must `yield* Effect.yieldNow` (value, not fn) after forking followers before releasing the lead; a trigger during a later run legitimately causes a follow-up run (drain contract), so worker test expects 3 runs.
- Drizzle beta builders are not thenable: `Effect.tryPromise(() => db.insert(...).values(...))` resolves the builder and never executes. All test seeds converted to `.prepare().effect()`.

## This session: test-file sweep (197 left, down from 256)

Automated + manual sweep of the mechanical test errors, applying the Hard path patterns:

- **Bulk codemod** (`run`-callback threading + `make*Repository` single-arg): regex-expanded `run: (db, ...)` → 4-param `(db, _databaseFile, _client, _exec)`; `makeXRepository(appDb)` → `makeXRepository(appDb, client)`; `FileSystem.makeNoop()` → `makeNoop({})` (v4 requires a partial arg). Then an iterative fixpoint loop swapped `_client`/`_exec` prefixing by `TS2304`/`TS6133` per file.
- Fixed per file: `file-mapping-support_test.ts` (db→`exec` + `prepare().effect()` seeds), `route-auth_test.ts` (`AuthSessionServiceShape` return type), `media-metadata-refresh-job_test.ts` (`_exec`→`exec`, `_tag "Left"`→`"Failure"` + `result.failure`), `system/repository_test.ts` (`upsertUnmappedFolderMatchRows(db, exec, …)` + `listUnmappedFolderMatchRows(db, exec)`), `download-presentation-repository_test.ts` (`loadDownloadPresentationContexts(db, exec, …)`), `stats-repository_test.ts` (8× `_client` prefix fix).
- **Non-test fallout**: stripping repo embedded provides surfaced `main.ts` + lifecycle `R` leaks (see Break 1 section above).

## `main.ts` runtime wiring: the `SqliteClient` / `Client.SqlClient` R-leak odyssey

`NodeRuntime.runMain(runApiProgram)` fails with `R = … | SqliteClient` (or `Client.SqlClient`). Long bisect; root findings (important for EFFECT_GUIDE):

- **`Layer.build(appLayer)` inside a `Effect.gen` adds `appLayer`'s BUILD `R` (incl. `Scope | SqliteClient`) to the gen's `R`** — `Effect.scoped` only removes `Scope`, so `SqliteClient` leaks. It must be closed by the appLayer's own wiring, not by the surrounding effect.
- **`Effect.provide(appLayer)` at the _effect_ level closes everything** (verified via `runMain`-oracle on `yield* SqliteClient` / `SystemConfigService` / `bootstrapProgram` / `startBackgroundWorkers`). But **`Layer.provide(bigLayer)` at the _layer_ level does NOT reliably remove `Client.SqlClient` from `serve()`-converted route requirements** — a TS conditional-type recursion/union-limit false positive: the same leftover that effect-level `provide` removes cleanly survives layer-level `provide` on the giant (95-member) union.
- Current working main.ts shape (validated by `runMain` oracle): `Effect.gen` → `Effect.scoped(Effect.gen { bootstrapProgram().pipe(provide(appLayer)); startBackgroundWorkers().pipe(provide(appLayer)); serverLayer = mergeAll(serve(createHttpApp()), effectDiscard(logListening)).pipe(provide(node)); yield* Layer.launch(serverLayer).pipe(provide(appLayer)) })` — i.e. provide at the **effect** level (`Effect.provide` on each effect), NOT `Layer.provide` on the merged server layer. The `bootstrapProgram` effect returns `AppConfig` whose `.port` feeds `NodeHttpServer.layer` (so bootstrap must run before the server layer value is built).
- Residual: `main.ts` still errors because the launch path's leftover `Client.SqlClient` isn't removed by the current form — move the `provide(appLayer)` to wrap `Layer.launch(...)` directly (validated pattern) and drop the layer-level provides.
- `main_test.ts(4536)` had the same `Layer<…, SqliteClient | SystemConfigService>` leak — fixed by the Break 1 lifecycle reorder (SystemConfigService/RuntimeConfigSnapshot built before clients).

## Key v4 facts confirmed from source (for EFFECT_GUIDE rewrite)

- `Context.Service<Self, Shape>()("key")` class-style; `.of`/`.use`/`.useSync`/`.context` on the tag; no auto-`.Default` layer — build exported `layer` explicitly with `Layer.effect|sync|succeed` (no embedded prod provides — see Hard path)
- `Layer.effect` supplies/excludes Scope (replaces scoped/scopedDiscard/scopedContext)
- `Result` replaces `Either`; tags `Failure/Success`; `Result.isFailure/isSuccess`; `Effect.result` replaces `Effect.either`
- `Cause<E> = { reasons: Reason<E>[] }`; `Reason = Fail | Die | Interrupt`; `Cause.combine` replaces sequential/parallel
- Schema: variadics → array APIs (`Literals/Union/Tuple`), filters via `Schema.check(Schema.isX())`, `Schema.optionalKey` for absent keys, `Schema.mutable(Schema.Array(...))` for arrays only; struct mutability via `.mapFields(Struct.map(Schema.mutableKey))`; `Schema.fromJsonString` replaces `parseJson`; decode family: `decodeUnknownResult/Effect/Sync`; `decodeTo` replaces `compose`; `RedactedFromValue` replaces `Redacted(S)`; `Brand.make`/`Brand.result` replace `refined`/`error`/`either`
- `Schema.TaggedError` still class-based; `Schema.Defect()` is a function now
- `it.effect` in v4 `@effect/vitest` supplies `Scope` (no `it.scoped`); `TestClock` from `effect/testing/TestClock`; test layers via `Effect.provide(testLayer)`, fakes via `TestService`+`testLayer`
- `HttpRouter.add` accepts bare responses, Effects, or request handlers; `addAll(routes, { prefix })` prefixes natively; `serve(appLayer)` builds the handler (internally `provideMerge(appLayer)` + logger middleware + `RouterLayer`); route requirements surface as `Request.From` markers; `toHttpEffect(appLayer)` returns the handler effect
- `Layer.mergeAll` builds children **concurrently** — don't put ordered startup steps in a `mergeAll` (bootstrap must run before server bind)
- `NodeHttpServer.layer(fn, {port})` outputs `HttpServer | NodeServices | HttpPlatform | Etag.Generator`, `E = ServeError`
- Runtime keep-alive built into core; `NodeRuntime.runMain` still recommended (signals, exit codes); `runMain(effect)` requires `R = never` exactly
- `Effect.R` is **covariant** — an `Effect<A, E, R>` is assignable to `Effect<A, E, never>` **only** when `R = never`; so a `never`-targeted assignment is a valid oracle to prove `R` absence (unlike `Either`, no contravariance trick)

## EFFECT_GUIDE.md rewrite checklist (stale sections)

- Services And Layers: `Effect.Service` gone → `Context.Service` + exported `layer`, no embedded provides, `make*` constructors exported for tests
- Data Modeling: `Schema.Class` default → `Struct` + interface (Hard path Break 3)
- Branded Types: `Brand.refined/error` gone → `Brand.make`/`result`
- Config: `Schema.Config(key, S)` order → `Config.schema(S, key)`; `Config.boolean`
- Testing: `it.scoped` dead → `it.effect` + `Effect.provide(testLayer)` + skill fakes
- Router/HTTP: v3 builder → collector layers, `serve`, bare-response handlers, cookie Effects
- Resources: `Layer.scoped` → `Layer.effect`; `Effect.async` → `Effect.callback`; `Cache` fn form; `Semaphore` module
- Branching: `Either` → `Result`; `catchAll` → `catch`; `isDie/isInterruptedOnly` → `hasDies/hasInterruptsOnly`

## Verification

- [x] `pnpm --filter @bakarr/api check` (tsc) — clean
- [x] `pnpm --filter @bakarr/shared check` — clean
- [x] `pnpm --filter @bakarr/web check` — clean
- [x] `pnpm --filter @bakarr/api test` — 1074 passed (162 files)
- [x] `pnpm lint` (oxlint) — exit 0 (pre-existing warnings only)
- [ ] Manual: `pnpm dev` boot, migrate, login, streaming

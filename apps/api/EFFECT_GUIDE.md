# Bakarr API Effect Principles

Keep `apps/api` aligned with Effect v4 (`effect@4.0.0-rc.112`) idioms as used in
`/home/yunyun/Dev/effect` source, examples, and tests.

This repo is pre-release alpha, so prefer current Effect patterns over
compatibility layers.

## Reference Order

- Check `/home/yunyun/Dev/effect` source, examples, and tests for the pattern
  most often used in practice.
- Use the upstream code-style docs as the tie-breaker for style questions such
  as generators, pipelines, dual APIs, pattern matching, and branded types.
- If docs and code diverge, prefer repo code for API shape and wiring, and docs
  for style.

## Defaults

- Prefer clarity over cleverness.
- Prefer fewer abstractions with stronger types.
- Prefer one obvious pattern per problem.
- Keep boundary code explicit and domain code boring.
- Keep dependencies, errors, and lifecycle visible in types.

## Runtime Entry Points

- Use `NodeRuntime.runMain(...)` as the single executable entry point for
  long-running applications and servers.
- `runMain` installs signal handling and interrupts all fibers on exit, so
  `Effect.addFinalizer(...)` and other teardown placed in the main effect runs
  on CTRL+C. `runMain(effect)` requires `R = never` exactly.
- Provide at the **effect** level: `Effect.provide(appLayer)` on each launched
  effect closes all requirements. `Layer.provide(...)` on the layer side does
  not reliably discharge route-converted requirements.
- `Layer.build(...)` inside a gen adds the layer's build `R` to the gen —
  `Effect.scoped` removes only `Scope`.
- Put teardown in scoped effects or layers (`Layer.effect` already scopes) or
  `Layer.launch(...)`.
- Avoid `Effect.runPromise(...)` and `Effect.runSync(...)` in normal app wiring;
  keep them for scripts, tests, or very small adapter edges.

## Module Shape

- Keep one module focused on one boundary or one domain concept.
- Keep schemas, tagged errors, and service contracts near the code that owns
  them.
- Export small, named constructors and helpers instead of giant utility files.
- Let application entrypoints assemble layers; let domain modules stay unaware
  of concrete runtimes.
- Prefer explicit module names such as `UserRepo`, `BillingConfig`,
  `StripeClient`, and `NotificationService`.

## Core Style

- Default to `Effect.gen(function*() { ... })` with `yield*` for effectful
  workflows.
- Use `Effect.Do` only when local binding reads better than a generator.
- Use `.pipe(...)` for cross-cutting composition such as providing layers,
  retries, timeouts, spans, logging, and small local transforms.
- Use `Effect.fn("Name")` for exported reusable effectful operations and service
  methods, including nullary thunks. Leave generator bodies un-annotated; the
  generator return is the success value, not an `Effect.Effect<...>` (see
  Lint-Guided Typing).
- Use `Effect.fnUntraced(...)` only when tracing should be skipped or when a
  pipeline needs access to the original arguments.
- Prefer explicit sequential code over clever combinator chains in business
  logic.
- Prefer data-last forms inside pipelines and data-first forms for one-off local
  calls.
- Use plain `if` or `switch` for simple branching; use `Match` when
  exhaustiveness or richer pattern matching improves clarity.
- Avoid tacit (point-free) calls: write `Effect.map((x) => fn(x))`, never
  `Effect.map(fn)`, and avoid `flow(...)` from `effect/Function`. Tacit calls
  can erase generics on overloaded functions, weaken type inference, and blur
  stack traces.
- `Effect.yieldNow` is a value, not a function: `yield* Effect.yieldNow`.

## Dual APIs And Pipelines

- If a shared helper is used both standalone and inside `.pipe(...)`, exposing a
  dual API is idiomatic.
- Do not force dual APIs for app-local functions that are only called one way.
- Within a block, pick the style that keeps local flow easiest to read.
- When inference gets awkward, choose the more explicit form.
- Do not mix styles randomly inside one function.

## Services And Layers

- Use `Context.Service<Self, Shape>()("key")` as the default service contract:
  a class carrying the tag plus `Service.of(...)` for typed construction.
- Service modules export `static readonly layer = Layer.effect(Tag, make())`
  where `make()` yields **direct dependencies only** — never
  `.pipe(Layer.provide(...))` inside the static layer. Graph assembly lives in
  `app/lifecycle-layers.ts`; tests provide stubs for the same direct yields.
- Export the `make*Service` constructor when tests need to build the service
  without production dependency layers.
- Use `Context.GenericTag(...)` only for simple local tags where a class adds no
  value.
- Keep service members `readonly`.
- Keep service APIs small and usually `R = never`; satisfy dependencies while
  building the layer, not in every method signature.
- Start from leaf service contracts, then build higher-level orchestration
  services against those contracts.
- Name canonical layers clearly: `Live`, `Test`, `layer`, `testLayer`, and
  similar. `Effect.Service` and auto-`.Default` are gone — build layers
  explicitly with `Layer.effect`, `Layer.succeed`, `Layer.sync`.
- Compose with `Layer.effect(...)`, `Layer.succeed(...)`, `Layer.sync(...)`,
  `Layer.effectDiscard(...)`, `Layer.unwrap(...)`, and `Layer.provide(...)`.
  `Layer.effect` supplies/excludes `Scope` (replaces `scoped`/`scopedDiscard`/
  `scopedContext`).
- **Chain stages with `Layer.provideMerge(...)`**: `stage = next.pipe(
Layer.provideMerge(prev))`. Never hand the same layer object to both
  `mergeAll` and `Layer.provide` — v4 memoization then builds the whole
  sub-graph twice (measured 2.3GB at build) and hangs on repeated runtime
  builds. `provideMerge` keeps the previous context in the output, so routes
  still see every service.
- `Layer.mergeAll` builds children **concurrently** — don't put ordered startup
  steps in a `mergeAll` (bootstrap must run before server bind).
- If a parameterized or resourceful layer is reused, create it once and reuse
  the constant so memoization works.
- Prefer a single `AppLayer` at the boundary over scattered
  `Effect.provide(...)` calls through orchestration code.

## Resources And Concurrency

- Model lifecycles with `Effect.acquireRelease(...)`, `Scope`, and
  `Layer.effect(...)` (scoped by default).
- Use `Fiber`, `Queue`, `PubSub`, `Semaphore.make`, and `Ref` only when they
  make the coordination model simpler. `Effect.makeSemaphore` is gone — use the
  `Semaphore` module (`Semaphore.make`, `Semaphore.Semaphore` as the type).
- `Effect.forkChild` for normal child fibers, `Effect.forkDetach` for daemons.
  Forked children are not eagerly scheduled — when a test or workflow depends on
  a child having reached a gate, `yield* Effect.yieldNow` before proceeding.
- Keep raw platform and Promise APIs at the edge.
- Wrap long-lived infrastructure behind services so cancellation and shutdown
  stay uniform.
- Prefer scoped constructors over manual start and stop bookkeeping.

## Data Modeling

- Default to `Schema.Struct({...})` plus a same-name `interface` for records;
  export `Schema.Schema.Type<typeof XSchema>` when useful.
- `Schema.Class` / `Schema.TaggedClass` are not default patterns — use them only
  when class identity or methods genuinely help.
- Closed tagged variants: `Schema.TaggedStruct(...)` /
  `Schema.TaggedUnion(...)` with `.cases`, `.guards`, `.match`.
- Internal-only state machines: `Data.TaggedEnum` + `Data.taggedEnum` with
  `$match`.
- Use `Schema.TaggedError` for failures that cross boundaries.
- Variadics are array APIs: `Schema.Literals([...])`, `Schema.Union([A, B])`,
  `Schema.Tuple([A, B])`.
- Filters via `Schema.check(Schema.isX())`:
  `Schema.check(Schema.isInt())`, `Schema.check(Schema.isBetween({...}))`,
  `Schema.check(Schema.isGreaterThan(0))`, `Schema.check(Schema.isMinLength(n))`.
- Optional keys: `Schema.optional(S)` tolerates absent key and `undefined`;
  `Schema.optionalKey(S)` requires the key to be absent. Wire JSON encodes
  absent optionals as `null`, so HTTP-facing optional fields are
  `Schema.optional(Schema.NullishOr(X))` with `| null` in the interface.
- Brand meaningful primitives, not only IDs: emails, URLs, slugs, ports,
  counts, percentages, timestamps, and similar values.
- Reuse the same schema across config, HTTP, persistence, queues, and tests.
- Decode and encode at boundaries: `Schema.decodeUnknownEffect(...)`,
  `Schema.decodeUnknownResult(...)`, `Schema.fromJsonString(...)`,
  `Schema.encodeEffect(...)`.
- Prefer schema-backed constructors over loose object literals once a type is
  part of the domain.

## Branded Types

- Use `Brand.nominal<T>()` for branded types that need no runtime validation
  (e.g. IDs) — it only adds a type tag at compile time.
- Use `Brand.make<T>((v) => filterOutput)` or `Brand.check<T>(...checks)` for
  validated brands. The constructor throws; `.result`, `.option`, `.is` give
  non-throwing validation (`Brand.result` returns `Result`).
- Combine independent brands with `Brand.all(...)`.
- Keep brands on meaningful domain values, not just IDs — emails, URLs, slugs,
  ports, counts, percentages, and timestamps are candidates.
- Construct branded values through the brand constructor, never by direct
  assignment, so the brand invariant is actually enforced.
- `Brand.refined` / `Brand.error` / `Brand.either` are gone.

## Pattern Matching

- Use `Match.value(...)` for matching a specific value, `Match.type<T>()` for
  matching by type.
- Use `Match.when(...)`, `Match.not(...)`, and `Match.tag(...)` to define
  patterns; `Match.tag` keys on the conventional `_tag` field of a
  discriminated union.
- Complete matches with `Match.exhaustive` when all cases are covered (the
  compiler errors on a gap), `Match.orElse` for a fallback, `Match.option` /
  `Match.result` to wrap the result, and `Match.withReturnType<T>()` (first in
  the pipeline) to enforce a consistent branch return type.
- Use `Match.valueTags(...)` for closed `_tag` unions when exhaustiveness helps
  (already the house style for route error mappers).

## Lint-Guided Typing

Three type-level rules are enforced by oxlint (see `.oxlintrc.json`,
`lint-plugin.js`) and are part of the house style:

- `bakarr/no-as-casts` bans all `as`, including `as const`.
- `oxc/no-async-await` bans the `async` keyword (not `await` expressions).
- `typescript/no-restricted-types` bans `unknown` and
  `Record<string, unknown>`.

Prefer real type-level fixes over disables. Disables are reserved for
genuinely necessary constructs and follow the repo convention
(`// oxlint-disable-next-line <rule> -- reason` or a file header).

Preferred replacements, in order:

1. **Return type annotations** instead of `as const` / `[] as Type[]`:
   ```ts
   function deriveAnimeSeason(date?: string): "winter" | "spring" | "summer" | "fall" | undefined;
   ```
2. **Callback tuple annotations** instead of `[k, v] as const` in
   `.map` / `Effect.map` / `Ref.modify` / `Array.from`:
   ```ts
   new Map(rows.map((row): [number, Row] => [row.id, row]));
   ```
3. **`satisfies`** instead of `as const satisfies` when the value flows into a
   contextually typed slot; annotate the const otherwise:
   ```ts
   const result: SomeUnion = { _tag: "x", ... }
   ```
4. **`Array<Type>()`** instead of `[] as Type[]` in generic `Effect.gen`
   returns.
5. **Typed intermediates** for union members returned from `Effect.fn`
   generators:
   ```ts
   const skipped: QueueResult = { _tag: "skipped" };
   return skipped;
   ```
6. **Bounded unions** where the domain allows, e.g. SQL bind params as
   `type SqlValue = string | number | null`, or index-signature interfaces
   instead of `Record<string, unknown>`:
   ```ts
   interface SqlRow {
     readonly [column: string]: string | number | null;
   }
   ```
7. **Effect Schema** for hand-rolled JSON/response validation — decode the
   whole payload instead of `const raw: Record<string, unknown> = await
response.json()`:
   ```ts
   const envelope = Schema.decodeUnknownSync(EnvelopeSchema)(await response.json());
   ```

### `unknown` at boundaries is honest

`unknown` stays correct where the value genuinely can be anything:
`Effect.tryPromise` catch callbacks (`error: unknown`, exactly as upstream
types them), `Cause.Cause<unknown>`, error `cause` fields,
`Logger.make<unknown, void>`, and `Effect.Effect<A, unknown>` interop. Those
sites carry a file-header disable with a reason (`apps/api/src/infra/logging.ts`,
`apps/api/src/db/database.ts`). Do not narrow them to a wrong type.

### `Effect.fn` generator returns take the success value, not an Effect

`Effect.fn` types generators as `(...args) => Generator<Eff, AEff, never>`
where `AEff` is the plain success value (see `fn.Gen` in the upstream
`Effect.ts`). Do not annotate the generator's return with
`Effect.Effect<...>` — it errors. Leave generators un-annotated and use typed
intermediates (fix #5). Upstream's own `fn.test.ts` only annotates the
non-generator form (`(): Effect.Effect<void> => ...`).

## Branching And Errors

- Prefer `Option` and `Result` (v4 `Result` replaces `Either`; tags are
  `Failure`/`Success`) over nullable return values or throwing for expected
  domain outcomes. `Effect.result` replaces `Effect.either`.
- Use typed errors only when callers can recover or branch meaningfully.
- `Data.TaggedError` still exists for internal domain failures, but the house
  default is `Schema.TaggedError` (boundary-ready and consistent).
- Preserve original external causes in a `cause` field; use `Schema.Defect()`
  (a function now) inside schema-backed errors when the defect itself must
  cross a boundary.
- Recover specifically with `Effect.catchTag(...)` / `Effect.catch(...)`
  (v4 `catch` replaces `catchAll`), `Effect.catchCause(...)` for causes.
- When debugging or translating failures, preserve full causes with
  `Effect.sandbox(...)`, `Effect.tapErrorCause(...)`, or `Cause` utilities
  instead of flattening them too early. Cause inspection:
  `Cause.findErrorOption`, `Cause.findDefect`, `Cause.hasDies`,
  `Cause.hasInterruptsOnly`, `Cause.combine`.
- Use `Match.valueTags(...)` for closed `_tag` unions when exhaustiveness helps.
- Avoid broad recovery that hides domain intent.
- Treat bugs, invariant violations, and unrecoverable startup failures as
  defects (`Effect.die(new Error(...))` — `dieMessage` is gone).
- Use `Effect.orDie` only at hard boundaries where recovery is not possible.

## Config

- Model config declaratively with `Config.schema(S, key)` (arg order: schema
  first) or `Config.all(...)`. `Schema.Config(...)` is gone.
- Use `Config.boolean("KEY")` for env flags; `Config.Port(...)`,
  `Config.Redacted(...)`, `Config.Literals([...])` for common shapes.
- Expose config through a service or layer instead of reading environment values
  inside business logic.
- Use `Config.redacted(...)`, `Schema.RedactedFromValue(S)`, or `Redacted.make`
  for secrets. `Schema.Redacted(S)` is gone.
- Unwrap secrets only at the edge that truly needs the plain value.
- Install providers with `ConfigProvider.layer(...)` /
  `ConfigProvider.layerAdd(...)`. `ConfigProvider.fromDotEnv` is an effect that
  **fails when the file is missing** — catch and fall back at the wiring site.
- In tests, provide config with layers or config providers rather than relying
  on ambient process state unless config-provider behavior itself is under test.
- Keep config keys and defaults close to the service that consumes them.

## HTTP, Persistence, And External Clients

- Wrap third-party clients behind services.
- Apply base URLs, auth, retries, tracing, middleware, and transforms once in
  the layer.
- Decode request and response bodies with schemas at the boundary.
- Do not let raw SDK errors, database driver errors, or HTTP response shapes
  leak into domain orchestration.
- Use `Effect.tryPromise(...)` or `Effect.promise(...)` only at interop
  boundaries. Drizzle query builders are not thenable — never wrap a bare
  builder in `tryPromise`; execute with `.prepare().effect()` (see
  `src/infra/effect/db.ts`).
- Retries: `Schedule.recurs(...)`, `Schedule.spaced(...)`, `Schedule.addDelay`
  (data-last, effectful delay fn). Gate retryability in the loop/decision, not
  only in a log tap — a non-retryable failure must not schedule the next delay
  (TestClock blocks forever otherwise).
- If a client exposes many Promise methods, prefer a service `use` pattern or a
  thin adapter service so interruption and error translation stay centralized.
- Keep unchecked JSON handling, raw `fetch`, and platform-specific calls out of
  core business logic.

## Observability

- Add spans at operation boundaries with stable names.
- Add span attributes for request ids, execution ids, user ids, and similar
  correlation fields.
- For hot reusable helpers, consider `captureStackTrace: false` on spans.
- Log inside effects and prefer structured values over string-only logs.
  v4 loggers are synchronous (`Logger.make` takes a sync fn).
- `Metric.Metric` takes 2 params (`<Input, State>`); histograms take plain
  boundary arrays: `Metric.histogram(name, { boundaries, description })`;
  `Metric.withAttributes(m, {...})` replaces `Metric.tagged` chains.
- Redact sensitive values before logging.
- Use tracing and logging as boundary concerns; do not bury them deep inside
  pure domain calculations.

## Testing

- Prefer `@effect/vitest` and `it.effect(...)` for Effect-native tests.
  `it.effect` supplies `Scope` — `it.scoped` is gone. Use `it.live(...)` only
  when test services are the wrong abstraction.
- `it.effect` requires **exactly** `Effect<A, E, Scope>`: app-service
  requirements must be discharged by the test layer.
- Build service test instances from exported `make*Service()` constructors plus
  stub layers — never `X.layer.pipe(Layer.provide(stubs))`, which embeds
  production dependency layers and leaks their transitive `R`.
- Test databases: `withSqliteTestDbEffect` provides temp sqlite + migrations +
  `DbExecutor` as a layer; bodies `yield* Repo.Service` after `Effect.provide`.
- Provide fresh inline test layers for isolation unless sharing an expensive
  fixture is intentional.
- Use `TestClock` (`effect/testing/TestClock`), `layer(...)`, and test services
  instead of manual runtime setup. `TestClock.adjust(...)` for delays; retries
  that will not fire must not schedule a delay.
- Forked children are not eagerly scheduled: `yield* Effect.yieldNow` before
  asserting a follower reached its gate.
- In `apps/api`, follow repo test style: import `{ assert, describe, it }` from
  `@effect/vitest` and avoid `expect` in Effect-heavy tests.
- Test service orchestration through layers, not through hidden globals.
- Prefer test layers that return typed domain data, not partially mocked SDKs.

## Incremental Adoption

- Start Effect adoption at boundaries: new features, API integrations,
  persistence adapters, background jobs, and error-prone flows.
- Do not start with stable hot paths unless there is clear value.
- Start with plain functions when DI and lifecycle are not needed.
- Promote code into services once dependency injection, shared resources,
  orchestration, or testing pressure justifies it.
- Wrap existing Promise code at the boundary first; move inward only when the
  domain benefits from typed errors, structured concurrency, or testability.

## Review Checklist

- Main workflows use `Effect.gen(...)` unless another form is clearly better.
- Exported reusable effects and service methods use `Effect.fn(...)` when the
  name adds value to traces and call sites.
- No tacit/point-free calls (`Effect.map(fn)`, `flow(...)`); callbacks are
  written explicitly.
- Boundary data is schema-validated; no unchecked JSON or env parsing leaks in.
- Recoverable failures are typed; unrecoverable failures stay defects.
- Services are `Context.Service` classes with exported `layer` and `make*`
  constructors; static layers carry no embedded provides.
- Lifecycle stages chain with `Layer.provideMerge`; no layer object is passed to
  both `mergeAll` and `Layer.provide`.
- Dependencies are introduced with tags and layers, then provided once near the
  entrypoint.
- Tests use `@effect/vitest` patterns (`it.effect`, no `it.scoped`) and
  explicit layers built from `make*Service()` + stubs.
- No `as` casts (`as const`, `as Type[]`, `as unknown`) — use return
  annotations, tuple-annotated callbacks, `satisfies`, or typed intermediates
  instead.
- No `async` keyword in app code; `Effect.tryPromise({ try: async ... })` and
  test callbacks are the recognized exceptions.
- No `unknown` or `Record<string, unknown>` in domain types; `unknown` is
  reserved for error/cause boundaries and carries a documented disable.
- `pnpm lint` reports zero warnings for `apps/api`.

## Avoid By Default

- Scattered `Effect.provide(...)` through orchestration code.
- Manual DI, singletons, or hidden globals instead of tags and layers.
- `Effect.Service` classes and `.Default` layers (v3 pattern).
- Static service layers with embedded `Layer.provide(...)` dependencies.
- `mergeAll(prev, next|provide(prev))` stage shapes.
- `Schema.Class` as the default record pattern.
- Throwing exceptions for expected control flow.
- Untyped DTOs or untyped error payloads at boundaries.
- Raw `JSON.parse(...)` or env reads in business logic.
- Clever point-free pipelines when direct sequential code is clearer.
- Advanced abstractions before there is a concrete need.
- `as` casts, `async` keywords, `unknown`, and `Record<string, unknown>`
  without a documented boundary reason.

## Copyable Patterns

### runMain Entry Point With Graceful Teardown

```ts
import { Effect, Schedule } from "effect";
import { NodeRuntime } from "@effect/platform-node";

const program = Effect.addFinalizer(() => Effect.logInfo("Application is about to exit!")).pipe(
  Effect.andThen(Effect.logInfo("Application started!")),
  Effect.andThen(
    Effect.repeat(Effect.logInfo("still alive..."), {
      schedule: Schedule.spaced("1 second"),
    }),
  ),
  Effect.scoped,
);

NodeRuntime.runMain(program);
```

Provide at the effect level; bootstrap before the server layer value is built:

```ts
const runApiProgram = Effect.gen(function* () {
  const appConfig = yield* bootstrapProgram().pipe(Effect.provide(appLayer));
  yield* startBackgroundWorkers().pipe(Effect.provide(appLayer));
  const serverLayer = Layer.mergeAll(
    HttpRouter.serve(createHttpApp()),
    Layer.effectDiscard(logServerListening(appConfig)),
  ).pipe(Layer.provide(NodeServices.layer));
  yield* Layer.launch(serverLayer).pipe(Effect.provide(appLayer));
});
```

### Service Tag And Layer

```ts
import { Context, Effect, Layer } from "effect";

export interface UsersShape {
  readonly findById: (id: UserId) => Effect.Effect<User, UserNotFoundError>;
}

export const makeUsers = Effect.fn("Users.make")(function* () {
  const client = yield* ExternalClient;
  return Users.of({
    findById: Effect.fn("Users.findById")(function* (id) {
      return yield* client.findUser(id);
    }),
  } satisfies UsersShape);
});

export class Users extends Context.Service<Users, UsersShape>()("@bakarr/Users") {
  static readonly layer = Layer.effect(Users, makeUsers());
}

// assembly (app/lifecycle-layers.ts) — never inside the service module:
const withUsers = Users.layer.pipe(Layer.provide(ExternalClient.layer));
```

### Schema Record And Derived Payload

```ts
import { Schema } from "effect";

export const UserSchema = Schema.Struct({
  id: UserIdSchema,
  email: EmailSchema,
  createdAt: Schema.String,
});
export interface User extends Schema.Schema.Type<typeof UserSchema> {}

export const CreateUserSchema = UserSchema.mapFields(Struct.omit("id", "createdAt"));
```

### Tagged Error

```ts
import { Schema } from "effect";

export class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
  "UserNotFoundError",
  {
    message: Schema.String;
    cause: Schema.optional(Schema.NullishOr(Schema.Defect()));
  },
) {}
```

### Config Service

```ts
import { Config, Context, Effect, Layer } from "effect";

const PortConfig = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
);

export class ApiConfig extends Context.Service<ApiConfig, ApiConfigShape>()("@bakarr/ApiConfig") {
  static readonly layer = Layer.effect(ApiConfig, makeApiConfig());
}

const makeApiConfig = Effect.fn("ApiConfig.make")(function* () {
  const port = yield* Config.schema(PortConfig, "PORT").pipe(Config.withDefault(8000));
  const databaseUrl = yield* Config.redacted("DATABASE_URL");
  return ApiConfig.of({ port, databaseUrl });
});
```

### Promise Client Wrapper

```ts
import { Effect } from "effect";

const run = <A>(f: (signal: AbortSignal) => Promise<A>): Effect.Effect<A, ExternalError> =>
  Effect.tryPromise({
    try: (signal) => f(signal),
    catch: (cause) => new ExternalError({ cause }),
  });
```

### Discriminated Union Return From An Effect.fn Generator

Annotate a named union type, then return typed intermediates instead of
`as const`:

```ts
type QueueResult =
  | { readonly _tag: "queued"; readonly id: number }
  | { readonly _tag: "skipped" };

const queueDownload = Effect.fn("Operations.queueDownload")(function* (...) {
  // ...
  const skipped: QueueResult = { _tag: "skipped" };
  return skipped;
});
```

### Tuple Map Entry Without A Cast

```ts
const byId = new Map(rows.map((row): [number, Row] => [row.id, row]));
```

### Validated Brand

```ts
import { Brand } from "effect";

type Int = number & Brand.Brand<"Int">;
const Int = Brand.make<Int>((n) =>
  Number.isInteger(n) ? undefined : `Expected ${n} to be an integer`,
);
```

### Pattern Matching With `Match`

```ts
import { Match } from "effect";

type Event =
  | { readonly _tag: "fetch" }
  | { readonly _tag: "success"; readonly data: string }
  | { readonly _tag: "error"; readonly error: Error };

const describe = Match.type<Event>().pipe(
  Match.tag("fetch", () => "fetching"),
  Match.tag("success", (e) => `got ${e.data}`),
  Match.tag("error", (e) => `failed: ${e.error.message}`),
  Match.exhaustive,
);
```

### Effect Test With TestClock

```ts
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing/TestClock";
import { assert, describe, it } from "@effect/vitest";

describe("job", () => {
  it.effect("retries after delay", () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(runJob);
      yield* TestClock.adjust("1 second");
      const result = yield* Fiber.join(fiber);
      assert.strictEqual(result, "ok");
    }),
  );
});
```

### HTTP Route

```ts
import { Effect, Layer } from "effect";
import * as HttpRouter from "effect/unstable/http/HttpRouter";

const UserIdParams = Schema.Struct({ id: Schema.NumberFromString });

// Routes register on the shared ambient router; the app merges route layers.
export const usersRouter = Layer.mergeAll(
  HttpRouter.add(
    "GET",
    "/users/:id",
    Effect.gen(function* () {
      const { id } = yield* HttpRouter.schemaPathParams(UserIdParams);
      const users = yield* UsersService;
      return yield* users.findUser(id);
    }),
  ),
);
```

## Representative Effect Repo References

- Runtime boundary: `packages/sql-clickhouse/examples/basic.ts`
- Node.js HTTP client service: `packages/platform-node/examples/http-client.ts`
- Service ergonomics: `packages/effect/test/Context/service.test.ts`
- `Effect.fn` behavior: `packages/effect/test/Effect/fn.test.ts`
- Config providers: `packages/platform-node/test/PlatformConfigProvider.test.ts`
- Schema records and tagged classes: `packages/platform-node/test/HttpApi.test.ts`
- Test helpers and `TestClock`: `packages/vitest/test/index.test.ts`
- Span naming and attributes: `packages/workflow/src/Workflow.ts`

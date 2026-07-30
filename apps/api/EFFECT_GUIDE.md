# Bakarr API Effect Principles

Keep `apps/api` aligned with the local `effect-ts` skill, the upstream
code-style docs, and the idioms used in `/home/yunyun/Dev/effect` source, examples, and
tests.

This repo is pre-release alpha, so prefer current Effect patterns over
compatibility layers.

## Reference Order

- Start with the local `effect-ts` skill and its bundled references.
- Check `~/effect` source, examples, and tests for the pattern most often
  used in practice.
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

- Use platform `runMain` only at executable boundaries.
- In `apps/api`, prefer `NodeRuntime.runMain(...)`.
- Build one main effect or launched layer, then provide the full app layer once
  near the entrypoint.
- Put teardown in scoped effects or layers with `Effect.acquireRelease(...)`,
  `Layer.effect(...)`, or `Layer.launch(...)`.
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
  methods, including nullary thunks.
- Use `Effect.fnUntraced(...)` only when tracing should be skipped or when a
  pipeline needs access to the original arguments.
- Prefer explicit sequential code over clever combinator chains in business
  logic.
- Prefer data-last forms inside pipelines and data-first forms for one-off local
  calls.
- Use plain `if` or `switch` for simple branching; use `Match` when
  exhaustiveness or richer pattern matching improves clarity.

## Dual APIs And Pipelines

- If a shared helper is used both standalone and inside `.pipe(...)`, exposing a
  dual API is idiomatic.
- Do not force dual APIs for app-local functions that are only called one way.
- Within a block, pick the style that keeps local flow easiest to read.
- When inference gets awkward, choose the more explicit form.
- Do not mix styles randomly inside one function.

## Services And Layers

- Prefer `Context.Service<Self>()` as the default for service contracts —
  bundles Tag, Layer, and optional accessors in one declaration.
  Use the `{ make: Effect }` option to include a factory and auto-generated
  `layerWithoutDependencies`.
- Use `Context.Service<Self, Shape>()(key)` (no `make`) only when you need a
  standalone contract with no bundled factory or multiple different layer
  implementations for the same tag.
- Define the service interface inline in the `Context.Service` declaration.
  Do not retain a standalone `FooShape` or `FooServiceShape` interface/type
  unless the interface is genuinely reusable across modules.
- Use `Foo.of({ ... })` on the tag for object-literal service construction in
  tests and simple stubs.
- Production `make` must acquire deps via `yield* Foo` (the tag), not accept
  `Foo["Service"]` as a constructor param. Test harnesses are excepted.
- Use `Context.Reference(key, { defaultValue })` for simple local service keys
  with a default value where a class adds no value.
- Keep service members `readonly`.
- Keep service APIs small and usually `R = never`; satisfy dependencies while
  building the layer, not in every method signature.
- Start from leaf service contracts, then build higher-level orchestration
  services against those contracts.
- Name canonical layers clearly: `Live`, `Default`, `Test`, `layer`,
  `testLayer`, and similar.
- Compose with `Layer.effect(...)`, `Layer.succeed(...)`, `Layer.sync(...)`,
  `Layer.effectDiscard(...)`, `Layer.unwrap(...)`, `Layer.provide(...)`,
  and `Layer.provideMerge(...)`.

  `Layer.effect` handles both plain and scoped acquisition in v4 (replaces
  the old `Layer.scoped`). `Layer.effectDiscard` is for side-effect-only
  layers that own no service output (background work, resource lifecycle).
- If a parameterized or resourceful layer is reused, create it once and reuse
  the constant so memoization works.
- Prefer a single `AppLayer` at the boundary over scattered
  `Effect.provide(...)` calls through orchestration code.

## Resources And Concurrency

- Model lifecycles with `Effect.acquireRelease(...)`, `Scope`, and
  `Layer.effect(...)`.
- Use `Effect.acquireUseRelease(...)` for request-scoped resources (acquire,
  use, release in one call).
- Use `Effect.forkScoped` for background worker fibers so they die when the
  layer scope closes. Pair with `Effect.addFinalizer` for teardown (flush,
  stop, etc.).
- Use `Scope.make("sequential")` + `Effect.addFinalizer(() => Scope.close(scope, Exit.void))`
  for grouped sub-scope management when a service owns a cluster of fibers
  that must die together but separate from the outer scope.
- Use `Fiber`, `Queue`, `PubSub`, `Semaphore`, and `Ref` only when they make the
  coordination model simpler.
- Keep raw platform and Promise APIs at the edge.
- Wrap long-lived infrastructure behind services so cancellation and shutdown
  stay uniform.
- Prefer scoped constructors over manual start and stop bookkeeping.
- Do not create per-feature managed runtimes or Atom runtimes to smuggle the
  same owned resource into multiple consumers. Compose the resource once in
  an application-owned layer.

## Data Modeling

- Use `Schema.Class` for named domain records and entities.
- Use `Schema.TaggedClass` plus `Schema.Union` for closed success variants.
- Use `Schema.TaggedErrorClass` for failures that cross boundaries.
- Use `Schema.Struct` for small local payloads or derived shapes.
- Derive related payload schemas from canonical ones when possible instead of
  duplicating fields.
- Brand meaningful primitives, not only IDs: emails, URLs, slugs, ports,
  counts, percentages, timestamps, and similar values.
- Reuse the same schema across config, HTTP, persistence, queues, and tests.
- Decode and encode at boundaries with `Schema.decodeUnknown`,
  `Schema.parseJson`, and `Schema.encode`.
- Prefer schema-backed constructors over loose object literals once a type is
  part of the domain.

## Branching And Errors

- Prefer `Option` and `Result` over nullable return values or throwing for
  expected domain outcomes.
- Use typed errors only when callers can recover or branch meaningfully.
- Prefer `Data.TaggedError` for internal domain failures that do not need schema
  transport.
- Prefer `Schema.TaggedErrorClass` for errors that cross boundaries, appear
  in APIs, or need encoding, decoding, or annotations.
- Preserve original external causes in a `cause` field; use `Schema.Defect()`
  inside schema-backed errors when the defect itself must cross a boundary.
- Recover specifically with `Effect.catchTag(...)` or `Effect.catchTags(...)`.
- When debugging or translating failures, preserve full causes with
  `Effect.sandbox(...)`, `Effect.tapCause(...)`, or `Cause` utilities
  instead of flattening them too early.
- Use `Match.valueTags(...)` for closed `_tag` unions when exhaustiveness helps.
- Avoid broad recovery that hides domain intent.
- Treat bugs, invariant violations, and unrecoverable startup failures as
  defects.
- Use `Effect.orDie` only at hard boundaries where recovery is not possible.

## Config

- Model config declaratively with `Config.schema(...)` or `Config.all(...)`.
- Prefer `Config.schema(schema, "KEY")` when validation can be expressed as a
  schema.
- Expose config through a service or layer instead of reading environment values
  inside business logic.
- Use `Config.redacted(...)`, `Schema.Redacted(...)`, or `Redacted.make(...)`
  for secrets.
- Unwrap secrets only at the edge that truly needs the plain value.
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
  boundaries.
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
- Redact sensitive values before logging.
- Use tracing and logging as boundary concerns; do not bury them deep inside
  pure domain calculations.

## Testing

- Prefer `@effect/vitest` and `it.effect(...)` for Effect-native tests.
- Use `it.scoped(...)` for scoped resources and `it.live(...)` only when test
  services are the wrong abstraction.
- Provide fresh inline test layers for isolation unless sharing an expensive
  fixture is intentional.
- Use `TestClock`, `layer(...)`, and test services instead of manual runtime
  setup.
- Use `it.effect.prop(...)` or related helpers when property tests express the
  invariant better than example-based tests.
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

## Layer Composition (v4)

In v4, `Layer.provide` shares a `MemoMap` across calls within the same build,
so duplicate `Layer.provide(baseRuntime)` calls do NOT rebuild `baseRuntime`
multiple times. However, each `fromBuild` (which backs `Layer.effect`,
`Layer.mergeAll`, `Layer.provide`, `Layer.succeed`) still forks a scope via
`Scope.forkUnsafe(scope)`. On success the scope stays open for the app
lifetime. With hundreds of layers and provides, this creates many long-lived
scope objects.

### Preferred composition: `Layer.provideMerge` anchor chain

Chain services on a shared base layer using `Layer.provideMerge`. This
provides the dependency AND merges its outputs into the result, keeping all
services available downstream:

```ts
// Good — anchor chain, each provideMerge builds once against shared context
const AppLayer = BaseRuntime.pipe(
  Layer.provideMerge(ServiceALive),
  Layer.provideMerge(ServiceBLive),
  Layer.provideMerge(ServiceCLive),
);
```

### Avoid: `Layer.provide` per-service in a `Layer.mergeAll`

```ts
// Bad — N provide calls, each forks a scope; mergeAll requires R=never
const a = ServiceALive.pipe(Layer.provide(baseRuntime));
const b = ServiceBLive.pipe(Layer.provide(baseRuntime));
return Layer.mergeAll(a, b, c); // a, b, c must have R=never
```

### `Layer.mergeAll` constraints

- Requires each input layer to have `R = never` (all dependencies satisfied
  upstream).
- Keeps merges small (3-9 entries). A flat ~200-argument call can exceed tsc's
  variadic inference and silently drop tail layers.
- Use `Layer.unwrap(Effect.gen(...))` for config-dependent layer assembly.

### `Layer.provide` vs `Layer.provideMerge`

- `Layer.provide`: feeds a dependency; the dependency's outputs do NOT bubble
  up into the result.
- `Layer.provideMerge`: feeds a dependency AND merges its outputs into the
  result. Use when downstream layers need the dependency's services.
- `Layer.provideSome`: not used in practice.

### Test layer pattern

```ts
const TestLayer = Layer.empty.pipe(
  Layer.provideMerge(ServiceA.layer),
  Layer.provideMerge(NodeServices.layer),
);
```

### Background workers

- Use `Effect.forkScoped` so worker fibers die when the layer scope closes.
- Pair with `Effect.addFinalizer` for teardown (flush, stop, etc.).
- Use `Effect.acquireRelease` for owned resources (PubSub, Queue, etc.).

### Policy: no per-feature managed runtimes

Compose shared resources once in an application-owned layer. Do not create
per-feature managed runtimes to smuggle the same owned resource into multiple
consumers.

## Review Checklist

- Main workflows use `Effect.gen(...)` unless another form is clearly better.
- Exported reusable effects and service methods use `Effect.fn(...)` when the
  name adds value to traces and call sites.
- Boundary data is schema-validated; no unchecked JSON or env parsing leaks in.
- Recoverable failures are typed; unrecoverable failures stay defects.
- Dependencies are introduced with tags and layers, then provided once near the
  entrypoint.
- Tests use `@effect/vitest` patterns and explicit layers.

## Avoid By Default

- Scattered `Effect.provide(...)` through orchestration code.
- `Layer.provide(baseRuntime)` called per-service in a `Layer.mergeAll` — use
  `Layer.provideMerge` anchor chains instead.
- Manual DI, singletons, or hidden globals instead of tags and layers.
- Throwing exceptions for expected control flow.
- Untyped DTOs or untyped error payloads at boundaries.
- Raw `JSON.parse(...)` or env reads in business logic.
- Clever point-free pipelines when direct sequential code is clearer.
- Advanced abstractions before there is a concrete need.
- Per-feature managed runtimes or per-feature `Effect.runPromise` in domain
  code.

## Copyable Patterns

### Service Tag And Layer

With bundled `make` (factory + auto-generated `layerWithoutDependencies`):

```ts
import { Context, Effect, Layer } from "effect";

class Users extends Context.Service<Users>()(
  "@bakarr/Users",
  {
    make: Effect.gen(function* () {
      const client = yield* ExternalClient;
      return {
        findById: Effect.fn("Users.findById")(function* (id: UserId) {
          return yield* client.findUser(id);
        }),
      };
    }),
  },
) {
  static readonly Default = Layer.effect(Users, Users.make).pipe(
    Layer.provide([ExternalClient.Default]),
  );
}
```

With inline shape (standalone contract, separate layer):

```ts
class AuthService extends Context.Service<AuthService, {
  readonly login: (user: string, pass: string) => Effect.Effect<Session, AuthError>;
  readonly logout: (token: string) => Effect.Effect<void>;
}>()("@bakarr/AuthService") {}

export const layer = Layer.effect(AuthService, Effect.gen(function* () { ... }));
```

Object-literal construction via `Foo.of(...)` (tests, stubs):

```ts
const stub = Layer.succeed(AuthService, AuthService.of({
  login: () => Effect.die("not implemented"),
  logout: () => Effect.void,
}));
```

### Schema Record And Derived Payload

```ts
import { Schema, Struct } from "effect";

class User extends Schema.Class<User>("User")({
  id: UserId,
  email: Email,
  createdAt: Schema.DateTimeUtc,
}) {}

const CreateUser = Schema.Struct(User.fields).pipe(Struct.omit(["id", "createdAt"]));
```

### Tagged Error Split

```ts
import * as Data from "effect/Data";
import * as Schema from "effect/Schema";

class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly userId: UserId;
}> {}

class ApiDecodeError extends Schema.TaggedErrorClass<ApiDecodeError>()("ApiDecodeError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}
```

### Config Service

```ts
import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";

const Port = Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 65535));

class ApiConfig extends Context.Service<
  ApiConfig,
  {
    readonly port: number;
    readonly databaseUrl: Redacted.Redacted;
  }
>()("@bakarr/ApiConfig") {
  static readonly layer = Layer.effect(
    ApiConfig,
    Effect.gen(function* () {
      const port = yield* Config.schema(Port, "PORT");
      const databaseUrl = yield* Config.schema(Schema.Redacted(Schema.String), "DATABASE_URL");
      return { port, databaseUrl };
    }),
  );
}
```

### Config-Dependent Layer Assembly

```ts
import { Effect, Layer } from "effect";

// Layer.unwrap for config-dependent layer choice
const SqliteLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig;
    return config.readonly ? ReadonlySqlite.layer : ReadWriteSqlite.layer;
  }),
);

// Effect.fn with Layer.unwrap as second argument
const makeRuntimeSqliteLayer = Effect.fn("makeRuntimeSqliteLayer")(
  function* (config: SqliteConfig) {
    const runtime = process.versions.bun !== undefined ? "bun" : "node";
    const loader = defaultSqliteClientLoaders[runtime];
    return loader.layer(config);
  },
  Layer.unwrap,
);
```

### Feature Layer Composition

```ts
import { Layer } from "effect";

// Anchor chain — provideMerge each feature on the shared base
export const FeatureLayer = BaseRuntime.pipe(
  Layer.provideMerge(RepositoryLive),
  Layer.provideMerge(ServiceALive),
  Layer.provideMerge(ServiceBLive),
  Layer.provideMerge(ServiceCLive),
);

// Aggregator pattern — Layer.empty anchor for pure merge groups
export const AggregatedLayer = Layer.empty.pipe(
  Layer.provideMerge(SubFeatureALive),
  Layer.provideMerge(SubFeatureBLive),
  Layer.provideMerge(SubFeatureCLive),
);
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

### Effect Test With TestClock

```ts
import { Effect, Fiber, TestClock } from "effect";
import { assert, describe, it } from "@effect/vitest";

describe("job", () => {
  it.effect("retries after delay", () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.fork(runJob);
      yield* TestClock.adjust("1 second");
      const result = yield* Fiber.join(fiber);
      assert.strictEqual(result, "ok");
    }),
  );
});
```

## Representative Effect Repo References

- Layer composition and v4 idioms: `~/Dev/t3code/apps/server/src/server.ts`
- Runtime boundary: `packages/platform-node/src/NodeRuntime.ts`
- Node.js HTTP client: `packages/platform-node/test/NodeHttpClient.test.ts`
- Service and layer ergonomics: `packages/effect/test/Layer.test.ts`
- `Effect.fn` behavior: `packages/effect/test/Effect.test.ts`
- Config providers: `packages/effect/test/Config.test.ts`
- Schema classes and tagged errors: `packages/effect/test/Data.test.ts`
- HttpApi patterns: `packages/effect/test/unstable/httpapi/HttpApi.test.ts`
- Test helpers and `TestClock`: `packages/vitest/test/index.test.ts`
- Span naming and attributes: `packages/effect/src/unstable/workflow/Workflow.ts`

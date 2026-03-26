# Bakarr API Effect Principles

Keep `apps/api` aligned with both the local `effect-ts` skill and the upstream
Effect code-style docs:

- `https://github.com/Effect-TS/website/tree/main/content/src/content/docs/docs/code-style`

This repo is pre-release alpha, so prefer clean, current Effect patterns over
compatibility layers.

## Reference Sources

- Start with the local `effect-ts` skill and its bundled references.
- The Effect repository is cloned at `~/Dev/effect` for API and implementation
  lookup.
- Use the upstream code-style docs as the tie-breaker for style choices such as
  generators, dual APIs, pattern matching, and branded types.

## Runtime Entry Points

- Use the platform runtime `runMain` at executable boundaries.
- In `apps/api`, prefer `BunRuntime.runMain(...)` so interrupts shut down fibers
  and scoped resources cleanly.
- Put teardown and finalizers in the main scoped effect, not beside it.

## Core Style

- Prefer `Effect.gen(function* () { ... })` with `yield*` for primary control
  flow.
- Use `Effect.Do` only when local binding reads better than a generator.
- Use `Effect.fn("Name")` for exported effectful functions and service methods,
  including nullary thunks.
- Prefer explicit lambdas over tacit or point-free style: write
  `Effect.map((value) => f(value))`, not `Effect.map(f)`, when the explicit form
  is safer or clearer.
- Avoid `flow(...)` in core business logic unless it clearly improves
  readability without hiding types.
- Use `.pipe(...)` for retries, timeouts, spans, logging, and other
  cross-cutting composition.

## Dual APIs And Pipelines

- Prefer data-last forms inside `.pipe(...)` chains.
- Prefer data-first forms for one-off transformations when they are shorter and
  clearer.
- Do not mix styles arbitrarily inside the same block; optimize for local
  readability.
- When overloads or inference get tricky, choose the more explicit form.

## Services And Layers

- Define services with unique `Context.Tag("@scope/ServiceName")` identifiers.
- Keep service members `readonly`.
- Service methods should usually have `R = never`; satisfy dependencies in the
  layer, not in every method signature.
- Start from leaf service contracts, then compose higher-level orchestration.
- Implement with `Layer.effect`, `Layer.sync`, or `Layer.succeed`.
- Memoize parameterized layers by storing them in constants before reuse.
- Prefer `Effect.Service` only when the default implementation is obvious.
- Provide dependencies once at the application boundary rather than scattering
  `Effect.provide(...)` through business logic.

## Data Modeling

- Prefer `Schema.Class` for records.
- Prefer `Schema.TaggedClass` plus `Schema.Union` for variants.
- Brand meaningful primitives, not just IDs: emails, URLs, slugs, counts,
  timestamps, and similar domain values.
- Use `Brand.nominal` or `Brand.refined` when a branded type improves safety or
  validation clarity.
- Reuse the same schema across config, HTTP, persistence, and tests.
- Use `Schema.parseJson`, `Schema.decodeUnknown`, and `Schema.encode` at
  boundaries.

## Branching And Errors

- Prefer `Match` for complex branching and exhaustive handling.
- Use `Match.valueTags` for tagged-schema unions and `Match.type(...)` or
  `Match.value(...)` when matching richer conditions.
- Keep `_tag`-based unions exhaustive whenever the domain is closed.
- Model recoverable domain failures with `Schema.TaggedError`.
- Use typed errors only when callers can take meaningful action.
- Recover with `Effect.catchTag`, `Effect.catchTags`, or `Effect.catchAll` based
  on how specific recovery should be.
- Treat bugs and unrecoverable startup failures as defects.
- Use `Effect.orDie` only at boundaries where recovery is impossible.
- Wrap unknown external failures with `Schema.Defect`.

## Config

- Expose config as a service with a static `layer`.
- Prefer `Schema.Config("KEY", Schema)` when validation can be expressed as a
  schema.
- Use `Config.redacted(...)` or `Schema.Redacted(...)` for secrets.
- Unwrap secrets with `Redacted.value(...)` only at the edge.
- In tests, provide config directly with `Layer.succeed(...)`.

## Concurrency And Observability

- Use `Scope` for long-lived resources and explicit lifecycles.
- Use `Fiber`, `Queue`, `PubSub`, `Semaphore`, and `Ref` when they simplify
  coordination.
- Keep platform and stream conversion at the edge.
- Log inside effects rather than around raw promises.
- Use `Effect.withSpan("name")` for meaningful internal spans.

## Testing

- Prefer Effect-native tests with provided layers.
- Use fresh inline test layers for isolation.
- Use `TestClock` for deterministic time-based tests.

## Incremental Adoption

- Start Effect adoption at boundaries: new features, adapters, external APIs,
  and error-prone flows.
- Use `Effect.tryPromise(...)` or `Effect.promise(...)` for interop.
- Wrap third-party clients behind services so cancellation, retries, tracing,
  and error translation stay consistent.

## Avoid By Default

- Tacit `Effect.map(fn)` or point-free `flow(...)` in core business logic.
- Scattered `Effect.provide(...)` through orchestration code.
- Broad recovery that hides domain intent.
- Unchecked `JSON.parse(...)` or unvalidated boundary data.
- Raw platform calls inside domain orchestration.
- Advanced abstractions without a concrete problem.

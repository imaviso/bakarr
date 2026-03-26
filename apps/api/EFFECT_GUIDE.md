# Bakarr API Effect Principles

Keep `apps/api` aligned with the local `effect-ts` skill and its core
references.

## Local Effect Source

The Effect repository is cloned to `~/Dev/effect` for reference.
Use this to explore APIs, find usage examples, and understand implementation
details when the documentation isn't enough.

## Core Defaults

- Prefer `Effect.gen(function* () { ... })` with `yield*` for main control flow.
- Use `Effect.fn("Name")` for exported effectful functions and service methods,
  including nullary thunks.
- Use `.pipe(...)` for retry, timeout, logging, and spans.
- Model runtime boundaries with `Schema`, not ad hoc parsing.
- Provide dependencies once at the application boundary.

## Services And Layers

- Define services with unique `Context.Tag("@scope/ServiceName")` identifiers.
- Keep service members `readonly`.
- Service methods should usually have `R = never`; satisfy dependencies in the
  layer, not in every method signature.
- Start with leaf service contracts, then compose higher-level orchestration.
- Implement with `Layer.effect`, `Layer.sync`, or `Layer.succeed`.
- Memoize parameterized layers by storing them in constants before reuse.
- Prefer `Effect.Service` only when the default implementation is obvious.

## Data Modeling

- Prefer `Schema.Class` for records.
- Prefer `Schema.TaggedClass` plus `Schema.Union` for variants.
- Brand meaningful primitives, not just IDs.
- Reuse the same schema across config, HTTP, persistence, and tests.
- Use `Schema.parseJson`, `Schema.decodeUnknown`, and `Schema.encode` at
  boundaries.
- Use `Match.valueTags` for exhaustive tagged-union handling.

## Error Handling

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

- Scattered `Effect.provide(...)` through business logic.
- Broad recovery that hides domain intent.
- Unchecked `JSON.parse(...)` or unvalidated boundary data.
- Raw platform calls inside orchestration code.
- Advanced abstractions without a concrete problem.

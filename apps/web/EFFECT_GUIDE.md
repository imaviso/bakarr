# Bakarr Web Effect Principles

Keep `apps/web` aligned with the local `effect-ts` skill and the upstream
code-style docs, but treat Effect as a **boundary construction tool**, not a
runtime framework.

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
- Keep error types visible at call sites.
- React owns the runtime. Effect is for composing async boundaries.

## Effect as a Boundary Tool

- **No Effect runtime infrastructure.** No `Context.Tag`, `Layer`,
  `ManagedRuntime`, `Effect.runFork`, or `Fiber` in web code.
- Effect runs only inside `Effect.runPromise` or `Effect.runSync` calls at the
  adapter edge: TanStack Query `queryFn` / `mutationFn`, form validators, route
  guards, or small module-level helpers.
- Do not run Effect deep inside components, hooks, or render paths. Build the
  effect in a module, execute it at the boundary.
- Use `Effect.tryPromise` or `Effect.try` only at interop boundaries (fetch,
  clipboard, localStorage, etc.).
- Do not use `Effect.acquireRelease`, `Scope`, `Layer.scoped`, or resource
  lifecycle combinators. Browsers do not have the same long-lived resource model
  as servers.

## Module Shape

- Keep one module focused on one API domain or one boundary concern.
- Keep schemas and tagged errors near the code that owns them.
- Export small, named constructors and helpers instead of giant utility files.
- Prefer explicit module names such as `AnimeApi`, `SystemConfigApi`, and
  `AuthClient`.

## Core Style

- Default to `Effect.gen(function* () { ... })` with `yield*` for effectful
  workflows inside the HTTP client and other boundary adapters.
- Use `.pipe(...)` for cross-cutting composition such as retries, timeouts,
  logging, and small local transforms.
- Use `Effect.fn("Name")` for exported reusable effectful operations, including
  nullary thunks.
- Prefer explicit sequential code over clever combinator chains in business
  logic.
- Prefer data-last forms inside pipelines and data-first forms for one-off local
  calls.
- Use plain `if` or `switch` for simple branching; use `Match` when
  exhaustiveness or richer pattern matching improves clarity.

## Dual APIs and Pipelines

- If a shared helper is used both standalone and inside `.pipe(...)`, exposing a
  dual API is idiomatic.
- Do not force dual APIs for app-local functions that are only called one way.
- Within a block, pick the style that keeps local flow easiest to read.
- When inference gets awkward, choose the more explicit form.
- Do not mix styles randomly inside one function.

## Data Modeling

- Use `Schema.Class` for named domain records and entities.
- Use `Schema.TaggedClass` plus `Schema.Union` for closed success variants.
- Use `Schema.TaggedError` for failures that cross boundaries (HTTP, forms,
  router params).
- Use `Schema.Struct` for small local payloads or derived shapes.
- Derive related payload schemas from canonical ones when possible instead of
  duplicating fields.
- Brand meaningful primitives, not only IDs: episode numbers, slugs, counts,
  percentages, timestamps, and similar values.
- Reuse the same schema across HTTP, forms, router search params, and tests.
- Decode and encode at boundaries with `Schema.decodeUnknown`,
  `Schema.parseJson`, and `Schema.encode`.
- Prefer schema-backed constructors over loose object literals once a type is
  part of the domain.

## Branching and Errors

- Prefer `Option` and `Either` over nullable return values or throwing for
  expected domain outcomes.
- Use typed errors only when callers can recover or branch meaningfully.
- Prefer `Data.TaggedError` for internal domain failures that do not need schema
  transport.
- Prefer `Schema.TaggedError` for errors that cross HTTP boundaries, appear in
  APIs, or need encoding/decoding.
- Preserve original external causes in a `cause` field; use `Schema.Defect`
  inside schema-backed errors when the defect itself must cross a boundary.
- Recover specifically with `Effect.catchTag(...)` or `Effect.catchTags(...)`.
- When debugging or translating failures, preserve full causes with
  `Effect.sandbox(...)`, `Effect.tapErrorCause(...)`, or `Cause` utilities
  instead of flattening them too early.
- Use `Match.valueTags(...)` for closed `_tag` unions when exhaustiveness helps.
- Avoid broad recovery that hides domain intent.
- Treat bugs, invariant violations, and unrecoverable failures as defects.
- Use `Effect.orDie` only at hard boundaries where recovery is not possible.

## HTTP and Platform Interop

- The HTTP client returns `Effect.Effect<A, TaggedErrors>`. Decode request and
  response bodies with schemas at the boundary.
- Do not let raw `fetch` errors or HTTP response shapes leak into domain code.
- Use `Effect.tryPromise(...)` or `Effect.promise(...)` only at interop
  boundaries.
- Apply retries, timeouts, and auth transforms once in the client module, not in
  every call site.
- Keep unchecked JSON handling and platform-specific calls out of core UI logic.

## React and TanStack Query Integration

- Execute effects inside `queryFn` and `mutationFn` only:

```ts
export function featureQueryOptions() {
  return queryOptions({
    queryKey: keys.feature(),
    queryFn: ({ signal }) =>
      Effect.runPromise(fetchJson(FeatureSchema, `${API_BASE}/feature`, undefined, signal)),
  });
}
```

- Do not call `Effect.runPromise` inside components or hooks. Let TanStack Query
  manage the async lifecycle.
- For form validation, pass schemas directly:

```ts
validators: {
  onChange: Schema.standardSchemaV1(MyFormSchema),
}
```

- For route search params, decode at the boundary:

```ts
validateSearch: (search) => Schema.decodeUnknownSync(MySearchSchema)(search);
```

- Handle Effect errors in `mutationFn` and surface them via toast or form state.
  Do not let unhandled Effect errors bubble into React.

## Observability

- `Effect.fn` names operations for stack traces. That's enough in the browser.
- Do not add spans, OpenTelemetry, or structured logging in web code. React
  DevTools and browser console are the observability surface.

## Testing

- Use standard `vitest` patterns. Do not use `@effect/vitest` or `it.effect`.
- Test boundary effects by running them with `Effect.runPromise` in the test,
  then asserting on the result or error.
- Provide mock `fetch` or `AbortSignal` at the edge; do not mock Effect
  internals.

## Incremental Adoption

- Start Effect adoption at boundaries: new API integrations, form validation,
  router param decoding, and error-prone async flows.
- Do not start with stable hot paths unless there is clear value.
- Start with plain functions when typed errors and schema validation are not
  needed.
- Promote code into Effect only when typed errors, schema decoding, or
  composition benefits justify it.
- Wrap existing Promise code at the boundary first; move inward only when the
  domain benefits from typed errors or testability.

## Review Checklist

- Main workflows use `Effect.gen(...)` unless another form is clearly better.
- Exported reusable effects use `Effect.fn(...)` when the name adds value to
  traces and call sites.
- Boundary data is schema-validated; no unchecked JSON leaks in.
- Recoverable failures are typed; unrecoverable failures stay defects.
- Effects are executed with `Effect.runPromise` / `Effect.runSync` only at the
  adapter edge (query/mutation/validator/router).
- No `Context.Tag`, `Layer`, `ManagedRuntime`, `Effect.runFork`, or `Fiber` in
  web code.

## Avoid By Default

- `Context.Tag`, `Layer`, `ManagedRuntime`, `Effect.runFork`, `Fiber`, `Scope`,
  `Effect.acquireRelease`, or any resource lifecycle combinators.
- Scattered `Effect.runPromise` through component and hook code.
- Throwing exceptions for expected control flow.
- Untyped DTOs or untyped error payloads at boundaries.
- Raw `JSON.parse(...)` or env reads in business logic.
- Clever point-free pipelines when direct sequential code is clearer.
- Advanced abstractions before there is a concrete need.

## Copyable Patterns

### Schema Record and Derived Payload

```ts
import * as Schema from "effect/Schema";

class User extends Schema.Class<User>("User")({
  id: UserId,
  email: Email,
  createdAt: Schema.DateTimeUtc,
}) {}

const CreateUser = Schema.Struct(User.fields).pipe(Schema.omit("id", "createdAt"));
```

### Tagged Error Split

```ts
import * as Data from "effect/Data";
import * as Schema from "effect/Schema";

class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly userId: UserId;
}> {}

class ApiDecodeError extends Schema.TaggedError<ApiDecodeError>()("ApiDecodeError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}
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

### TanStack Query Adapter

```ts
import { queryOptions } from "@tanstack/react-query";

export function featureQueryOptions() {
  return queryOptions({
    queryKey: keys.feature(),
    queryFn: ({ signal }) =>
      Effect.runPromise(fetchJson(FeatureSchema, `${API_BASE}/feature`, undefined, signal)),
  });
}
```

### Form Validator Adapter

```ts
import { Schema } from "effect";

validators: {
  onChange: Schema.standardSchemaV1(MyFormSchema),
}
```

### Route Search Param Decoder

```ts
import { Schema } from "effect";

validateSearch: (search) => Schema.decodeUnknownSync(MySearchSchema)(search);
```

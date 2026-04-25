# `apps/web` Architecture Guide

React renders UI. TanStack owns data, routing, and forms. Effect composes async boundaries and validates schemas.

## Skills

Load all related skills before working on this app:

- `tanstack-router`
- `tanstack-query`
- `tanstack-form`
- `effect-ts`
- `vercel-react-best-practices`

## Tool Priority

1. **TanStack** for everything it manages.
2. **React** for ephemeral UI state only.
3. **Effect** for async boundary composition and `Schema`.

## TanStack First

### Server State → TanStack Query

Never `useEffect` + `fetch`. Use `queryOptions` and `useQuery` / `useMutation`.

```ts
// lib/api/feature.ts
export function featureQueryOptions() {
  return queryOptions({
    queryKey: keys.feature(),
    queryFn: ({ signal }) =>
      Effect.runPromise(fetchJson(FeatureSchema, `${API_BASE}/feature`, undefined, signal)),
  });
}

// FeaturePage.tsx
const { data } = useQuery(featureQueryOptions());
```

### Routing & URL State → TanStack Router

Keep route definitions, params, and search schemas in the router. Do not sync URL state manually.

```ts
// routes/feature.$id.tsx
validateSearch: (search) => Schema.decodeUnknownSync(MySearchSchema)(search),
```

### Forms → TanStack Form

Use `useForm` and `Field` components. Validate with Effect schemas.

```ts
const form = useForm({
  defaultValues: { email: "" },
  validators: {
    onChange: Schema.standardSchemaV1(MyFormSchema),
  },
});
```

## React: UI State Only

Use React `useState` / `useReducer` for strictly local, ephemeral UI state: open/closed panels, active hover, transient animations.

If state should survive navigation, belongs in the URL, or syncs with the server, move it to TanStack Router, Query, or Form.

## Effect: Boundary Only

Effect composes async work and validates data. It never owns the runtime.

- **Allowed**: `Effect.gen`, `Effect.tryPromise`, `Schema`, `Either`, `Option`.
- **Forbidden**: `Context.Tag`, `Layer`, `ManagedRuntime`, `Effect.runFork`, `Fiber`, `Scope`, `Effect.acquireRelease`.

Execute effects only at adapter edges:

```ts
// Inside queryFn / mutationFn
queryFn: ({ signal }) =>
  Effect.runPromise(fetchJson(Schema, url, undefined, signal)),

// Inside form validators
validators: { onChange: Schema.standardSchemaV1(MyFormSchema) },

// Inside route guards / validateSearch
validateSearch: (search) => Schema.decodeUnknownSync(MySearchSchema)(search),
```

Build effects in modules. Execute them at boundaries. Do not run effects inside components or hooks outside TanStack adapters.

## Module Shape

- One module per API domain or boundary concern.
- Keep schemas and tagged errors near the code that owns them.
- Export small, named constructors. Avoid giant utility files.
- Prefer explicit names: `AnimeApi`, `AuthClient`, `SystemConfigApi`.

## Style Defaults

- Prefer clarity over cleverness.
- Prefer fewer abstractions with stronger types.
- Default to `Effect.gen(function* () { ... })` for effectful workflows; use `.pipe(...)` for cross-cutting concerns (retries, timeouts, transforms).
- Use `Effect.fn("Name")` for exported reusable operations.
- Prefer plain `if`/`switch` for simple branching; use `Match` for exhaustiveness.
- Prefer data-last inside pipelines; data-first for one-off local calls.

## Data Modeling

- Use `Schema.Class` for domain records.
- Use `Schema.TaggedError` for errors that cross boundaries.
- Use `Data.TaggedError` for internal domain failures.
- Decode and encode at boundaries only.
- Reuse schemas across HTTP, forms, router params, and tests.

## Errors

- Use `Either` for sync computations; `Effect` for async.
- Keep error types visible at call sites.
- Recover specifically with `catchTag` / `catchTags`.
- Treat bugs and invariant violations as defects (`orDie` at hard boundaries).
- Do not throw for expected control flow.

## HTTP Interop

- The HTTP client returns `Effect.Effect<A, TaggedErrors>`.
- Wrap `fetch` with `Effect.tryPromise` inside the client module.
- Apply retries, timeouts, and auth transforms once in the client.
- No raw `fetch` errors or unchecked JSON in domain code.

## Testing

- Standard `vitest`. No `@effect/vitest`.
- Run boundary effects with `Effect.runPromise` in tests and assert on results.
- No mock tests, prefer deterministic tests.

## Avoid

- `useEffect` for data fetching or synchronization.
- Raw `fetch` outside the HTTP client module.
- Manual URL state syncing.
- Uncontrolled form state with `useState`.
- Effect runtime infrastructure in web code.
- Throwing exceptions for expected control flow.
- Untyped DTOs or `JSON.parse` in business logic.

## Quick Reference

| Concern                         | Tool               |
| ------------------------------- | ------------------ |
| Server state                    | TanStack Query     |
| Routing / URL state             | TanStack Router    |
| Forms                           | TanStack Form      |
| Ephemeral UI state              | React `useState`   |
| Async composition / HTTP client | Effect             |
| Validation / schemas            | Effect `Schema`    |
| Sync branching / parsing        | `Either`, `Option` |

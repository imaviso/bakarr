# apps/web

React SPA with TanStack Router/Query/Form. Effect is a **boundary tool only**.

## Rules

- **No Effect runtime infrastructure.** No `Context.Tag`, `Layer`, `ManagedRuntime`, `Effect.runFork`, or `Fiber` in web code. Effect runs only inside `Effect.runPromise` / `Effect.runSync` calls at the adapter edge.
- **React owns the runtime.** State: TanStack Query for server state, imperative module-level state for auth, React hooks + `useSyncExternalStore` for UI subscriptions.
- **Effect for boundaries only.** Use `Effect.gen` in the HTTP client (`lib/effect/api-client.ts`) and `Schema` for validation. Use `Effect.tryPromise` / `Effect.try` for platform interop. That's it.
- **Auth is imperative.** `lib/auth-state.ts` holds module-level mutable auth state with `Set<listener>`. `lib/auth.tsx` is a thin React adapter. Router guards use `queryClient.fetchQuery(authMeQueryOptions())` in async `beforeLoad`.
- **HTTP client is schema-backed.** `fetchJson(Schema, url)` returns `Effect.Effect<A, TaggedErrors>`. Called via `Effect.runPromise` inside TanStack Query `queryFn` / `mutationFn`. No type assertions.

## Patterns

### API call

```ts
// lib/api/feature.ts
export function featureQueryOptions() {
  return queryOptions({
    queryKey: keys.feature(),
    queryFn: ({ signal }) =>
      Effect.runPromise(fetchJson(FeatureSchema, `${API_BASE}/feature`, undefined, signal)),
  });
}
```

### Form validator

```ts
validators: {
  onChange: Schema.standardSchemaV1(MyFormSchema),
}
```

### Route search params

```ts
validateSearch: (search) => Schema.decodeUnknownSync(MySearchSchema)(search);
```

## Commands

- `bun run check` — tsc --noEmit
- `bun run test` — vitest run
- `bun run build` — vite build
- `bun run lint` — `bun run oxlint --type-aware` (root)

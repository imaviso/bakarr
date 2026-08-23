# apps/web

React SPA with TanStack Router/Query/Form. Effect is a **boundary tool only**.

## Rules

- **No Effect runtime infrastructure.** No `Context.Tag`, `Layer`, `ManagedRuntime`, `Effect.runFork`, or `Fiber` in web code. Effect runs only inside `Effect.runPromise` / `Effect.runSync` calls at the adapter edge.
- **React owns the runtime.** State: TanStack Query for server state, imperative module-level state for auth. React hooks used sparingly. Avoid custom hooks; keep logic in plain functions.
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

## Styling

- **Tokens:** single source in `src/styles/tokens.css` (`:root`/`.dark` + `@theme inline`). Semantic vars (`--background`, `--foreground`, etc.) map to `gs-*` base scale. No hard-coded colors outside tokens.
- **Layers:** `src/index.css` is a barrel (`@import tokens/base/components`). `base.css` holds `@layer base` resets; `components.css` holds `@layer components` + keyframes.
- **Alias:** single `@` → `./src` (no `~`). `cn` lives in `src/infra/utils.ts` — import `from "@/infra/utils"`.
- **No arbitrary values:** use Tailwind scale (`text-xs`, `w-40`, `min-h-40`) or `cva` variants. `bg-[Canvas]` and virtualizer `style={{ height, transform }}` are allowlisted.
- **Shared atoms:** `src/components/shared/{field-error,stat-dot,meta-text}.tsx` for repeated micro-patterns — prefer an explicit prop over a magic class string.
- **Component decomposition:** `sidebar` split into `sidebar/constants.ts` + `sidebar/context.tsx` + `sidebar.tsx`; media library split into `media-grid-helpers.ts` + `media-progress-bar.tsx` + `media-grid-card.tsx` + `media-details-toolbar.tsx`.
- **UI pruning:** unused `components/ui/*` (accordion, carousel, chart, etc.) deleted — re-add via `shadcn add` if needed.

## Commands

- `pnpm check` — tsc --noEmit
- `pnpm test` — vitest run
- `pnpm build` — vite build
- `pnpm lint` — `oxlint --type-aware` (root)

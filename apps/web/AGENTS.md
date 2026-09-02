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
- **Shared atoms:** `src/components/shared/{field-error,stat-dot}.tsx` for repeated micro-patterns — prefer an explicit prop over a magic class string. Use `FieldError` for all form field errors and `ConfirmDialog` for confirmations instead of hand-rolling AlertDialogs.
- **Component decomposition:** `sidebar` split into `sidebar/constants.ts` + `sidebar/context.tsx` + `sidebar.tsx`; media library split into `media-grid-helpers.ts` + `media-progress-bar.tsx` + `media-grid-card.tsx` + `media-details-toolbar.tsx`.
- **Dialogs:** scrollable content dialogs use `src/components/shared/content-dialog.tsx` (`ContentDialog` + `Header/Body/Footer` slots) — never hand-roll sizing/sticky-chrome strings on raw `ui/dialog`. Size variants (`sm|md|lg|xl`) own the viewport-width/height calculations; that file is the only place dialog-sizing arbitrary values are allowed. Plain small dialogs (confirm, short forms) stay on `ui/dialog`.
- **Settings form fields:** bind `Config` settings through `src/features/settings/system-settings-fields.tsx` (`SettingTextField/SwitchField/NumberField/SelectField`) instead of hand-writing `form.Field` render props. Names are typed via tanstack's `DeepKeysOfType` (string/boolean/number unions). Bespoke controls (TimezonePicker, ratio-limit decode, PathMappingsEditor, profile forms) stay hand-rolled.
- **UI pruning:** unused `components/ui/*` (accordion, carousel, chart, etc.) deleted — re-add via `shadcn add` if needed.

## Commands

- `pnpm check` — tsc --noEmit
- `pnpm test` — vitest run
- `pnpm build` — vite build
- `pnpm lint` — `oxlint --type-aware` (root)

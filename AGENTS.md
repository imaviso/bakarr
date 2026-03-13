# AGENTS

## Repo Overview

- `apps/api`: Deno API built with Effect, Hono, Drizzle, SQLite
- `apps/web`: SolidJS app with TanStack Router/Query
- `packages/shared`: shared API types

## Working Rules

- Prefer small, focused modules over large mixed files
- Preserve existing Effect patterns in `apps/api`
- Preserve Solid reactivity rules in `apps/web` (do not destructure props)
- Use shared contracts from `packages/shared` when touching API/UI boundaries

## Commands

- root: `pnpm dev`, `pnpm test`, `pnpm build`
- api: `deno task check`, `deno task test`, `deno lint`, `dx effect-language-service diagnostics --project tsconfig.json`
- web: `pnpm build`

## Caution

- Keep route handlers thin and business logic in feature modules/services

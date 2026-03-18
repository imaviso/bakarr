# AGENTS

Project status: pre-release alpha. Do not preserve backward compatibility unless
explicitly requested.

## Repo Overview

- `apps/api`: Deno API built with Effect, Hono, Drizzle, SQLite
- `apps/web`: SolidJS app with TanStack Router/Query
- `packages/shared`: shared API types

## Working Rules

- App is created with single-user and local lan deployment in mind.
- Use Effect primitives as much as possible and the effect-ts skill +
  references.
- Use typescript-magician skill when encountering type-issues.
- Prefer small, focused modules over large mixed files
- Follow and Preserve existing Effect patterns in `apps/api/EFFECT_GUIDE.md`,
  follow
- Preserve Solid reactivity rules in `apps/web` (do not destructure props)
- Use shared contracts from `packages/shared` when touching API/UI boundaries

## Commands

- root: `deno task dev`, `deno task test`, `deno task build`, `deno task lint`
- api: `deno task check`, `deno task test`, `deno lint`,
  `dx effect-language-service diagnostics --project tsconfig.json`
- web: `deno task build`, `deno task lint`

## Caution

- Keep route handlers thin and business logic in feature modules/services

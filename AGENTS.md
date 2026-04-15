# AGENTS

Project status: pre-release alpha. Do not preserve backward compatibility unless
explicitly requested. We will prefer clean, breaking internal refactors over
compatibility layers, graceful degradation, mixed Promise/Effect styles, and
framework bridges that keep old patterns alive.

## Repo Overview

- `apps/api`: Bun API built with Effect, Drizzle, SQLite
- `apps/web`: SolidJS app with TanStack Router/Query
- `packages/shared`: shared API types

## Working Rules

- App is created with single-user and local lan deployment in mind.
- Strictly follow `apps/api/EFFECT_GUIDE.md`.
- Use typescript-magician skill when encountering type-issues.
- Use and strictly follow solidjs skill.
- Use shared contracts from `packages/shared` when touching API/UI boundaries

## Commands

- root: `bun run dev`, `bun run check`, `bun run test`, `bun run build`,
  `bun run lint`
- api: `bun run check`, `bun run test`
- web: `bun run check`, `bun run build`

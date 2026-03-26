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
- Use Effect primitives as much as possible and the effect-ts skill +
  references.
- Use typescript-magician skill when encountering type-issues.
- Prefer small, focused modules over large mixed files
- Follow and Preserve existing Effect patterns in `apps/api/EFFECT_GUIDE.md`,
  follow
- Preserve Solid reactivity rules in `apps/web` (do not destructure props)
- Use shared contracts from `packages/shared` when touching API/UI boundaries

## Commands

- root: `bun run dev`, `bun run check`, `bun run test`, `bun run build`,
  `bun run lint`
- api: `bun run check`, `bun run lint`, `bun run test`
  (`bun run lint` intentionally goes through `tsc` so Effect diagnostics show up),
  `dx effect-language-service diagnostics --project tsconfig.json`
- web: `bun run check`, `bun run build`, `bun run lint`

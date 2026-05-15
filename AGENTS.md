# AGENTS

Project status: pre-release alpha (still be critical). Do not preserve backward compatibility unless
explicitly requested. We will prefer clean, breaking internal refactors over
compatibility layers, graceful degradation, mixed Promise/Effect styles, and
framework bridges that keep old patterns alive. Keep it simple, no bloat, no
extra abstractions, no future proofing, no defensive code. Avoid one-line wrapper functions that only hide direct code behind a vague name. Prefer inlining obvious operations, especially when a wrapper introduces magic, indirection, or ambiguous semantics

## Repo Overview

- `apps/api`: Node.js API built with Effect, Drizzle, SQLite
- `apps/web`: React app with TanStack Router/Query
- `packages/shared`: shared API types

## Working Rules

- App is created with single-user and local lan deployment in mind.
- Strictly follow `apps/api/EFFECT_GUIDE.md`.
- Use typescript-magician skill when encountering type-issues.
- Use and strictly follow react skill.
- Use shared contracts from `packages/shared` when touching API/UI boundaries

## Commands

- root: `pnpm dev`, `pnpm check`, `pnpm test`, `pnpm build`, `pnpm lint`
- api: `pnpm --filter @bakarr/api check`, `pnpm --filter @bakarr/api test`
- web: `pnpm --filter @bakarr/web check`, `pnpm --filter @bakarr/web build`

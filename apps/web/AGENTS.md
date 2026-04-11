# Bakarr UI

SolidJS frontend for Bakarr.

## Agent Rules

- Use the `solidjs` skill for Solid/SolidStart tasks.
- Keep Solid reactivity intact: do not destructure `props`; use `props.x`.
- Use shared contracts for API boundaries (`packages/shared`).
- Prefer existing UI primitives in `src/components/ui` before creating new ones.

## Stack

- SolidJS + TypeScript + Vite
- Tailwind CSS + SolidUI + Tabler Icons
- TanStack Router + TanStack Query (+ Form/Table where used)
- Valibot for validation

## Project Layout

- `src/routes`: TanStack file routes
- `src/components`: reusable components
- `src/components/ui`: UI primitives
- `src/libs`: utilities

## Commands

- `bun run dev`
- `bun run check`
- `bun run build`

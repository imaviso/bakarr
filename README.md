# Bakarr

Anime library manager monorepo.

## Apps

- `apps/api` - Bun + Effect
- `apps/web` - SolidJS frontend
- `packages/shared` - shared transport/types

## Workspace

- runtime and task runner: `bun`
- workspace config: `package.json` workspaces
- dependencies are installed with Bun

## Common Commands

From the repo root:

```sh
bun run dev
bun run dev:api
bun run dev:web
bun run check
bun run test
bun run build
bun run lint
```

API checks:

```sh
bun run check:api
bun run lint:api
bun run --cwd apps/api check
bun run --cwd apps/api test
bun run --cwd apps/api lint
```

Web checks:

```sh
bun run check:web
bun run lint:web
bun run --cwd apps/web build
bun run --cwd apps/web check
bun run --cwd apps/web lint
```

## Notes

- API uses SQLite/Drizzle migrations under `apps/api/drizzle`
- frontend talks to the API using contracts from `packages/shared`
- root `.gitignore` excludes local env files, build logs, and SQLite artifacts

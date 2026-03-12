# Bakarr

Anime library manager monorepo.

## Apps

- `apps/api` - Deno + Effect + Hono API
- `apps/web` - SolidJS frontend
- `packages/shared` - shared transport/types

## Workspace

- package manager: `pnpm`
- workspace config: `pnpm-workspace.yaml`

## Common Commands

From the repo root:

```sh
pnpm dev
pnpm dev:api
pnpm dev:web
pnpm test
pnpm build
```

API checks:

```sh
cd apps/api
deno task check
deno task test
deno lint
```

Web checks:

```sh
cd apps/web
pnpm build
```

## Notes

- API uses SQLite/Drizzle migrations under `apps/api/drizzle`
- frontend talks to the API using contracts from `packages/shared`
- root `.gitignore` excludes local env files, build logs, and SQLite artifacts

# Bakarr

Anime library manager monorepo.

## Apps

- `apps/api` - Deno + Effect + Hono API
- `apps/web` - SolidJS frontend
- `packages/shared` - shared transport/types

## Workspace

- runtime and task runner: `deno`
- workspace config: `deno.json`
- npm packages are resolved through Deno's npm compatibility layer

## Common Commands

From the repo root:

```sh
deno task dev
deno task dev:api
deno task dev:web
deno task test
deno task build
deno task lint
deno task fmt
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
deno task build
deno task lint
```

## Notes

- API uses SQLite/Drizzle migrations under `apps/api/drizzle`
- frontend talks to the API using contracts from `packages/shared`
- root `.gitignore` excludes local env files, build logs, and SQLite artifacts

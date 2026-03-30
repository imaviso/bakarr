# Single-Binary API Implementation Plan

## Goal

Ship an API executable that is self-contained for code and static assets:

- use Bun's built-in SQLite driver instead of `@libsql/client`
- serve the frontend from embedded assets instead of `apps/web/dist` on disk
- run Drizzle migrations from embedded SQL instead of `apps/api/drizzle` on disk

## Concrete Steps

1. Replace the runtime database client in `apps/api/src/db/database.ts` with
   `@effect/sql-sqlite-bun` and bridge Drizzle through
   `@effect/sql-drizzle/Sqlite`.
2. Keep the existing `Database` service boundary so repository and feature code
   can continue using typed Drizzle queries.
3. Inline migration SQL into a generated TypeScript module and execute it with
   `@effect/sql-sqlite-bun/SqliteMigrator`.
4. Inline `apps/web/dist` assets into a generated TypeScript module and serve
   them from memory.
5. Add a generation script plus a `build:binary` script that runs the web build,
   regenerates embedded artifacts, and compiles the Bun executable.
6. Keep test helpers aligned with the runtime path so tests exercise Bun SQLite
   rather than `@libsql/client`.

## Files Touched

- `apps/api/src/db/database.ts`
- `apps/api/src/db/migrate.ts`
- `apps/api/src/http/http-app.ts`
- `apps/api/src/http/embedded-web.ts`
- `apps/api/src/generated/embedded-web-assets.ts`
- `apps/api/src/generated/embedded-drizzle-migrations.ts`
- `apps/api/tools/generate-embedded-artifacts.ts`
- `apps/api/src/test/database-test.ts`
- `apps/api/src/test/sqlite-client.ts`
- `apps/api/package.json`
- `package.json`

## Build Flow

Use:

```sh
bun run --cwd apps/api build:binary
```

That flow now does three things in order:

1. build `apps/web`
2. regenerate embedded web assets and embedded migrations
3. compile `apps/api/main.ts` into the Bun executable

## Verification

- `bun run --cwd apps/api check`
- `bun run --cwd apps/api test`
- `bun run --cwd apps/api lint`
- `bun run --cwd apps/api build:binary`

## Follow-Up

- If the binary distribution should also create or update the SQLite database
  path automatically, document the expected writable location beside the binary.
- If startup time becomes noticeable, precompute metadata such as ETags during
  artifact generation instead of per-request.

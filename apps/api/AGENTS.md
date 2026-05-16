# apps/api

- Node.js API for Bakarr, powered by Effect, Drizzle, and SQLite.
- `src/features/` contains domain services, orchestration, and live layers; grouped into vertical clusters (e.g. `anime/add/`, `anime/metadata/`, `operations/download/`, `operations/search/`). Keep `errors.ts` and `layer.ts` at feature root. `src/http/` keeps route adapters thin; `src/infra/` holds shared Effect utilities; `src/db/` owns schema and persistence.
- Follow `EFFECT_GUIDE.md`: prefer `Effect.gen`, `Effect.fn`, `Context.Tag`, `Layer.*`, and `Schema`-first modeling over compatibility layers or manual dependency bags.
- Read `CONTEXT.md` for API codebase context.
- Keep dependencies at the layer boundary, not inside every method; use shared contracts from `packages/shared` at API/UI edges.
- Model recoverable failures with tagged errors, validate input at the edge, and keep route error mapping centralized.
- Tests should use small Effect layers and deterministic clocks when time matters.

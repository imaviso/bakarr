# apps/api

- Node.js API for Bakarr, powered by Effect, Drizzle, and SQLite.
- Tier semantics (ADR-0005), one meaning each:
  - `src/app/` — runtime assembly: lifecycle layers, startup, http-app, event-socket, config.
  - `src/background/` — background runtime: workers, controller, monitor, scheduler, job journal.
  - `src/db/` — SQLite schema, migrations, database service.
  - `src/features/` — vertical slices (`auth`, `media`, `operations`, `system`); each owns its routers, request schemas, services, repositories, `errors.ts`, and `layer.ts` at slice root (e.g. `media/add/`, `media/identity/`, `operations/download/`, `system/http/`). No `src/http/` tier exists.
  - `src/infra/` — generic Effect/platform utilities only (`effect/`, `http/`, `filesystem/`, `file-stream.ts`, `schema.ts`, logging/metrics/telemetry, time/text/url/path/random). Never host feature-specific logic.
  - `src/security/` — audit-worthy crypto/SSRF primitives (password, token-hasher, private-host, dns-resolver).
  - `src/test/` — test factories, stubs, fixtures.
- New feature work: everything inside `features/<f>/`; wire the router in `app/http-app.ts` and the feature layer in `app/lifecycle-layers.ts`. Route-error mapping stays central in `infra/http/route-errors/` (ADR-0002); shared wire contracts stay in `packages/shared`.
- Follow `EFFECT_GUIDE.md`: prefer `Effect.gen`, `Effect.fn`, `Effect.Service`, `Layer.*`, and `Schema`-first modeling over compatibility layers or manual dependency bags.
- Read `CONTEXT.md` for API codebase context.
- Keep dependencies at the layer boundary, not inside every method; use shared contracts from `packages/shared` at API/UI edges.
- Model recoverable failures with tagged errors, validate input at the edge, and keep route error mapping centralized.
- Tests should use small Effect layers and deterministic clocks when time matters.

# Bakarr API Effect Refactor Implementation Plan

This plan captures the remaining refactor work needed to align `apps/api` with
the `effect-ts` skill references and the current architecture direction already
in progress.

## Goals

- Keep `Effect` as the primary model for orchestration, dependencies, errors,
  config, and boundary management.
- Finish moving unsafe Promise-first boundaries behind typed `Context.Tag` +
  `Layer` services.
- Make `Schema` the runtime and type source of truth for HTTP, config, and
  persisted JSON payloads.
- Preserve current product behavior while improving testability,
  observability, and dependency flow.

## Current State

- Runtime composition is already centralized in `apps/api/src/runtime.ts`.
- Main feature services already use `Effect.gen` and `Effect.fn` heavily.
- HTTP JSON bodies already decode through schemas in
  `apps/api/src/http/request-schemas.ts` and `apps/api/src/http/app.ts`.
- Most remaining gaps are now boundary-level, especially external clients,
  config, unchecked casts, and large feature modules.

## Refactor Principles

- Provide dependencies once at the application boundary.
- Prefer leaf services first, then orchestration services that depend on them.
- Use `Schema` at all runtime boundaries, including env, HTTP, DB JSON, and
  external API responses.
- Keep recoverable failures typed and explicit.
- Adopt incrementally by replacing the highest-risk boundaries first.

## Phase Order

### Phase 1 - External Boundary Services

Goal: move raw Promise-based integrations behind Effect services and layers.

Scope:

- Extract `AniListClient` from `apps/api/src/features/anime/anilist.ts`.
- Extract `QBitTorrentClient` from
  `apps/api/src/features/operations/qbittorrent.ts`.
- Extract RSS/fetch boundary helpers from
  `apps/api/src/features/operations/service.ts` and related helpers.
- Remove deep runtime execution from `apps/api/src/lib/effect-retry.ts`.

Implementation steps:

- Create leaf service tags for each external integration.
- Move raw `fetch`, response parsing, auth/session handling, and retry logic
  into those services.
- Keep `Effect.tryPromise` only inside the service implementations.
- Inject shared concerns like timeout, retry, base URLs, and logging at the
  layer level.
- Update feature services to depend on the new tags instead of raw helpers or
  client classes.

Deliverables:

- `src/features/anime/anilist-client.ts` or equivalent service module.
- `src/features/operations/qbittorrent-client.ts` or equivalent service module.
- `src/features/operations/rss-client.ts` or equivalent service module.
- `src/runtime.ts` updated to provide the new layers.

Acceptance criteria:

- No `Effect.runPromise(...)` below the main runtime/transport boundary.
- No direct `new QBitClient(...)` or raw `fetch(...)` calls from feature service
  orchestration code.
- External response payloads decode through schemas before entering domain
  logic.

### Phase 2 - Complete HTTP Boundary Schemas

Goal: make route params, query strings, and request bodies fully schema-driven.

Scope:

- `apps/api/src/http/app.ts`
- `apps/api/src/http/request-schemas.ts`

Implementation steps:

- Add schemas for path params and query params, not only JSON bodies.
- Replace `Number(c.req.param(...))`, `Number(c.req.query(...))`, and similar
  unchecked coercions with decoding helpers.
- Remove `body as ...`, `as never`, and similar casts from route handlers.
- Return decoded values directly into service calls.

Deliverables:

- Shared HTTP decode helpers for body, params, and query.
- Route schemas grouped by feature where useful.

Acceptance criteria:

- No unchecked numeric/path/query coercion in `apps/api/src/http/app.ts`.
- No route-level schema decode followed by cast-away typing.
- Invalid query/path values fail with explicit `400` validation errors.

### Phase 3 - Effect Config and Persisted Config Schemas

Goal: replace ad hoc config parsing with Effect-native config loading and schema
 validation.

Scope:

- `apps/api/src/config.ts`
- `apps/api/src/features/system/service.ts`
- `apps/api/src/features/system/defaults.ts`
- `apps/api/src/features/operations/service.ts`

Implementation steps:

- Rebuild startup env loading with `Config` / `Schema.Config`.
- Use redacted config values for secrets such as bootstrap passwords and any
  qBittorrent credentials.
- Add schemas for persisted config JSON stored in the database.
- Replace raw `JSON.parse(... as Config)` and fallback parsing with schema-based
  decode/encode functions.
- Fail early on invalid env/config rather than silently falling back.

Deliverables:

- `AppConfig` backed by Effect Config providers.
- Schemas for persisted config core and profile data.
- Shared codec utilities for config persistence.

Acceptance criteria:

- No raw `Deno.env.get(...)` parsing logic in business-facing config modules.
- No unchecked `JSON.parse(... as ...)` for persisted config.
- Secrets are represented as redacted values until the edge where needed.

### Phase 4 - Schema-First Domain and Persistence JSON

Goal: make Schema the source of truth for DB JSON columns and transport/domain
 shapes that cross boundaries.

Scope:

- `apps/api/src/features/system/service.ts`
- `apps/api/src/features/operations/service.ts`
- `apps/api/src/features/anime/service.ts`
- `packages/shared/src/index.ts` where shared contracts should stay canonical

Implementation steps:

- Identify JSON columns and stringly typed arrays currently using
  `JSON.stringify` and `JSON.parse` manually.
- Create schemas for release profile rules, quality profile settings,
  `releaseProfileIds`, config core, mapped paths, and related persisted values.
- Introduce branded types where it improves clarity, especially IDs and domain
  boundary primitives.
- Reuse schemas for DB codecs, HTTP input/output, and tests where possible.

Deliverables:

- Shared schema modules per feature.
- Central encode/decode helpers for DB JSON columns.

Acceptance criteria:

- No repeated manual JSON encoding/decoding for the same persisted shapes.
- Schema decode failures surface as typed errors instead of runtime casts.

### Phase 5 - Feature Decomposition and Project Structure Cleanup

Goal: break monolithic files into smaller leaf modules with clearer dependency
 flow.

Scope:

- `apps/api/src/features/operations/service.ts`
- `apps/api/src/features/system/service.ts`
- `apps/api/src/features/anime/service.ts`
- `apps/api/src/http/app.ts`

Target structure:

- `routes.ts` for transport wiring
- `service.ts` for orchestration
- `repository.ts` for persistence-heavy access
- `schemas.ts` for runtime models
- `client.ts` for external integrations
- `errors.ts` when the error surface is large enough

Implementation steps:

- Split repositories out of large feature services first.
- Move route registration into feature-local route modules.
- Keep `app.ts` as a composition file, not a giant route implementation file.
- Introduce smaller leaf tags such as config store, download repository,
  library scanner, and media stream service.

Deliverables:

- Smaller feature directories with explicit boundaries.
- Reduced file size for the current large feature modules.

Acceptance criteria:

- `service.ts` files focus on orchestration, not every persistence/detail path.
- `http/app.ts` mostly composes routes and middleware.

### Phase 6 - Error Model Tightening

Goal: make recoverable failures more specific and easier to handle with
 `catchTag`/`catchTags`.

Scope:

- `apps/api/src/features/auth/service.ts`
- `apps/api/src/features/anime/service.ts`
- `apps/api/src/features/system/service.ts`
- `apps/api/src/features/operations/service.ts`
- `apps/api/src/http/app.ts`

Implementation steps:

- Replace broad catch-all service errors with narrower tagged errors where the
  caller can respond differently.
- Separate validation failures, missing resources, external client failures,
  file system failures, and state conflicts.
- Wrap unknown external causes explicitly at service boundaries.

Deliverables:

- Narrower error unions per feature.
- Cleaner route error mapping based on tags instead of broad shape checks.

Acceptance criteria:

- Core route recovery can be expressed with tagged error handling.
- Feature code no longer collapses unrelated failures into one generic error
  unless that is the intentional API contract.

### Phase 7 - Background Jobs and Runtime Supervision

Goal: make background workflows more Effect-native and more testable.

Scope:

- `apps/api/src/background.ts`
- `apps/api/main.ts`

Implementation steps:

- Replace timer/callback-centric loops with Effect-managed scheduling where it
  is practical.
- Move lock/retry/supervision logic into explicit Effect programs.
- Ensure background workers use the same dependency graph and observability
  model as request flows.

Deliverables:

- Background worker modules with clear Effect entrypoints.
- Reduced reliance on `setInterval`, `queueMicrotask`, and Promise locks.

Acceptance criteria:

- Background jobs can be started/stopped/tested through Effect programs.
- Worker failures log and recover through explicit Effect policies.

### Phase 8 - Observability and Test Upgrades

Goal: finish with stronger tracing and more Effect-native tests.

Scope:

- `apps/api/src/lib/logging.ts`
- `apps/api/main_test.ts`
- `apps/api/src/background_test.ts`
- `apps/api/src/features/**/*_test.ts`

Implementation steps:

- Add `Effect.withSpan(...)` around long-running or important workflows such as
  imports, RSS checks, external API calls, download sync, and scans.
- Introduce OTLP/telemetry layer support only after service boundaries are
  stable.
- Start migrating critical tests to `@effect/vitest` with per-test layers.
- Add test layers for extracted clients, file system services, and config
  providers.

Deliverables:

- More traceable runtime logs/spans.
- Effect-native test setup for the most important workflows.

Acceptance criteria:

- Critical boundary logic can be tested with injected layers.
- Tracing/log context is attached to major external and background workflows.

## Suggested File Backlog

Highest priority:

- `apps/api/src/lib/effect-retry.ts`
- `apps/api/src/features/anime/anilist.ts`
- `apps/api/src/features/operations/qbittorrent.ts`
- `apps/api/src/http/app.ts`
- `apps/api/src/config.ts`

Second priority:

- `apps/api/src/features/system/service.ts`
- `apps/api/src/features/operations/service.ts`
- `apps/api/src/background.ts`

Third priority:

- `apps/api/src/features/anime/service.ts`
- `apps/api/src/features/auth/service.ts`
- `apps/api/src/features/library-roots/library-roots-repository.ts`
- test files under `apps/api`

## Execution Strategy

- Do one phase per PR or commit series where possible.
- Keep behavioral tests green after each phase.
- Prefer extraction before deep rewrites: introduce a leaf service, wire it in,
  then simplify callers.
- Avoid mixing project-structure moves with unrelated domain behavior changes in
  the same step.

## Verification Checklist Per Phase

- `deno task check`
- `deno task test`
- Search for reduced unsafe patterns:
  - `Effect.runPromise(` outside app/runtime edge
  - `body as `
  - `as never`
  - `JSON.parse(` with broad casts
  - raw `fetch(` in feature orchestration code
  - unchecked `Number(c.req.param(` and `Number(c.req.query(`

## Non-Goals

- Rewriting stable domain behavior just for stylistic purity.
- Migrating everything to new modules in one giant step.
- Adding new product features during the refactor.
- Forcing Effect abstractions into hot paths where the value is low.

## Definition of Done

- External integrations are Effect services with layers.
- HTTP, env, and persisted JSON boundaries decode through schemas.
- Runtime provisioning remains centralized and singular.
- Large feature files are decomposed into leaf modules with clear dependency
  direction.
- Remaining Promise interop is limited to explicit application boundaries and
  low-level implementation details.

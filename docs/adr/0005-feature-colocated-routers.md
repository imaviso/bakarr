# ADR 0005: Feature-Colocated Routers And Honest Tier Semantics

## Status

Accepted

## Context

The API previously used horizontal tiers: `src/http/` held every route
adapter, `src/domain/` held a five-file grab-bag, `src/config/` was a
two-file tier, and `src/infra/` mixed generic utilities with
feature-specific files (`media/identity`, `naming`, `job-*`,
`dns-resolver`). Understanding one capability (e.g. media streaming)
required hopping between `http/media/`, `features/media/stream/`, and
`infra/media/identity/`. Feature slices already colocated `errors.ts` and
`layer.ts` at their roots, but routers and request schemas sat apart.

The Elysia best-practice layout (controller + service + model per
feature) validates colocating transport adapters with the services they
call. The Effect equivalent of the Elysia controller is a thin
`HttpRouter` adapter; of the model, Effect Schema at the boundary.

## Decision

1. **Routers colocate with their feature.** Each feature slice owns its
   routers and request schemas: `features/<f>/router.ts`,
   `features/<f>/request-schemas.ts`, or a `features/<f>/http/` folder
   when a feature has many (system). `src/http/` is deleted.
2. **Tier semantics are fixed and exhaustive:**
   - `src/app/` — runtime assembly: lifecycle layers, startup,
     http-app, event-socket, config (`app/config/`).
   - `src/background/` — background runtime: workers, controller,
     monitor, scheduler, job journal (`job-status`,
     `job-failure-support`, `worker-model`).
   - `src/db/` — SQLite schema, migrations, database service.
   - `src/features/` — vertical slices (auth, media, operations,
     system), each owning routers, schemas, services, repositories,
     errors, and layers for its domain.
   - `src/generated/` — build-time artifacts.
   - `src/infra/` — generic Effect/platform utilities only (effect
     helpers, filesystem, http support, file-stream, schema atoms,
     logging/metrics/telemetry, random, time/text/url/path).
   - `src/security/` — audit-worthy crypto/SSRF primitives (password,
     token-hasher, private-host, dns-resolver).
   - `src/test/` — test factories, stubs, fixtures.
3. **Route-error mapping stays central** (ADR-0002 unchanged):
   `infra/http/route-errors/` maps shared domain errors once; feature
   mappers only handle feature-specific tags.
4. **Shared wire contracts stay in `packages/shared`** (Q3): feature
   `request-schemas.ts` holds request-validation schemas not exposed to
   the web app; shared remains the API/UI edge contract.
5. **Pure domain logic lives in features, not infra:**
   `features/media/identity/` (episode-identity parsing/ranking) and
   `features/media/shared/derivations.ts` + `date-utils.ts` are feature
   modules. `infra/` never hosts feature-specific logic.
6. **Generic Effect utilities live in `infra/effect/`**: including
   `event-bus.ts` (moved from `features/events/`, a one-file pseudo
   feature) and `bounded-stream.ts`.
7. **Filesystem-policy naming**: `features/operations/library/naming.ts`
   renders unit filenames (its only consumers are library naming
   supports).

## Consequences

- One capability = one folder: locality for changes, tests, and
  navigation; no cross-tier hops to trace a feature.
- Tier names mean one thing each; folder placement is no longer a
  judgment call.
- `domain/` and `http/` no longer exist; `config/` and `features/events/`
  are dissolved into honest homes.
- New feature work pattern: create `features/<f>/` with routers,
  schemas, services, `errors.ts`, `layer.ts` — no edits outside the
  slice except `app/http-app.ts` wiring and the app layer.
- Root-level HTTP assembly (`createHttpApp`) lives in `app/http-app.ts`.

## Related

- ADR-0001: Drizzle behind repository seams (unchanged)
- ADR-0002: Central route-error mapping (unchanged, new location
  `infra/http/route-errors/`)
- ADR-0003: FileSystem adapter (unchanged, `infra/filesystem/`)
- ADR-0004: Repository by aggregate (unchanged)
- `apps/api/EFFECT_GUIDE.md` — Services And Layers
- Elysia best practice (feature-based structure) — layout inspiration
  only; runtime patterns remain Effect per `EFFECT_GUIDE.md`

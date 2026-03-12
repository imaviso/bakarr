# Bakarr API Porting Plan

This backend should follow the web app contract first, use the Rust codebase as
a reference implementation, and improve rough edges where the old design made
maintenance harder.

## Ground Rules

- `apps/web/src/lib/api.ts` is the primary contract for browser behavior.
- `/home/yunyun/Dev/bakarr` is the reference for domain logic, background jobs,
  and storage behavior.
- We are not required to preserve every Rust internal detail if a cleaner
  Deno/Effect/Hono/Drizzle design gives the same or better product behavior.
- Every endpoint must return JSON, including mutation acknowledgements.
- Browser auth should support session cookies first, with API key support for
  automation and power-user flows.
- SSE at `/api/events` must work with cookie auth because `EventSource` does not
  attach custom auth headers.

## Target Architecture

- `Hono` handles HTTP routing, cookies, and transport concerns.
- `Effect` owns services, errors, config, orchestration, and background
  workflows.
- `Drizzle` owns schema, migrations, and repository queries.
- `SQLite` is the primary local database.
- `packages/shared` holds stable transport contracts shared by API and web.

Suggested API structure:

- `src/features/auth`
- `src/features/anime`
- `src/features/episodes`
- `src/features/search`
- `src/features/downloads`
- `src/features/rss`
- `src/features/library`
- `src/features/profiles`
- `src/features/system`
- `src/features/events`

Each feature should have:

- `routes.ts`
- `service.ts`
- `repository.ts` when persistence is needed
- `dto.ts` or shared contracts when transport types are stable

## Implementation Order

### Phase 1 - Foundations

- Auth/session middleware
- Shared JSON response helpers
- Error mapping for `401`, `404`, `409`, `422`, `500`
- SSE event bus and `/api/events`
- System health/status shell

### Phase 2 - App Shell Reads

- `GET /api/system/status`
- `GET /api/library/stats`
- `GET /api/library/activity`
- `GET /api/anime`
- `GET /api/anime/:id`
- `GET /api/anime/:id/episodes`

### Phase 3 - Core Anime Management

- `POST /api/anime`
- `DELETE /api/anime/:id`
- `POST /api/anime/:id/monitor`
- `PUT /api/anime/:id/path`
- `PUT /api/anime/:id/profile`
- `PUT /api/anime/:id/release-profiles`
- `GET /api/anime/:id/files`
- `POST /api/anime/:id/episodes/refresh`
- `POST /api/anime/:id/episodes/scan`

### Phase 4 - Settings Dependencies

- `GET /api/profiles`
- `GET /api/profiles/qualities`
- `POST /api/profiles`
- `PUT /api/profiles/:name`
- `DELETE /api/profiles/:name`
- `GET /api/release-profiles`
- `POST /api/release-profiles`
- `PUT /api/release-profiles/:id`
- `DELETE /api/release-profiles/:id`
- `GET /api/system/config`
- `PUT /api/system/config`

### Phase 5 - Search and Download Flow

- `GET /api/anime/search`
- `GET /api/anime/anilist/:id`
- `GET /api/search/releases`
- `GET /api/search/episode/:animeId/:episodeNumber`
- `POST /api/search/download`
- `GET /api/downloads/queue`
- `GET /api/downloads/history`
- `POST /api/downloads/search-missing`
- `GET /api/wanted/missing`

### Phase 6 - RSS Automation

- `GET /api/rss`
- `POST /api/rss`
- `DELETE /api/rss/:id`
- `PUT /api/rss/:id/toggle`
- `GET /api/anime/:id/rss`
- `POST /api/system/tasks/rss`

### Phase 7 - Import and Library Maintenance

- `GET /api/library/unmapped`
- `POST /api/library/unmapped/scan`
- `POST /api/library/unmapped/import`
- `POST /api/library/import/scan`
- `POST /api/library/import`
- `GET /api/library/browse`
- `GET /api/anime/:id/rename-preview`
- `POST /api/anime/:id/rename`

### Phase 8 - Logs, Calendar, and Polish

- `GET /api/system/logs`
- `GET /api/system/logs/export`
- `DELETE /api/system/logs`
- `POST /api/system/tasks/scan`
- `GET /api/calendar`
- Optional metrics route

## Endpoint Checklist

### Auth

- `POST /api/auth/login`
- `POST /api/auth/login/api-key`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PUT /api/auth/password`
- `GET /api/auth/api-key`
- `POST /api/auth/api-key/regenerate`

### Library

- `GET /api/library/stats`
- `GET /api/library/activity`
- `GET /api/library/unmapped`
- `POST /api/library/unmapped/scan`
- `POST /api/library/unmapped/import`
- `POST /api/library/import/scan`
- `POST /api/library/import`
- `GET /api/library/browse`

### Anime

- `GET /api/anime`
- `POST /api/anime`
- `GET /api/anime/:id`
- `DELETE /api/anime/:id`
- `POST /api/anime/:id/monitor`
- `PUT /api/anime/:id/path`
- `PUT /api/anime/:id/profile`
- `PUT /api/anime/:id/release-profiles`
- `GET /api/anime/search`
- `GET /api/anime/anilist/:id`

### Episodes and Files

- `GET /api/anime/:id/episodes`
- `POST /api/anime/:id/episodes/refresh`
- `POST /api/anime/:id/episodes/scan`
- `POST /api/anime/:id/episodes/:episodeNumber/map`
- `POST /api/anime/:id/episodes/map/bulk`
- `DELETE /api/anime/:id/episodes/:episodeNumber/file`
- `GET /api/anime/:id/files`
- `GET /api/anime/:id/rename-preview`
- `POST /api/anime/:id/rename`

### Search and Downloads

- `GET /api/search/releases`
- `GET /api/search/episode/:animeId/:episodeNumber`
- `POST /api/search/download`
- `GET /api/downloads/queue`
- `GET /api/downloads/history`
- `POST /api/downloads/search-missing`
- `GET /api/wanted/missing`

### Profiles and Rules

- `GET /api/profiles`
- `GET /api/profiles/qualities`
- `POST /api/profiles`
- `PUT /api/profiles/:name`
- `DELETE /api/profiles/:name`
- `GET /api/release-profiles`
- `POST /api/release-profiles`
- `PUT /api/release-profiles/:id`
- `DELETE /api/release-profiles/:id`

### RSS and Calendar

- `GET /api/rss`
- `POST /api/rss`
- `DELETE /api/rss/:id`
- `PUT /api/rss/:id/toggle`
- `GET /api/anime/:id/rss`
- `GET /api/calendar`

### System and Events

- `GET /api/system/status`
- `GET /api/system/config`
- `PUT /api/system/config`
- `POST /api/system/tasks/scan`
- `POST /api/system/tasks/rss`
- `GET /api/system/logs`
- `GET /api/system/logs/export`
- `DELETE /api/system/logs`
- `GET /api/events`

## Rust Reference Map

Use these modules when porting feature logic:

- Router and middleware: `/home/yunyun/Dev/bakarr/src/api/mod.rs`
- App wiring and shared state: `/home/yunyun/Dev/bakarr/src/state.rs`
- Startup and background loops: `/home/yunyun/Dev/bakarr/src/lib.rs`
- Auth: `/home/yunyun/Dev/bakarr/src/api/auth.rs`
- Anime: `/home/yunyun/Dev/bakarr/src/api/anime.rs`
- Episodes: `/home/yunyun/Dev/bakarr/src/api/episodes.rs`
- Search: `/home/yunyun/Dev/bakarr/src/api/search.rs`
- Downloads: `/home/yunyun/Dev/bakarr/src/api/downloads.rs`
- RSS: `/home/yunyun/Dev/bakarr/src/api/rss.rs`
- Library/import: `/home/yunyun/Dev/bakarr/src/api/library.rs`,
  `/home/yunyun/Dev/bakarr/src/api/import.rs`
- Rename: `/home/yunyun/Dev/bakarr/src/api/rename.rs`
- Profiles: `/home/yunyun/Dev/bakarr/src/api/profiles.rs`,
  `/home/yunyun/Dev/bakarr/src/api/release_profiles.rs`
- System/logs/tasks: `/home/yunyun/Dev/bakarr/src/api/system.rs`,
  `/home/yunyun/Dev/bakarr/src/api/system/logs.rs`,
  `/home/yunyun/Dev/bakarr/src/api/tasks.rs`
- Event model: `/home/yunyun/Dev/bakarr/src/domain/events.rs`
- Core ranking logic: `/home/yunyun/Dev/bakarr/src/services/download.rs`

## Intended Improvements Over Rust

- Keep route handlers thin and push all business logic into Effect services.
- Separate persistence row types from transport DTOs.
- Make auth/session rules explicit in one middleware module instead of ad hoc
  handler checks.
- Centralize background jobs and emitted events behind a typed event bus.
- Prefer smaller feature modules over large all-in-one service files.
- Introduce shared transport contracts incrementally, starting with auth,
  system, and library read models.

## Immediate Next Build Targets

- Replace the placeholder `library_roots` feature with real auth and system
  foundations.
- Implement session + API key auth before porting deeper browser flows.
- Build the Drizzle schema around real Rust entities instead of ad hoc starter
  tables.
- Port the pure release-ranking logic early because search, RSS, and
  auto-download all depend on it.

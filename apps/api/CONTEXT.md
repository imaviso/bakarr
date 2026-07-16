# Bakarr API Domain Model

Bakarr is a single-user anime library manager. It tracks media entries, manages
unit files, downloads torrents via qBittorrent, searches releases through RSS
feeds, and matches file system folders against metadata providers.

## Domain Concepts

### Media

A tracked show (storage/API path). Has metadata (title, format, genres, studios)
sourced from AniList/AniDB/Jikan/Manami. Belongs to a root folder on disk. Has a
quality profile and release profiles. Monitored media receive automatic unit
searches.

Provider/metadata clients still speak **Anime** (`AnimeMetadata`, AniList
payloads, `mediaKind: "anime"`). Feature code uses **Media**.

### MediaUnit

A numbered unit within a media entry (episode for anime). Can be downloaded
(file mapped), aired, or missing. File mapping associates a unit number with a
disk path. Metadata includes group name, resolution, quality, codec info.

### Download

A torrent download managed by qBittorrent. Has lifecycle states (queued,
downloading, completed, failed, reconciled). Reconciliation matches
completed torrents to media+unit, maps files, and records the event.
Covered units track which unit numbers a batch download covers.

### Quality Profile

Named quality tier config (e.g. "1080p", "720p"). Has cutoff, upgrade
allowed flag, allowed qualities list, size limits. Used for release ranking.

### Release Profile

Named rule set for scoring releases (preferred/must/avoid terms). Can be
global or media-specific. Rules influence search result ranking.

### Library

Filesystem roots managed by the system. The library scan walks roots,
identifies video files, matches them to known media+units by naming
convention. Unmapped folders are subdirectories not yet matched to media.

### Unmapped Folder

A library subdirectory not yet matched to a media entry. Has match status
(pending/matching/done/failed) and optional suggested matches from search
providers. Scanned on demand with coalescing (concurrent scans deduplicate).

### RSS Feed

A per-media RSS URL for release monitoring. Background RSS worker fetches
feeds, parses releases, matches units, enqueues downloads for monitored
media.

### Search

Release search queries external RSS/indexer sources, parses results,
enriches with SeaDex quality metadata, scores by release ranking policy,
and returns ranked results. Can be triggered manually per unit or by
background workers.

### System Config

Stored config row with settings for library paths, metadata providers,
qBittorrent connection, AniDB credentials, image cache path, and general
preferences. Normalized and validated on read. Config updates trigger a
reload of background worker schedules.

### Auth

Single-user credential system with password + API key auth. Bootstrap
user created on first run. Sessions use hashed tokens with expiry and
refresh. API keys are regenerated with crypto random values.

### Events

In-process PubSub bus for SSE notifications. Publishes typed events
(Info, DownloadProgress, PasswordChanged, etc.). Subscribers receive
buffered backlog + live stream via sliding queue.

### Background Worker

Long-running scheduled tasks: download sync, library scan, metadata
refresh, RSS processing. Controlled by BackgroundWorkerController
(start/stop/reload). Uses scoped fibers with semaphore-guarded lifecycle.

### Operations Task

A tracked unit of work triggered by API calls (e.g. unmapped scan).
Has a task key, status (pending/running/completed/failed), progress,
and optional linked media. Supports coalescing concurrent requests.

## External Providers

- **AniList**: GraphQL API for anime metadata, seasonal charts
- **AniDB**: UDP protocol client for episode metadata and mappings
- **Jikan**: MyAnimeList REST API
- **Manami**: Community anime metadata project (JSON)
- **SeaDex**: Release quality guide (JSON blobs keyed by AniList ID)
- **qBittorrent**: Torrent client with Web UI API
- **RSS/Indexer**: Nyaa and other anime release feeds (XML)

## Key Architectural Decisions

- Single SQLite database, WAL mode, foreign keys enforced
- Effect-TS for all concurrency, DI, error handling, and schema validation
- Drizzle ORM for typed SQL queries
- Layer-based DI with `Effect.Service` plus explicit app-layer composition
- HTTP routes are thin adapters that call feature services
- Feature services are domain modules with explicit dependencies via tags
- Background workers run in scoped fibers under a controller
- Test integration uses real SQLite with HTTP-level assertions
- Config is env-var based with dotenv + Schema.Config validation

## Persistence Seams

- `DownloadRepository` owns Download aggregate SQL (lifecycle, sync, trigger, presentation, events, catalog history/event reads + export stream)
- `MediaUnitRepository` owns unit write paths (upsert, map, clear, probe cache, backfill, schedule/metadata sync)
- `MediaRepository` owns Media row R/W + unit reads (list/count, progress, wanted/calendar, mapped units, settings, insert aggregate, delete, monitored ids)
- `RssFeedRepository` owns RSS feed table SQL (list/insert/toggle/delete/lastChecked)
- `SeasonalMediaCacheRepository` owns `seasonal_anime_cache` read/write
- `AniDbUnitCacheRepository` owns AniDB episode cache table
- `SystemLogRepository` owns system log append/page/export stream SQL
- `BackgroundJobRepository` owns background job status upsert SQL
- Drizzle stays behind `Effect.Service` repository contracts (ADR-0001)
- Slice repos by aggregate, not caller workflow (ADR-0004)
- Pure codecs live next to system profiles
- Residual deepen complete — see `RESIDUAL_PLAN.md`

## Naming

- Storage/API path vocabulary is **Media** (`media` table, `/media` routes, `MediaId`)
- Feature services, repos, and domain helpers use **Media** names (`MediaQueryService`, `getMediaRow`, …)
- Keep **Anime** only for provider/metadata models and clients (`AnimeMetadata`, AniList/AniDB/Jikan/Manami APIs) and the `mediaKind: "anime"` value

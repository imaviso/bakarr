# Bakarr API Domain Model

Bakarr is a single-user anime library manager. It tracks anime entries, manages
episode files, downloads torrents via qBittorrent, searches releases through RSS
feeds, and matches file system folders against metadata providers.

## Domain Concepts

### Anime

A tracked show. Has metadata (title, format, genres, studios) sourced from
AniList/AniDB/Jikan/Manami. Belongs to a root folder on disk. Has a quality
profile and release profiles. Monitored anime receive automatic episode searches.

### Episode

A numbered unit within an anime. Can be downloaded (file mapped), aired, or
missing. File mapping associates an episode number with a disk path. Metadata
includes group name, resolution, quality, codec info.

### Download

A torrent download managed by qBittorrent. Has lifecycle states (queued,
downloading, completed, failed, reconciled). Reconciliation matches
completed torrents to anime+episode, maps files, and records the event.
Covered episodes track which episode numbers a batch download covers.

### Quality Profile

Named quality tier config (e.g. "1080p", "720p"). Has cutoff, upgrade
allowed flag, allowed qualities list, size limits. Used for release ranking.

### Release Profile

Named rule set for scoring releases (preferred/must/avoid terms). Can be
global or anime-specific. Rules influence search result ranking.

### Library

Filesystem roots managed by the system. The library scan walks roots,
identifies video files, matches them to known anime+episodes by naming
convention. Unmapped folders are subdirectories not yet matched to an anime.

### Unmapped Folder

A library subdirectory not yet matched to an anime entry. Has match status
(pending/matching/done/failed) and optional suggested matches from search
providers. Scanned on demand with coalescing (concurrent scans deduplicate).

### RSS Feed

A per-anime RSS URL for release monitoring. Background RSS worker fetches
feeds, parses releases, matches episodes, enqueues downloads for monitored
anime.

### Search

Release search queries external RSS/indexer sources, parses results,
enriches with SeaDex quality metadata, scores by release ranking policy,
and returns ranked results. Can be triggered manually per episode or by
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
and optional linked anime. Supports coalescing concurrent requests.

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
- Layer-based DI with `Context.Tag` + `Layer.effect` / `Layer.scoped`
- HTTP routes are thin adapters that call feature services
- Feature services are domain modules with explicit dependencies via tags
- Background workers run in scoped fibers under a controller
- Test integration uses real SQLite with HTTP-level assertions
- Config is env-var based with dotenv + Schema.Config validation

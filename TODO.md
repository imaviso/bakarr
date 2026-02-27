# Bakarr Backend Hardening Plan

This document turns the recent Rust backend audit findings into an execution plan.
Scope: `src/services`, `src/db`, `src/api`, and related tests/migrations.

## Goals

1. Eliminate duplicate/incorrect download decisions.
2. Prevent data integrity drift between import/download/episode state.
3. Make critical DB write paths atomic and idempotent.
4. Harden auth/session behavior and operational safety.
5. Add regression tests for all discovered failure modes.

## Guiding Principles

- Prefer correctness over convenience in automation paths.
- Never mark a release as imported unless episode state write succeeds.
- Never treat a queue attempt as success unless qBit confirms success.
- Normalize hash/path identifiers at boundaries.
- Fail loudly on impossible ID conversions instead of silently mutating wrong rows.

## Workstreams

### WS1 - Download Decision Correctness (Highest Priority)

#### 1.1 RSS uses real episode status before deciding
- Files:
  - `src/services/rss.rs`
  - `src/services/download.rs` (reuse, no behavior regression)
- Tasks:
  - Parse episode number and fetch `store.get_episode_status(anime.id, episode_number_truncated)`.
  - Pass fetched status into `DownloadDecisionService::decide_download(...)` instead of `None`.
  - Keep exact-title dedupe, but add semantic dedupe guard by `(anime_id, episode_number)` when status already downloaded and decision is reject.
- Acceptance criteria:
  - RSS does not queue alternate-title duplicates for already downloaded episodes.
  - RSS still queues valid upgrades when profile allows.
- Tests:
  - Unit test: downloaded status + lower/equal quality -> reject.
  - Unit test: downloaded status + better quality/profile upgrade -> upgrade accepted.

#### 1.2 Auto-download only marks episode as covered when queue succeeds
- Files:
  - `src/services/auto_download.rs`
- Tasks:
  - Change `queue_download_from_result(...) -> Result<bool>` where `true` means qBit enqueue + `record_download` succeeded.
  - In `process_search_result`, return `Ok(queued)` for Accept/Upgrade.
  - In `check_anime_releases`, add to `covered_episodes` only when `queued == true`.
- Acceptance criteria:
  - Failed enqueue no longer blocks further candidates for the same episode.
  - Coverage count reflects actual queued work.
- Tests:
  - Mock qBit fail path: function returns `Ok(false)` and does not mark covered.
  - Mock qBit success path: returns `Ok(true)` and marks covered.

#### 1.3 Upgrade safety: recycle old file only after new queue success
- Files:
  - `src/services/auto_download.rs`
- Tasks:
  - Reorder flow for `DownloadAction::Upgrade`: attempt queue first, then recycle old file only if queue succeeded.
  - If recycle fails after successful queue, keep warning log but do not fail queue result.
- Acceptance criteria:
  - Existing downloaded file is never removed when replacement cannot be queued.
- Tests:
  - Queue failure path keeps original file untouched.
  - Queue success + recycle success path updates recycle bin state.

#### 1.4 SeaDex finished-anime shortcut should not suppress necessary searches
- Files:
  - `src/services/auto_download.rs`
- Tasks:
  - Change `AlreadyDownloaded` meaning: only true when release is verifiably present in qBit completed state or imported file state (not just release-history hash record).
  - If only history exists but not present/complete, continue normal missing-episode search.
- Acceptance criteria:
  - Stale history rows do not permanently suppress episode search.
- Tests:
  - History-only hash returns `Skipped` (or equivalent continue behavior).
  - Verified present batch returns short-circuit `true`.

---

### WS2 - Import/Status Data Integrity (Highest Priority)

#### 2.1 Propagate episode status write failures during import
- Files:
  - `src/services/monitor.rs`
- Tasks:
  - Make `finalize_single_import(...) -> anyhow::Result<()>`.
  - Bubble errors to caller (`execute_single_import`, `import_single_file`, `import_directory`).
  - In `finalize_import_result`, call `set_imported(entry.id, true)` only after successful import + status update.
- Acceptance criteria:
  - No state where `release_history.imported = true` while episode status remains undownloaded due to swallowed errors.
- Tests:
  - Simulated `mark_episode_downloaded` failure keeps `imported=false`.
  - Success path sets both imported and episode downloaded state.

#### 2.2 Make episode file-path reassignment atomic
- Files:
  - `src/db/repositories/episode.rs`
- Tasks:
  - Wrap `mark_downloaded` clear-old-path + upsert-new-status in one DB transaction.
  - Ensure rollback if either statement fails.
- Acceptance criteria:
  - No partial remap state on failure.
- Tests:
  - Transaction rollback test with forced second-step failure.

---

### WS3 - Consistency and Boundary Normalization

#### 3.1 Normalize blocklist hashes to lowercase everywhere
- Files:
  - `src/db/repositories/download.rs`
  - `src/services/monitor.rs`
  - `src/services/search.rs`
  - `src/services/auto_download.rs`
- Tasks:
  - Lowercase on insert (`add_to_blocklist`) and on query (`is_blocked`, `get_by_hash`).
  - Ensure callers pass/compare normalized values.
- Acceptance criteria:
  - Same hash matches regardless of source casing.
- Tests:
  - Insert uppercase hash, query lowercase (and inverse) both hit.

#### 3.2 Harden remote path mapping boundaries
- Files:
  - `src/services/monitor.rs`
- Tasks:
  - Replace naive `starts_with` with segment-aware matching:
    - exact match, or prefix followed by path separator.
  - Normalize separators before comparison for mixed environments.
- Acceptance criteria:
  - Mapping `/downloads` does not rewrite `/downloads2`.
- Tests:
  - Positive and negative boundary cases.

---

### WS4 - DB/API Correctness and Safety

#### 4.1 Remove lossy `i64 -> i32` fallback in RSS repository
- Files:
  - `src/db/repositories/rss.rs`
  - callers in service/api as needed
- Tasks:
  - Replace `unwrap_or(i32::MAX)` conversions with explicit error return on overflow.
  - Surface as validation/not-found style errors in service/API layer.
- Acceptance criteria:
  - Out-of-range IDs are rejected; no accidental operations on ID `2147483647`.
- Tests:
  - Overflow ID returns error and does not mutate DB.

#### 4.2 Make search cache write path idempotent under concurrency
- Files:
  - `src/db/migrator/*` (new migration)
  - `src/db/repositories/cache.rs`
- Tasks:
  - Add migration to deduplicate existing `search_cache.query` rows and add unique index/constraint.
  - Switch cache writes to upsert (`ON CONFLICT(query) DO UPDATE ...`).
- Acceptance criteria:
  - Concurrent writes for same query produce one logical row.
  - `get_cached_search().one()` is deterministic.
- Tests:
  - Concurrency-ish test: repeated writes produce one effective cache row.

---

### WS5 - Security Hardening

#### 5.1 Session cookie secure flag from config/environment
- Files:
  - `src/api/mod.rs`
  - `src/config.rs` (if new config key needed)
- Tasks:
  - Set secure cookies by default in non-dev environments.
  - Provide explicit config override for local development.
- Acceptance criteria:
  - Production deployments use `Secure` cookies by default.

#### 5.2 Restrict API key query parameter usage
- Files:
  - `src/api/auth.rs`
  - `src/api/events.rs` (if SSE-specific alternative is needed)
- Tasks:
  - Disable generic `?api_key=` auth by default.
  - If SSE requires token-in-query fallback, scope it only to SSE endpoint and document risk.
- Acceptance criteria:
  - API key is not accepted via query for normal endpoints.

---

### WS6 - Observability and Failure Transparency

#### 6.1 Do not emit empty SSE payloads on serialization failure
- Files:
  - `src/api/events.rs`
- Tasks:
  - Replace `unwrap_or_default()` with explicit error handling:
    - log serialization error,
    - skip event or emit typed error event.
- Acceptance criteria:
  - Serialization failures are visible in logs and do not silently degrade into blank event payloads.

## Execution Order

1. WS1 + WS2 (correctness and data integrity first).
2. WS3 (normalization and path boundary safety).
3. WS4 (DB/API robustness, migration included).
4. WS5 (security hardening).
5. WS6 (observability polish).

## Suggested PR Breakdown

1. PR-A: RSS/auto-download correctness (WS1.1, WS1.2, WS1.3).
2. PR-B: SeaDex shortcut fix + tests (WS1.4).
3. PR-C: Monitor import integrity + episode transaction (WS2.1, WS2.2).
4. PR-D: Hash normalization + path mapping boundaries (WS3).
5. PR-E: RSS ID overflow handling + search cache migration/upsert (WS4).
6. PR-F: Auth/session hardening + SSE serialization handling (WS5, WS6).

## Validation Matrix

- Unit tests:
  - Download decision edge cases.
  - Hash normalization behavior.
  - Path mapping boundary matching.
- Integration tests:
  - Import pipeline consistency between `release_history` and `episode_status`.
  - Search cache idempotency behavior.
  - RSS feed lifecycle with invalid IDs.
- Manual verification:
  - Run daemon with qBit disconnected and verify auto-download does not report false coverage.
  - Simulate failed import metadata/status write and verify imported flag stays false.
  - Validate auth via header/session and verify query key policy.

## Commands to Run Per PR

- `cargo fmt`
- `cargo clippy`
- `cargo test`
- Optional targeted runs for touched modules:
  - `cargo test services::`
  - `cargo test db::repositories::`
  - `cargo test api::`

## Definition of Done

- All acceptance criteria in each work item are met.
- New and updated tests pass locally.
- No regressions in download/import scheduling behavior.
- Migrations are reversible where applicable and safe on existing data.
- Logs clearly show failure reasons instead of swallowing critical errors.

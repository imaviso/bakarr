# Known Gaps

Pre-release alpha: tracked issues that are real but not yet scheduled. Promote
to work when picked up; delete the entry when done.

## Torrent sync status clobbering across shared info_hash rows

`apps/api/src/features/operations/download/download-torrent-sync-service.ts`
builds `existingDownloadsMap` keyed by info_hash (last row wins), while
`bulkUpdateTorrentSyncRows` updates **all** rows matching a hash via
`inArray(downloads.infoHash, ...)`. Since migration 0031 allows several rows
per info_hash (terminal + in-flight attempt), the `preservedImported` decision
of one row drives the status CASE for every row sharing that hash — a
re-queued download can be flipped back to `imported` by an older terminal row,
or vice versa.

Impact: presentation/status only today (reconcile itself now claims by
download id — see `claimDownloadReconciliation`), but the sync pass should
decide `preservedImported` per row, not per hash.

Sketch of fix:

- `listDownloadsByInfoHashes` already returns every row; group by hash and
  pick the row to mirror per-torrent deterministically (e.g. newest
  non-imported row, else newest row), and make the bulk update target row ids
  instead of info hashes.

Verification: extend a `main_test.ts` sync test with two rows sharing one
info_hash (one `imported`, one `queued`) and assert each row keeps its own
status after a sync pass.

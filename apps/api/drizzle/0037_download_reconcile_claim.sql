-- Explicit reconciliation claim columns. `reconciled_at` keeps only finalized
-- import timestamps; in-flight claims live in `reconcile_claim` (opaque token)
-- with `reconcile_claimed_at`, so readers no longer branch on token prefixes.
ALTER TABLE `downloads` ADD `reconcile_claim` text;
--> statement-breakpoint
ALTER TABLE `downloads` ADD `reconcile_claimed_at` text;
--> statement-breakpoint
-- Backfill: migrations run at startup before any reconcile fiber exists, so a
-- leftover `claim:` token is orphaned by definition. Move it to the claim
-- column with an epoch timestamp so the first sync sweep releases it.
UPDATE `downloads` SET `reconcile_claim` = `reconciled_at`, `reconcile_claimed_at` = '1970-01-01T00:00:00.000Z', `reconciled_at` = NULL WHERE `reconciled_at` LIKE 'claim:%';

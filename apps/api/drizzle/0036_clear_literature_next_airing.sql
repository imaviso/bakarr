-- Clear fabricated anime airing state from literature rows. Manga/LN volumes
-- have no weekly broadcast cadence and AniList exposes no per-volume dates,
-- so previously inferred next-airing values are wrong.
UPDATE `media` SET `next_airing_at` = NULL, `next_airing_unit` = NULL WHERE `media_kind` != 'anime';

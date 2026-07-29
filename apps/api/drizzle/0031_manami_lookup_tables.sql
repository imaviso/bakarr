CREATE TABLE manami_anilist_lookup (
  anilist_id INTEGER PRIMARY KEY NOT NULL,
  mal_id INTEGER,
  title TEXT NOT NULL,
  english_title TEXT,
  native_title TEXT
);

CREATE TABLE manami_mal_lookup (
  mal_id INTEGER PRIMARY KEY NOT NULL,
  anilist_id INTEGER,
  title TEXT NOT NULL,
  english_title TEXT,
  native_title TEXT
);

CREATE VIRTUAL TABLE manami_search USING fts5(
  anilist_id UNINDEXED,
  mal_id UNINDEXED,
  title,
  english_title,
  native_title,
  synonyms
);

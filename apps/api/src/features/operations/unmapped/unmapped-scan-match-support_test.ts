import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import * as schema from "@/db/schema.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { ExternalIdMapRepository } from "@/features/media/metadata/external-id-map-repository.ts";
import { TenraiClient } from "@/features/media/metadata/tenrai.ts";
import type { TenraiNormalizedSeasonalEntry } from "@/features/media/metadata/tenrai-model.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { matchSingleUnmappedFolder } from "@/features/operations/unmapped/unmapped-scan-match-support.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { makeMediaRepository } from "@/test/repository-factories.ts";

it.effect("matchSingleUnmappedFolder falls back to Tenrai when AniList fails", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        const tenraiEntries: Array<TenraiNormalizedSeasonalEntry> = [
          {
            coverImage: undefined,
            unitCount: 28,
            format: "TV",
            genres: ["Adventure"],
            malId: 52991,
            season: undefined,
            seasonYear: undefined,
            startYear: undefined,
            status: "Finished Airing",
            title: { romaji: "Sousou no Frieren" },
          },
        ];

        const layer = Layer.mergeAll(
          Layer.succeed(
            AniListClient,
            AniListClient.of({
              getAnimeMetadataById: () => Effect.succeed(Option.none()),
              getSeasonalAnime: () => Effect.succeed([]),
              resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
              searchAnimeMetadata: () =>
                Effect.fail(
                  ExternalCallError.make({
                    cause: new Error("AniList is down"),
                    message: "AniList search failed",
                    operation: "anilist.search.response",
                  }),
                ),
            }),
          ),
          Layer.succeed(
            TenraiClient,
            TenraiClient.of({
              getAnimeByMalId: () => Effect.succeed(Option.none()),
              getSeasonalAnime: () => Effect.succeed([]),
              searchAnime: () => Effect.succeed(tenraiEntries),
            }),
          ),
          Layer.succeed(
            ExternalIdMapRepository,
            ExternalIdMapRepository.of({
              loadByEitherIds: () => Effect.succeed([]),
              deleteByAniListId: () => Effect.void,
              loadByAnidbAid: () => Effect.succeed(Option.none()),
              loadByAniListId: () => Effect.succeed(Option.none()),
              loadByEitherId: () => Effect.succeed(Option.none()),
              loadByMalId: () => Effect.succeed(Option.none()),
              upsert: () => Effect.void,
            }),
          ),
          Layer.succeed(MediaRepository, makeMediaRepository(db, client)),
        );

        const result = yield* Effect.gen(function* () {
          return yield* matchSingleUnmappedFolder({
            aniList: yield* AniListClient,
            animeRows: [],
            folder: {
              match_attempts: 0,
              match_status: "pending",
              media_kind: "anime",
              name: "Sousou no Frieren",
              path: "/library/Sousou no Frieren",
              size: 0,
              suggested_matches: [],
            },
            idMap: yield* ExternalIdMapRepository,
            mediaRepository: yield* MediaRepository,
            nowIso: () => Effect.succeed("2024-01-01T00:00:00.000Z"),
            tenrai: yield* TenraiClient,
          });
        }).pipe(Effect.provide(layer));

        assert.deepStrictEqual(
          result.suggested_matches.map((match) => [
            Number(match.id),
            match.id_space,
            match.title.romaji,
          ]),
          [[52991, "mal", "Sousou no Frieren"]],
        );
      }),
    schema,
  }),
);

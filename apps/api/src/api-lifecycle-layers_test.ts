import { Effect, Layer } from "effect";
import { Redacted } from "effect";

import { makeApiLifecycleLayers } from "@/api-lifecycle-layers.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import { BackgroundWorkerController } from "@/background-controller-core.ts";
import { assert, it } from "@/test/vitest.ts";

it.effect("api lifecycle app layer resolves background controller and anilist overrides", () =>
  Effect.gen(function* () {
    const aniListLayer = Layer.succeed(AniListClient, {
      getAnimeMetadataById: (_id: number) => Effect.succeed(null),
      searchAnimeMetadata: (_query: string) => Effect.succeed([]),
    });

    const { appLayer } = makeApiLifecycleLayers(
      {
        bootstrapPassword: Redacted.make("admin"),
        bootstrapUsername: "admin",
        databaseFile: `/tmp/bakarr-lifecycle-test-${crypto.randomUUID()}.sqlite`,
        port: 9999,
      },
      { aniListLayer },
    );

    const controller = yield* BackgroundWorkerController.pipe(Effect.provide(appLayer));
    const started = yield* controller.isStarted();

    assert(controller);
    assert(started === false);
  }),
);

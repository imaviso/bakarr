import { assert, it } from "@effect/vitest";

import { SeasonEpisodeIdentity, DailyEpisodeIdentity } from "@/infra/media/identity/model.ts";
import {
  rankAnimeCandidates,
  resolveSourceIdentityToEpisodeNumbers,
} from "@/infra/media/identity/ranking.ts";

it("resolveSourceIdentityToEpisodeNumbers maps daily identities through episode air dates", () => {
  const resolved = resolveSourceIdentityToEpisodeNumbers({
    anime: { id: 10, title_romaji: "Show" },
    episodes: [
      { aired: "2025-03-14", number: 7 },
      { aired: "2025-03-21", number: 8 },
    ],
    source_identity: new DailyEpisodeIdentity({
      air_dates: ["2025-03-14"],
      label: "2025-03-14",
      scheme: "daily",
    }),
  });

  assert.deepStrictEqual(resolved?.anime_id, 10);
  assert.deepStrictEqual(resolved?.episode_numbers, [7]);
  assert.deepStrictEqual(resolved?.primary_episode_number, 7);
});

it("resolveSourceIdentityToEpisodeNumbers allows S00 only for special-like entries", () => {
  const identity = new SeasonEpisodeIdentity({
    episode_numbers: [1],
    label: "S00E01",
    scheme: "season",
    season: 0,
  });

  assert.deepStrictEqual(
    resolveSourceIdentityToEpisodeNumbers({
      anime: { id: 1, title_romaji: "Show" },
      episodes: [],
      source_identity: identity,
    }),
    undefined,
  );
  assert.deepStrictEqual(
    resolveSourceIdentityToEpisodeNumbers({
      anime: { format: "SPECIAL", id: 2, title_romaji: "Show Special" },
      episodes: [],
      source_identity: identity,
    })?.episode_numbers,
    [1],
  );
});

it("rankAnimeCandidates prefers sequel and specials hints over loose title matches", () => {
  const sequel = rankAnimeCandidates({
    candidates: [
      { id: 1, title_romaji: "Overlord" },
      { id: 2, title_romaji: "Overlord II" },
    ],
    parsed: {
      kind: "episode",
      parsed_title: "Overlord",
      source_identity: new SeasonEpisodeIdentity({
        episode_numbers: [3],
        label: "S02E03",
        scheme: "season",
        season: 2,
      }),
    },
  });

  assert.deepStrictEqual(sequel?.id, 2);

  const special = rankAnimeCandidates({
    candidates: [
      { format: "TV", id: 1, title_romaji: "Show" },
      { format: "OVA", id: 2, title_romaji: "Show OVA" },
    ],
    context: { is_specials_folder: true },
    parsed: { kind: "episode", parsed_title: "Show" },
  });

  assert.deepStrictEqual(special?.id, 2);
});

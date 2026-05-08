import { describe, expect, it } from "vitest";
import { buildDownloadSourceMetadata, buildParsedEpisodeIdentity } from "./download";

describe("release download metadata", () => {
  it("prefers daily identity when air date and episode numbers both exist", () => {
    expect(
      buildParsedEpisodeIdentity({
        parsedAirDate: "2026-01-02",
        parsedEpisodeLabel: "2026-01-02",
        parsedEpisodeNumbers: [12],
      }),
    ).toEqual({
      air_dates: ["2026-01-02"],
      label: "2026-01-02",
      scheme: "daily",
    });
  });

  it("omits parsed identity when there is no user-visible label", () => {
    expect(
      buildParsedEpisodeIdentity({ parsedAirDate: "2026-01-02", parsedEpisodeNumbers: [1] }),
    ).toBeUndefined();
  });

  it("keeps false and zero metadata values", () => {
    expect(
      buildDownloadSourceMetadata({
        chosenFromSeaDex: false,
        isSeaDex: false,
        parsedTitle: "Show - 01",
        previousScore: 0,
        remake: false,
        selectionKind: "manual",
        selectionScore: 0,
        trusted: false,
      }),
    ).toEqual({
      chosen_from_seadex: false,
      is_seadex: false,
      parsed_title: "Show - 01",
      previous_score: 0,
      remake: false,
      selection_kind: "manual",
      selection_score: 0,
      trusted: false,
    });
  });
});

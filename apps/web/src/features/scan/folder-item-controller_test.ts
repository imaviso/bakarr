import { describe, expect, it } from "vitest";

import { brandMediaId } from "@bakarr/shared";
import type { MediaSearchResult } from "~/api/contracts";
import { buildAddMediaRequestFromFolderMatch } from "~/features/scan/folder-item-controller";

describe("buildAddMediaRequestFromFolderMatch", () => {
  it("preserves light novel media kind when adding a folder match", () => {
    const media = {
      id: brandMediaId(12_345),
      media_kind: "light_novel",
      title: { romaji: "Example Light Novel" },
    } satisfies MediaSearchResult;

    expect(buildAddMediaRequestFromFolderMatch(media, "Default", "/library/Novel")).toEqual({
      id: 12_345,
      media_kind: "light_novel",
      monitor_and_search: false,
      monitored: true,
      profile_name: "Default",
      release_profile_ids: [],
      root_folder: "/library/Novel",
      use_existing_root: true,
    });
  });
});

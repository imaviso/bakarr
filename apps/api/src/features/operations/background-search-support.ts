import { makeBackgroundSearchMissingSupport } from "./background-search-missing-support.ts";
import { makeBackgroundSearchRssSupport } from "./background-search-rss-support.ts";
import {
  makeBackgroundSearchSupportShared,
  type BackgroundSearchSupportInput,
} from "./background-search-support-shared.ts";

export function makeBackgroundSearchSupport(input: BackgroundSearchSupportInput) {
  const shared = makeBackgroundSearchSupportShared(input);
  const missingSupport = makeBackgroundSearchMissingSupport(input, shared);
  const rssSupport = makeBackgroundSearchRssSupport(input, shared);

  return {
    runRssCheck: rssSupport.runRssCheck,
    triggerSearchMissing: missingSupport.triggerSearchMissing,
  };
}

import { HttpRouter } from "@effect/platform";

import { downloadsRouter } from "./operations-downloads-router.ts";
import { libraryRouter } from "./operations-library-router.ts";
import { rssRouter } from "./operations-rss-router.ts";
import { searchRouter } from "./operations-search-router.ts";

export const operationsRouter = HttpRouter.concatAll(
  downloadsRouter,
  rssRouter,
  libraryRouter,
  searchRouter,
);

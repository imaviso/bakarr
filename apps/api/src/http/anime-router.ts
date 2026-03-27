import { HttpRouter } from "@effect/platform";

import { animeReadRouter } from "./anime-read-router.ts";
import { animeStreamRouter } from "./anime-stream-router.ts";
import { animeWriteRouter } from "./anime-write-router.ts";

export const animeRouter = HttpRouter.concatAll(
  animeReadRouter,
  animeWriteRouter,
  animeStreamRouter,
);

import { HttpRouter } from "@effect/platform";

import { animeReadRouter } from "@/http/anime-read-router.ts";
import { animeStreamRouter } from "@/http/anime-stream-router.ts";
import { animeWriteRouter } from "@/http/anime-write-router.ts";

export const animeRouter = HttpRouter.concatAll(
  animeReadRouter,
  animeWriteRouter,
  animeStreamRouter,
);

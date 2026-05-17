import { HttpRouter } from "@effect/platform";

import { animeReadRouter } from "@/http/media/read-router.ts";
import { animeStreamRouter } from "@/http/media/stream-router.ts";
import { animeWriteRouter } from "@/http/media/write-router.ts";

export const animeRouter = HttpRouter.concatAll(
  animeReadRouter,
  animeWriteRouter,
  animeStreamRouter,
);

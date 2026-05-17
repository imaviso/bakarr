import { HttpRouter } from "@effect/platform";

import { mediaReadRouter } from "@/http/media/read-router.ts";
import { mediaStreamRouter } from "@/http/media/stream-router.ts";
import { mediaWriteRouter } from "@/http/media/write-router.ts";

export const mediaRouter = HttpRouter.concatAll(
  mediaReadRouter,
  mediaWriteRouter,
  mediaStreamRouter,
);

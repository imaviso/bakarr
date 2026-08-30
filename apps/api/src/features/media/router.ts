import { HttpRouter } from "@effect/platform";

import { mediaReadRouter } from "@/features/media/read-router.ts";
import { mediaStreamRouter } from "@/features/media/stream-router.ts";
import { mediaWriteRouter } from "@/features/media/write-router.ts";

export const mediaRouter = HttpRouter.concatAll(
  mediaReadRouter,
  mediaWriteRouter,
  mediaStreamRouter,
);

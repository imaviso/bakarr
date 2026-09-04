import { mediaReadRouter } from "@/features/media/read-router.ts";
import { mediaStreamRouter } from "@/features/media/stream-router.ts";
import { mediaWriteRouter } from "@/features/media/write-router.ts";
import { Layer } from "effect";

export const mediaRouter = Layer.mergeAll(mediaReadRouter, mediaWriteRouter, mediaStreamRouter);

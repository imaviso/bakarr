import { mediaReadRoutes } from "@/http/media/read-router.ts";
import { mediaStreamRoutes } from "@/http/media/stream-router.ts";
import { mediaWriteRoutes } from "@/http/media/write-router.ts";

export const mediaRoutes = [...mediaReadRoutes, ...mediaWriteRoutes, ...mediaStreamRoutes];

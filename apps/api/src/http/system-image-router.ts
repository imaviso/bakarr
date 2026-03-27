import { HttpRouter, HttpServerRequest } from "@effect/platform";
import { Effect } from "effect";

import { ImageAssetService } from "../features/system/image-asset-service.ts";
import { buildImageAssetResponse } from "./image-asset-response.ts";
import { authedRouteResponse } from "./router-helpers.ts";

export const systemImageRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/images/*",
    authedRouteResponse(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const { pathname } = new URL(request.url, "http://bakarr.local");
        const rawRelativePath = pathname.slice("/api/images/".length);
        return yield* (yield* ImageAssetService).resolveImageAsset(rawRelativePath);
      }),
      ({ bytes, filePath }) =>
        Effect.succeed(buildImageAssetResponse(Uint8Array.from(bytes), filePath)),
    ),
  ),
);

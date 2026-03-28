import { HttpRouter } from "@effect/platform";
import { Effect, Schema } from "effect";

import { ImageAssetService } from "../features/system/image-asset-service.ts";
import { buildImageAssetResponse } from "./image-asset-response.ts";
import { authedRouteResponse } from "./router-helpers.ts";

export const systemImageRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/images/*",
    authedRouteResponse(
      Effect.gen(function* () {
        const { "*": rawRelativePath } = yield* HttpRouter.schemaPathParams(
          Schema.Struct({ "*": Schema.String }),
        );
        return yield* (yield* ImageAssetService).resolveImageAsset(rawRelativePath);
      }),
      ({ bytes, filePath }) =>
        Effect.succeed(buildImageAssetResponse(Uint8Array.from(bytes), filePath)),
    ),
  ),
);

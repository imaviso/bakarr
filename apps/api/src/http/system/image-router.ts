import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect, Schema } from "effect";

import { ImageAssetService } from "@/features/system/image-asset-service.ts";
import { contentType } from "@/http/shared/route-fs.ts";
import { authedRouteResponse } from "@/http/shared/router-helpers.ts";

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
        Effect.succeed(
          HttpServerResponse.uint8Array(Uint8Array.from(bytes), {
            contentType: contentType(filePath),
            headers: { "Cache-Control": "public, max-age=31536000, immutable" },
          }),
        ),
    ),
  ),
);

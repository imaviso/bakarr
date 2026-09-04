import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { Effect, Layer, Schema } from "effect";

import { ImageAssetService } from "@/features/system/image-asset-service.ts";
import { contentType } from "@/infra/http/route-fs.ts";
import { authedRouteResponse } from "@/infra/http/router-helpers.ts";

export const systemImageRouter = Layer.mergeAll(
  HttpRouter.add(
    "GET",
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
            headers: { "Cache-Control": "private, max-age=31536000, immutable" },
          }),
        ),
    ),
  ),
);

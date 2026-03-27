import { HttpServerResponse } from "@effect/platform";

import { contentType } from "./route-fs.ts";

export function buildImageAssetResponse(bytes: Uint8Array, filePath: string) {
  return HttpServerResponse.uint8Array(bytes, {
    contentType: contentType(filePath),
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

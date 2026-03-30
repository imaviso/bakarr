import { HttpServerResponse } from "@effect/platform";

export interface EmbeddedWebAsset {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly size: number;
}

export function createEmbeddedWebResponse(input: {
  readonly assets: Record<string, EmbeddedWebAsset>;
  readonly method: string;
  readonly pathname: string;
}) {
  if (input.method !== "GET" && input.method !== "HEAD") {
    return HttpServerResponse.text("Method Not Allowed", { status: 405 });
  }

  const normalized = input.pathname === "/" ? "index.html" : input.pathname.slice(1);
  const requestedAsset = normalized.length === 0 ? undefined : input.assets[normalized];

  if (requestedAsset) {
    return createAssetResponse({
      asset: requestedAsset,
      cacheControl: normalized.startsWith("assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
      method: input.method,
    });
  }

  if (normalized.startsWith("assets/") || /\.[A-Za-z0-9]+$/.test(normalized)) {
    return HttpServerResponse.text("Static asset not found", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      status: 404,
    });
  }

  const appShell = input.assets["index.html"];

  if (!appShell) {
    return bundleUnavailableResponse();
  }

  return createAssetResponse({
    asset: appShell,
    cacheControl: "no-cache",
    method: input.method,
  });
}

function createAssetResponse(input: {
  readonly asset: EmbeddedWebAsset;
  readonly cacheControl: string;
  readonly method: string;
}) {
  const headers = {
    "Cache-Control": input.cacheControl,
    "Content-Length": String(input.asset.size),
    "Content-Type": input.asset.contentType,
  };

  if (input.method === "HEAD") {
    return HttpServerResponse.empty({ headers });
  }

  return HttpServerResponse.uint8Array(input.asset.body, { headers });
}

export function bundleUnavailableResponse() {
  return HttpServerResponse.text(
    "Frontend bundle unavailable. Build apps/web and run `bun run --cwd apps/api generate:embedded-artifacts`.",
    {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      status: 503,
    },
  );
}

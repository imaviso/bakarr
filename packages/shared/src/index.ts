// Shared API/UI wire contracts. Domain leaves own the schemas; this file
// relays their identity for the `@bakarr/shared` entry point.
export * from "./ids.ts";
export * from "./auth.ts";
export * from "./media.ts";
export * from "./rss.ts";
export * from "./source-metadata.ts";
export * from "./download.ts";
export * from "./library.ts";
export * from "./system-status.ts";
export * from "./profiles.ts";
export * from "./config.ts";
export * from "./jobs.ts";
export * from "./tasks.ts";
export * from "./events.ts";
export * from "./dashboard.ts";
export * from "./browse.ts";
export * from "./parsed-identity.ts";
export * from "./naming.ts";
export * from "./file-mapping.ts";
export * from "./scan-import.ts";
export * from "./download-action.ts";
export * from "./search.ts";
export * from "./media-search.ts";
export * from "./seasonal.ts";
export * from "./unmapped.ts";
export * from "./download-status.ts";
export * from "./notification.ts";

import { Schema } from "effect";

export type ApiResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

export function ApiResultSchema<A, I, R>(
  data: Schema.Codec<A, I, R>,
): Schema.Codec<ApiResult<A>, ApiResult<I>, R> {
  return Schema.Union([
    Schema.Struct({
      ok: Schema.Literal(true),
      data,
    }),
    Schema.Struct({
      ok: Schema.Literal(false),
      error: Schema.String,
    }),
  ]);
}

export interface HealthStatus {
  status: "ok";
}

export const HealthStatusSchema = Schema.Struct({
  status: Schema.Literal("ok"),
});

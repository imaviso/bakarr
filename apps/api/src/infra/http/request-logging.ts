import { Cause, Clock, Context, Effect, Exit } from "effect";
import * as HttpMiddleware from "effect/unstable/http/HttpMiddleware";
import * as HttpServerError from "effect/unstable/http/HttpServerError";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { errorCategory } from "@/infra/logging.ts";
import { randomUuid } from "@/infra/random.ts";

interface RequestLogContext {
  errorKind?: string;
  userId?: number;
}

// Optional diagnostics only: route helpers also run outside HTTP middleware in tests.
export const CurrentRequestLog = Context.Reference<RequestLogContext | undefined>(
  "@bakarr/http/CurrentRequestLog",
  { defaultValue: () => undefined },
);

/** One completion event per handler, not a measurement of streamed body delivery. */
export const withRequestLogging = <E, R>(
  route: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const requestId = yield* randomUuid();
    const startedAt = yield* Clock.currentTimeMillis;
    const context: RequestLogContext = {};
    const httpPath = requestPathname(request.url);

    return yield* route.pipe(
      Effect.map((response) => HttpServerResponse.setHeader(response, "x-request-id", requestId)),
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          const interrupted = Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause);
          const status = interrupted ? 499 : HttpServerError.exitResponse(exit).status;
          const outcome = interrupted
            ? "interrupted"
            : status >= 500
              ? "error"
              : status >= 400
                ? "client_error"
                : "success";
          const durationMs = (yield* Clock.currentTimeMillis) - startedAt;
          yield* (
            status >= 500
              ? Effect.logError("HTTP request completed")
              : Effect.logInfo("HTTP request completed")
          ).pipe(
            Effect.annotateLogs({
              event: "http.request.completed",
              http_status: status,
              durationMs,
              outcome,
              error_kind:
                context.errorKind ??
                (Exit.isFailure(exit) && !interrupted ? errorCategory(exit.cause) : undefined),
              userId: context.userId,
            }),
          );
        }),
      ),
      Effect.provideService(CurrentRequestLog, context),
      Effect.annotateLogs({ requestId, http_method: request.method, http_path: httpPath }),
      HttpMiddleware.withLoggerDisabled,
    );
  });

/** Path without query or hash. Request URLs are origin-relative paths, so a
placeholder base is only needed for the URL parser, never logged. */
function requestPathname(url: string): string {
  return new URL(url, "http://bakarr.local").pathname;
}

# API logging

Runtime diagnostics use Effect logging and one JSON console logger. Persisted system logs are user-facing activity history, not a second runtime diagnostic sink. Optional OTLP export remains a separate destination.

## Completion events

- `http.request.completed`: one event after the HTTP handler returns or fails, including the host guard and fallback routes. Fields: `requestId`, `http_method`, `http_path`, `http_status`, `durationMs`, `outcome`, optional `userId` and `error_kind`. The middleware disables Effect's default response logger to avoid duplicate completion events. The generated request ID is returned in `x-request-id` on every handler response (inbound IDs are not trusted); interrupts send no response, so none applies there. `499` is a synthetic status for handler interruption (outcome `interrupted`), since Effect has no wire status for it.
- `external.call.completed`: one event after the retry sequence, including `operation`, optional `provider`, `pool`, actual `attempts`, `maxAttempts`, `durationMs`, and `outcome`. Retry attempts do not emit separate warnings.
- `background.worker.run.completed`: one event per run attempt. Success is Debug with `durationMs` and `outcome: "success"`; failures are Error with `outcome: "failed" | "timeout"`, `durationMs`, `timeoutMs`, `error_kind`, and typed error fields. Supervisor recovery is a separate Debug event (`background.worker.recovery.scheduled` with `backoffMs`, `error_kind`, `outcome: "failed" | "defect"`), so one failure produces one error line.

HTTP duration measures handler execution, not streamed body delivery. Background job journal records (`background_job`, `system_log`) are data, not console diagnostics; journal failures still log through `job-failure-support` and task failures through `operations.task.failed`. Operations tasks that wrap a worker run can produce two events (one per hop: `operations.task.failed` + `background.worker.run.completed`); the task event carries `taskKey`/`taskId` and the worker event carries `workerName` for correlation.

## Context and formatting

The console logger uses Effect's structured formatter and JSON formatter, retaining annotations, fiber IDs, log spans, and Redacted handling. Active trace/span IDs are included when present. No nested Effect runtimes are started inside logger callbacks.

Every console record carries a `resource` object from existing observability configuration:

- `OTEL_SERVICE_NAME`
- `OTEL_SERVICE_VERSION` (defaults to the application version)
- `OTEL_DEPLOYMENT_ENVIRONMENT` when configured
- `OTEL_RESOURCE_ATTRIBUTES` for deployment facts such as `service.instance.id`, `vcs.ref.head.revision`, and `cloud.region`

Do not invent region or commit values for local deployments. Configure those attributes when known. Never put credentials in resource attributes.

## Sensitive data

Do not log passwords, session/API/stream tokens, cookies, authorization headers, raw request bodies, or credential-bearing URLs. HTTP completion events omit query strings, headers, and raw error causes; schema failures can otherwise include submitted values. Add stable IDs/counts and error categories instead.

Use `Redacted` for sensitive values that must exist in structured context. Formatting cannot remove secrets already interpolated into plain strings. Console annotations never carry raw `Cause.pretty` trees: failures are recorded as `error_kind` plus typed `errorLogAnnotations` fields (message, name, stack). Use the shared `causeLogAnnotations(cause)` helper at `catchCause` boundaries and `errorLogAnnotations(error)` for typed `catch` values — never `String()` dumps, which hide tagged errors and can leak through interpolation. Nested error causes are summarized to one line (kind + message), never serialized wholesale: a nested object cause logs as its type name, not its JSON. RSS feed URLs go through `sanitizeRssUrlForLogs` (query stripped) before logging. Error _messages_ themselves are still operator-visible, so message construction sites must stay secret-free — never interpolate tokens, passwords, cookies, or credential-bearing URLs into error messages. The DB-backed job journal keeps its existing message semantics (`markRunFailed` still stores the full failure text); treat journal text as operator-visible too.

## Tests

- `src/infra/logging_test.ts`: runtime threshold changes, deployment/trace fields, Redacted values, error categories.
- `src/infra/http/request-logging_test.ts`: one completion event, mapped failures, request ID, secret omission, interruption.
- `src/infra/effect/retry_test.ts`: retry behavior and one completion summary with actual attempt count.
- `src/background/workers_test.ts`: worker timeout still logs a single completion event; supervisor recovery logs one Debug event without a second error.

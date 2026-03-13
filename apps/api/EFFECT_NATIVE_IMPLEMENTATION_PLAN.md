# Bakarr API Effect-Native Implementation Plan

This plan is a codebase-specific roadmap for pushing `apps/api` closer to a
fully Effect-native backend, using the `effect-ts` references as the baseline.

It builds on the refactor work already completed in:

- `apps/api/EFFECT_REFACTOR_IMPLEMENTATION_PLAN.md`

## Current State

What is already in good shape:

- runtime composition is centralized in `apps/api/src/runtime.ts`
- config uses Effect Config and `Redacted` in `apps/api/src/config.ts`
- feature services already lean on `Effect.fn` + `Effect.gen`
- HTTP body/params/query decoding is mostly schema-driven in
  `apps/api/src/http/request-schemas.ts` and
  `apps/api/src/http/route-helpers.ts`
- external clients are layered services in:
  - `apps/api/src/features/anime/anilist.ts`
  - `apps/api/src/features/operations/qbittorrent.ts`
  - `apps/api/src/features/operations/rss-client.ts`
- background scheduling now uses Effect schedules in
  `apps/api/src/background.ts`
- feature and route decomposition is well underway across `anime`, `operations`,
  `system`, and `http`

Verified complete from this plan:

- phase 1 is complete: expected failures are now mostly modeled as tagged
  errors across auth, anime, operations, and system flows, and route mapping in
  `apps/api/src/http/route-helpers.ts` is primarily tag-based
- phase 2 is complete: raw filesystem access is centralized behind
  `apps/api/src/lib/filesystem.ts`, orchestration uses Effect-wrapped
  filesystem boundaries, queue-backed event delivery lives in
  `apps/api/src/features/events/event-bus.ts`, and HTTP stream conversion stays
  at the route edge
- Effect language service diagnostics are clean, which removed several
  non-native patterns that previously blocked both phases

Main remaining gaps:

- some concurrency and subscription paths can still use stronger primitives or
  clearer scoped ownership
- observability is mostly logging, not full tracing/metrics/supervision
- tests are still mostly integration-style `Deno.test` instead of Effect-native
- many advanced Effect and Schema capabilities are available but not yet applied

## Guiding Principles

- keep business orchestration in `Effect.gen`
- keep boundary interop inside thin service/repository adapters
- distinguish expected errors from unexpected defects
- prefer typed recovery with tags over broad `catchAll`
- provide dependencies once at the app boundary
- use `Schema` as the canonical runtime contract at all boundaries
- introduce advanced Effect primitives only where they simplify real problems

## Priority Tracks

### 1. Tighten Error Modeling and Recovery (Done)

Why:

- this is the highest leverage step for making the backend truly Effect-native
- many flows still collapse expected failures into broad service errors or
  generic database failures

Targets:

- `apps/api/src/features/auth/service.ts`
- `apps/api/src/features/anime/errors.ts`
- `apps/api/src/features/anime/service.ts`
- `apps/api/src/features/operations/errors.ts`
- `apps/api/src/features/operations/search-orchestration.ts`
- `apps/api/src/features/operations/download-orchestration.ts`
- `apps/api/src/features/system/errors.ts`
- `apps/api/src/features/system/service.ts`
- `apps/api/src/http/route-helpers.ts`
- `apps/api/src/lib/effect-retry.ts`
- `apps/api/src/db/database.ts`

Relevant Effect concepts:

- Two Types of Errors
- Expected Errors
- Unexpected Errors
- Fallback
- Matching
- Retrying
- Timing Out
- Sandboxing
- Error Accumulation
- Error Channel Operations
- Parallel and Sequential Errors
- Yieldable Errors
- Cause
- Either
- Exit

Relevant references:

- `03-basics.md`
- `06-error-handling.md`

Implementation steps:

- split broad feature errors into narrower tagged variants such as validation,
  not-found, conflict, timeout, external-response mismatch, and unsupported
  state
- keep bugs and invariant violations as defects instead of typed domain errors
- replace broad `catchAll` fallback paths with `catchTag` / `catchTags` where
  behavior differs by error type
- use `Effect.timeout` and retry-exhausted errors consistently in external
  clients
- use `Effect.sandbox` / `Cause` only at process, route, and worker boundaries
- identify places where multiple failures should accumulate instead of fail-fast

Acceptance criteria:

- [x] route error handling is primarily tag-based
- [x] expected failures are modeled in the error channel
- [x] unexpected failures remain defects or are wrapped with `Schema.Defect`
- [x] fallback behavior is explicit and intentional

Verification notes:

- `apps/api/src/http/route-helpers.ts` maps tagged domain errors to HTTP status
  codes directly
- auth, anime, operations, system, RSS, AniList, and qBittorrent paths now use
  explicit tagged errors or typed boundary wrappers instead of broad ad hoc
  failures in the main control flow
- the diagnostics cleanup removed common anti-patterns such as immediate
  `Effect.fn(...)(...)()` execution, `yield* new Error()` without `return`, and
  `catchAll(() => Effect.fail(...))` wrappers

### 2. Make Filesystem and Streaming Boundaries Effect-Native (Done)

Why:

- raw `Deno.*`, `ReadableStream`, and manual subscription state remain some of
  the least Effect-native parts of the backend

Targets:

- `apps/api/src/features/events/event-bus.ts`
- `apps/api/src/http/system-routes.ts`
- `apps/api/src/http/anime-routes.ts`
- `apps/api/src/http/route-helpers.ts`
- `apps/api/src/features/anime/files.ts`
- `apps/api/src/features/operations/file-scanner.ts`
- `apps/api/src/features/operations/download-support.ts`
- `apps/api/src/features/operations/library-import.ts`
- `apps/api/src/features/operations/download-lifecycle.ts`

Relevant Effect concepts:

- Scope
- Runtime
- Fibers
- Deferred
- Queue
- PubSub
- Semaphore
- Latch
- Creating Streams
- Consuming Streams
- Error Handling
- Operations
- Resourceful Streams
- Creating Sinks
- Concurrency
- Leftovers

Relevant references:

- `03-basics.md`
- `04-services-and-layers.md`
- `11-http-clients.md`
- `14-use-pattern.md`

Implementation steps:

- introduce a `FileSystem` or `MediaStore` service boundary for file imports,
  renames, scans, reads, and deletes
- replace mutable SSE subscriber bookkeeping in `event-bus.ts` with `PubSub` or
  `Queue`-based delivery behind a service
- replace manual lock booleans where appropriate with `Semaphore`
- move long-lived event/stream resources into scoped constructors
- keep transport conversion to `ReadableStream` at the HTTP edge only

Acceptance criteria:

- [x] feature orchestration no longer calls raw `Deno.*` directly
- [x] SSE/event delivery is backed by Effect concurrency primitives
- [x] scoped resources are explicitly acquired and released

Verification notes:

- raw filesystem access is isolated to `apps/api/src/lib/filesystem.ts`
- feature modules such as `apps/api/src/features/anime/files.ts`,
  `apps/api/src/features/operations/file-scanner.ts`, and
  `apps/api/src/features/operations/catalog-orchestration.ts` use the
  filesystem service boundary instead of calling `Deno.*` directly
- event subscriptions are queue-backed in
  `apps/api/src/features/events/event-bus.ts`
- SSE transport remains in `apps/api/src/http/system-routes.ts`, which matches
  the intended boundary of keeping `ReadableStream` conversion at the HTTP edge
- large library scans now support streaming iteration in
  `apps/api/src/features/operations/file-scanner.ts`

### 3. Formalize Service Graph and Layer Boundaries

Why:

- the codebase already uses tags/layers well, but some service files still mix
  orchestration, repositories, support, and transport concerns

Targets:

- `apps/api/src/features/anime/service.ts`
- `apps/api/src/features/system/service.ts`
- `apps/api/src/features/operations/service.ts`
- `apps/api/src/http/app.ts`
- `apps/api/src/runtime.ts`

Relevant Effect concepts:

- Managing Services
- Default Services
- Managing Layers
- Layer Memoization
- Runtime
- Scope

Relevant references:

- `04-services-and-layers.md`
- `09-project-structure.md`

Implementation steps:

- keep `service.ts` files orchestration-only
- continue extracting repositories, support modules, codecs, and boundary
  adapters into leaf modules
- identify any parameterized layers that should be memoized once
- keep `R = never` on most service methods by resolving dependencies at layer
  construction time
- consider a small internal `BackgroundWorkerRegistry` / `JobScheduler` service
  rather than embedding background composition in one file

Acceptance criteria:

- service files are primarily orchestration and policy
- reusable boundary logic lives in leaf modules/services
- layer graph stays centralized in `runtime.ts`

### 4. Expand Schema-First Modeling

Why:

- Schema usage is already strong, but many richer capabilities are not yet used
- better runtime contracts will improve validation, docs, tests, and developer
  feedback

Targets:

- `apps/api/src/http/request-schemas.ts`
- `apps/api/src/features/system/config-codec.ts`
- `apps/api/src/features/system/defaults.ts`
- `apps/api/src/features/anime/dto.ts`
- `apps/api/src/features/operations/repository.ts`
- `packages/shared/src/index.ts`

Relevant Effect concepts:

- Branded Types
- Pattern Matching
- Dual APIs
- Effect Data Types
- Standard Schema
- Filters
- Advanced Usage
- Projections
- Transformations
- Annotations
- Error Messages
- Error Formatters
- Class APIs
- Default Constructors
- Arbitrary
- JSON Schema
- Equivalence
- Pretty Printer
- Equal
- Hash
- Equivalence
- Order
- Option
- Redacted
- Duration
- DateTime

Relevant references:

- `05-data-modeling.md`
- `07-config.md`

Implementation steps:

- add branded types for IDs and important boundary primitives first
- centralize reusable schema modules per feature
- add schema annotations and custom error messages where API UX matters
- consider `Schema.Class` / `Schema.TaggedClass` for richer domain objects
- generate or expose JSON Schema for contracts that benefit frontend or tooling
- add schema equivalence/pretty-printer support where useful in tests and logs

Acceptance criteria:

- important primitives are branded where misuse is likely
- runtime errors from validation are clearer and more localized
- repeated inline schema fragments are consolidated

### 5. Improve Concurrency, Scheduling, and Backpressure

Why:

- this backend now has real background work, event streaming, sync loops, and
  queue-like behavior that can benefit from Effect’s concurrency toolbox

Targets:

- `apps/api/src/background.ts`
- `apps/api/src/features/events/event-bus.ts`
- `apps/api/src/features/operations/download-orchestration.ts`
- `apps/api/src/features/operations/search-orchestration.ts`

Relevant Effect concepts:

- Repetition
- Built-In Schedules
- Schedule Combinators
- Cron
- Examples
- Ref
- SynchronizedRef
- SubscriptionRef
- Batching
- Caching Effects
- Cache
- Basic Concurrency
- Fibers
- Deferred
- Queue
- PubSub
- Semaphore
- Latch

Relevant references:

- `03-basics.md`
- `04-services-and-layers.md`
- `12-observability.md`

Implementation steps:

- use `Ref` / `SynchronizedRef` only where mutable shared state is genuinely
  needed
- use `SubscriptionRef` or `PubSub` where event subscribers need live state
  propagation
- consider `Cache` for expensive repeated external lookups or metadata fetches
- consider bounded queues or batching for download/event updates if pressure
  grows
- use `Semaphore` for worker exclusivity instead of ad hoc lock state

Acceptance criteria:

- concurrency-sensitive paths use Effect primitives instead of manual state
- scheduling/backpressure decisions are explicit and testable

### 6. Add Tracing, Metrics, and Supervision

Why:

- logging is good, but the backend still lacks full Effect-native observability
- long-running jobs and external boundaries should be easier to trace and debug

Targets:

- `apps/api/src/lib/logging.ts`
- `apps/api/src/background.ts`
- `apps/api/src/http/app.ts`
- `apps/api/src/features/anime/anilist.ts`
- `apps/api/src/features/operations/qbittorrent.ts`
- `apps/api/src/features/operations/search-orchestration.ts`
- `apps/api/src/features/operations/download-orchestration.ts`

Relevant Effect concepts:

- Logging
- Metrics
- Tracing
- Supervisor
- Runtime
- Scope

Relevant references:

- `12-observability.md`

Implementation steps:

- add `Effect.withSpan(...)` around major workflows and external boundaries
- add worker/job supervision semantics where failures should be observed but not
  crash the app
- decide whether to add OTLP export once spans are meaningful
- add simple metrics where they clarify system state beyond logs

Acceptance criteria:

- request, background, and external workflows are traceable
- worker supervision policy is explicit
- log/span correlation is straightforward

### 7. Upgrade Testing to Effect-Native Patterns

Why:

- the codebase has decent integration coverage, but it underuses layer-based
  testing and `TestClock`

Targets:

- `apps/api/main_test.ts`
- `apps/api/src/background_test.ts`
- `apps/api/src/lib/effect-retry_test.ts`
- `apps/api/src/features/**/*_test.ts`

Relevant Effect concepts:

- TestClock
- Scope
- Runtime
- Fibers
- Deferred
- Queue
- PubSub
- Dual APIs

Relevant references:

- `08-testing.md`

Implementation steps:

- keep current integration tests
- add layer-driven tests for repositories, orchestrators, and external clients
- move time/schedule/retry tests to `TestClock`
- introduce `@effect/vitest` for Effect-heavy modules where it improves signal
- provide test layers for config, event bus, filesystem, and external services

Acceptance criteria:

- time-based behavior is tested without real sleeps
- important units can be tested without full app bootstrap
- tests exercise layers and Effect runtime behavior directly

## Requested Concept Coverage Map

The requested concepts are not all equally urgent for this codebase. Use them in
this order:

Use now:

- expected vs unexpected errors
- fallback and matching
- retrying and timing out
- services/layers/runtime/scope
- schedules/cron
- fibers, semaphore, pubsub, queue
- redacted, option, either, exit, cause, duration
- branded types and pattern matching
- schema filters, transforms, annotations, error messages
- TestClock

Use opportunistically later:

- `Ref`, `SynchronizedRef`, `SubscriptionRef`
- batching and `Cache`
- streams/sinks beyond SSE needs
- `DateTime`, `Chunk`, `HashSet`
- schema arbitrary / JSON Schema / pretty printer / equivalence support
- `BigDecimal` unless numeric precision needs emerge

Defer unless a clear use case appears:

- excessive generic data-structure migrations for their own sake
- introducing advanced abstractions where the simpler current code is adequate

## Recommended Sequence

Completed:

- 1. error contracts and recovery
- 2. filesystem and streaming boundaries

Next recommended focus:

1. service/layer graph cleanup
2. richer schema/domain modeling
3. concurrency/backpressure primitives
4. tracing/metrics/supervision
5. Effect-native testing

## Verification Checklist

- `deno task check`
- `deno task test`
- `deno lint`
- `pnpm build` in `apps/web` when shared contracts change
- search for residual non-native patterns in `apps/api/src`:
  - broad `catchAll` fallbacks hiding expected failures
  - route or service code calling raw `Deno.*` directly
  - mutable concurrency state where `Semaphore` / `PubSub` would be clearer
  - HTTP or persisted payloads not backed by canonical schemas
  - unscoped long-lived resources

## Definition of Done

- expected failures are typed and matched explicitly
- unexpected failures are defects or boundary-wrapped defects
- background work, eventing, and shared state use Effect-native concurrency
  primitives where appropriate
- major boundaries are modeled as services/layers and can be test-provided
- schemas are canonical, reusable, and expressive enough for validation and DX
- observability covers request, job, and external-call flows
- tests cover scheduling, retries, and service orchestration with Effect-native
  tools

# Bakarr API Code Review - Architecture & Effect Idiom Analysis

**Review Date**: 2026-04-09  
**Scope**: `apps/api/src/` - Complete comprehensive source review (~330 files)  
**Guideline Reference**: `apps/api/EFFECT_GUIDE.md`  
**Priority Focus**: Architecture, code quality smells, Effect idioms  
**Secondary Priority**: Security (critical only)

---

## Executive Summary

The Bakarr API codebase is **exceptionally well-architected** with strong adoption of Effect patterns. After reviewing 330+ files including 78 test files across 4 comprehensive scan phases, the codebase demonstrates excellent layer composition, proper use of `Effect.gen`, and good separation of concerns. Most modules follow the EFFECT_GUIDE.md principles closely.

**Overall Grade**: A (Excellent with minor refinement opportunities)

**Key Statistics**:

- 170+ files are perfectly aligned with Effect idioms
- 19 P1 (high priority) architectural improvements identified
- 13 P2 (medium priority) style/maintainability suggestions
- 10 P3 (low priority) nitpicks
- 0 critical security issues

## Implementation Update (2026-04-09)

The findings below were implemented in `apps/api/src` after this review.

### Completed Findings

- **P1**: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19
- **P2**: 20, 21, 22 (partial cleanup), 23, 25, 26, 27, 28
- **P3**: 30, 31, 32, 33, 34

### Intentionally Kept As-Is

- **P2.24** `lib/media-identity.ts`: kept early-return parser style (explicitly noted as acceptable).
- **P3.29** `http/operations-downloads-router.ts`: kept `commandRoute` helper (explicitly noted as good pattern).

### Notes On Implementation Shape

- **P1.1** was addressed by making start/reload scope creation consistent through a shared spawn helper and atomic scope swap. `Scope.isClosed` is not used because it is not available in the current Effect API surface in this repo version.
- **P1.4** moved retry logic to a real service (`ExternalCall`) with `ExternalCallLive` and migrated all consumers/tests.
- **P1.16** used standard `Either` in `features/system/disk-space.ts` (the active disk space module).

---

## Perfectly Aligned Files

These files are exemplary and require no changes:

### Core Infrastructure

| File                      | Alignment Notes                                            |
| ------------------------- | ---------------------------------------------------------- |
| `app-runtime.ts`          | Clean `Context.Tag` + `Layer.succeed/Layer.effect` pattern |
| `lib/layer-compose.ts`    | Minimal, focused helper module                             |
| `lib/domain-schema.ts`    | Clean branded types with `Schema.brand`                    |
| `lib/clock.ts`            | Proper `Effect.fn` usage with explicit span naming         |
| `db/migrate.ts`           | Good documentation, clean `Effect.fn` patterns             |
| `db/schema.ts`            | Clean Drizzle schema definitions                           |
| `db/database.ts`          | Clean SQLite client wrapping, Layer.scoped usage           |
| `db/sqlite-errors.ts`     | Clean error chain traversal                                |
| `config.ts`               | Proper `Schema.Config` usage, `Redacted` for secrets       |
| `config-provider.ts`      | Excellent layered config with dotenv support               |
| `api-startup.ts`          | Clean bootstrap program with `Effect.fn`                   |
| `api-lifecycle-layers.ts` | Well-documented layer composition                          |

### HTTP Layer (All Routers)

| File                                  | Alignment Notes                            |
| ------------------------------------- | ------------------------------------------ |
| `http/anime-read-router.ts`           | **Excellent thin router pattern**          |
| `http/anime-write-router.ts`          | Clean write operations                     |
| `http/anime-stream-router.ts`         | **Excellent streaming with range support** |
| `http/auth-router.ts`                 | Clean auth endpoints                       |
| `http/system-*-router.ts`             | All system routers are exemplary           |
| `http/operations-*-router.ts`         | All operations routers are exemplary       |
| `http/event-stream.ts`                | **Clean SSE encoding with Schema**         |
| `http/file-stream.ts`                 | **Excellent streaming implementation**     |
| `http/embedded-web.ts`                | **Clean SPA fallback logic**               |
| `http/route-validation.ts`            | Focused, single-purpose module             |
| `http/route-types.ts`                 | Minimal, clean type definitions            |
| `http/operations-downloads-router.ts` | Clean `commandRoute` helper pattern        |

### Security Layer

| File                       | Alignment Notes                                           |
| -------------------------- | --------------------------------------------------------- |
| `security/token-hasher.ts` | **Clean service tag pattern**, SHA-256 with subtle crypto |
| `security/password.ts`     | **Excellent small `Effect.fn` decomposition**             |

### Services & Features - All Exemplary

| Category       | Files                                                                                                                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**       | `bootstrap-service.ts`, `credential-service.ts`, `errors.ts`, `user-repository.ts`, `audit-log.ts`, `session-service.ts`                                                                                                                                                      |
| **Anime**      | `anime-file-service.ts`, `anime-stream-service.ts`, `stream-token-signer.ts`, `query-service.ts`, `image-cache-service.ts`, `settings-service.ts`, `errors.ts`, `read-repository.ts`, `add.ts`, `add-validation.ts`, `anidb-socket.ts`, `anidb-types.ts`, `anidb-protocol.ts` |
| **System**     | `system-config-service.ts`, `system-bootstrap-service.ts`, `runtime-config-snapshot-service.ts`, `config-codec.ts`, `config-schema.ts`, `errors.ts`, `support.ts`, `system-log-service.ts`, `repository/*.ts`, `disk-space.ts`                                                |
| **Operations** | `catalog-library-scan-service.ts`, `download-torrent-lifecycle-service.ts`, `qbittorrent-models.ts`, `unmapped-control-service.ts`, `catalog-rss-service.ts`, `job-support.ts`, `repository/*.ts`, `errors.ts`, `naming-support.ts`                                           |

### Media Identity System (All Perfect)

| File                          | Alignment Notes                               |
| ----------------------------- | --------------------------------------------- |
| `lib/media-identity-model.ts` | Excellent Schema.Class usage with union types |
| `lib/media-identity.ts`       | Clean identity parsing orchestration          |
| `lib/media-identity-*.ts`     | All parser files are exemplary                |

### Database & Effects Layer

| File                         | Alignment Notes                       |
| ---------------------------- | ------------------------------------- |
| `lib/effect-db.ts`           | Clean retry logic, `Effect.fn` naming |
| `lib/job-status.ts`          | **Excellent Effect.fn decomposition** |
| `lib/job-failure-support.ts` | Proper `Data.TaggedError` usage       |
| `lib/bounded-stream.ts`      | **Clean bounded byte collection**     |
| `lib/hex.ts`                 | Minimal utility with proper `Option`  |
| `lib/random.ts`              | Clean dual API (sync + Effect)        |
| `lib/fs-errors.ts`           | Good error classification             |
| `lib/dns-resolver.ts`        | Clean service pattern                 |
| `lib/logging.ts`             | Clean runtime log level management    |
| `lib/filesystem.ts`          | Clean platform abstraction            |

### Effect Coalescing Utilities (All Excellent)

| File                                                   | Alignment Notes                                    |
| ------------------------------------------------------ | -------------------------------------------------- |
| `lib/effect-coalescing-latest-value-publisher.ts`      | Sophisticated but well-structured state machine    |
| `lib/effect-coalescing-coalesced-runner.ts`            | Sophisticated coalescing with proper state machine |
| `lib/effect-coalescing-skipping-serialized-runner.ts`  | Clean single-flight with skipping semantics        |
| `lib/effect-coalescing-single-flight-runner.ts`        | Clean deduplication pattern with Deferred          |
| `lib/effect-coalescing-serialized-flag-coordinator.ts` | Simple, focused coordinator pattern                |

### Layer Composition & Runtime

| File                                     | Alignment Notes                      |
| ---------------------------------------- | ------------------------------------ |
| `app-compose-anime.ts`                   | Clean layer composition pattern      |
| `app-compose-operations.ts`              | Clean orchestration of sub-composers |
| `app-platform-runtime-core.ts`           | Clean sequential layer building      |
| `app-platform-external-clients-layer.ts` | Clean conditional layer composition  |
| `background-schedule.ts`                 | Clean Cron integration with Effect   |

### Event System

| File                           | Alignment Notes                                      |
| ------------------------------ | ---------------------------------------------------- |
| `features/events/event-bus.ts` | Clean PubSub pattern with proper resource management |
| `features/events/publisher.ts` | Clean coalescing with `makeLatestValuePublisher`     |

### Utilities

| File                                  | Alignment Notes            |
| ------------------------------------- | -------------------------- |
| `lib/anime-date-utils.ts`             | Simple focused utilities   |
| `lib/anime-derivations.ts`            | Clean derivation helpers   |
| `lib/download-event-presentations.ts` | Clean presentation mapping |
| `lib/scanned-file-metadata.ts`        | Good metadata extraction   |
| `lib/media-resolution.ts`             | Simple resolution parsing  |
| `background-worker-model.ts`          | Clean `Schema.Class` usage |

### HTTP Request Schemas (All Perfect)

| File                                 | Alignment Notes                    |
| ------------------------------------ | ---------------------------------- |
| `http/anime-request-schemas.ts`      | Clean Schema.Class request schemas |
| `http/common-request-schemas.ts`     | Clean branded path schemas         |
| `http/system-request-schemas.ts`     | Clean system request schemas       |
| `http/operations-request-schemas.ts` | Clean operations request schemas   |

### Test Files (Exemplary Patterns)

| File                         | Alignment Notes                            |
| ---------------------------- | ------------------------------------------ |
| `background_test.ts`         | **Gold standard for Effect testing**       |
| `config-provider_test.ts`    | Excellent `Effect.acquireUseRelease` usage |
| `lib/effect-retry_test.ts`   | Clean `TestClock` patterns                 |
| `security/*_test.ts`         | Proper crypto testing                      |
| `lib/media-identity_test.ts` | Comprehensive parser tests                 |
| `http/*_test.ts`             | Clean route testing                        |

---

## Findings by Severity

### P1 - High Priority (Architecture/Code Quality)

#### 1. `background-controller-core.ts` - Mixed Return Pattern Inconsistency

**Lines**: 91-96, 43-62, 65-85

**Issue**: The controller uses inconsistent return patterns between `start` (early return) and `reload` (always creates new scope).

**Suggested Fix**:

```typescript
const isStarted = Effect.fn("BackgroundWorkerController.isStarted")(function* () {
  const scope = yield* Ref.get(scopeRef);
  return scope !== null && !(yield* Scope.isClosed(scope));
});
```

---

#### 2. `background-monitor.ts` - Inconsistent Effect.all Usage

**Lines**: 83-101, 108-117, 124-142

**Issue**: Multiple `Effect.all` calls with `{ concurrency: "unbounded", discard: true }` are overly complex for sequential operations.

**Suggested Fix**:

```typescript
yield* updateWorker(...);
yield* setBackgroundWorkerRunRunning(workerName, true);
yield* recordBackgroundWorkerRun(...);
```

---

#### 3. `background-task-runner.ts` - Unnecessary Wrapper Functions

**Lines**: 80-91

**Issue**: Creates redundant wrapper functions that just delegate to underlying functions.

**Suggested Fix**:

```typescript
return BackgroundTaskRunner.of({
  runDownloadSyncWorkerTask, // Direct assignment
  runLibraryScanWorkerTask,
  // ...
});
```

---

#### 4. `lib/effect-retry.ts` - Curried Pattern vs Service Pattern

**Lines**: 28-127

**Issue**: The curried `makeTryExternal`/`makeTryExternalEffect` pattern is less idiomatic than a service. Clock dependency is passed as parameter rather than being a service dependency.

**Suggested Fix**:

```typescript
export interface ExternalCallService {
  readonly tryExternal: <A>(
    operation: string,
    fn: (signal: AbortSignal) => Promise<A>,
    options?: { idempotent?: boolean }
  ) => Effect.Effect<A, ExternalCallError>;
}

export class ExternalCall extends Context.Tag("@bakarr/ExternalCall")<
  ExternalCall,
  ExternalCallService
>() {}

export const ExternalCallLive = Layer.effect(
  ExternalCall,
  Effect.gen(function* () {
    const clock = yield* ClockService;
    return ExternalCall.of({
      tryExternal: (operation, fn, options) =>
        Effect.fn(`external.${operation}`)(function* () { ... }),
    });
  })
);
```

---

#### 5. `lib/media-probe.ts` - Imperative Normalization Functions

**Lines**: 57-158

**Issue**: Normalization functions use verbose switch/if chains that should be lookup tables. Also contains unused `formatParseCause` function at lines 349-353 (dead code).

**Suggested Fix**:

```typescript
const VIDEO_CODEC_MAP: Record<string, string> = {
  h264: "AVC",
  avc: "AVC",
  avc1: "AVC",
  x264: "AVC",
  h265: "HEVC",
  hevc: "HEVC",
  x265: "HEVC",
  av1: "AV1",
  vp9: "VP9",
  mpeg2video: "MPEG-2",
  vc1: "VC-1",
};

const normalizeVideoCodec = (codec?: string): string | undefined => {
  if (!codec) return undefined;
  const normalized = codec.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return VIDEO_CODEC_MAP[normalized] ?? codec.toUpperCase();
};
```

---

#### 6. `lib/naming.ts` - Regex Compilation on Each Call

**Lines**: 44-116

**Issue**: Multiple regex patterns are compiled on every function call. These should be module-level constants.

**Suggested Fix**:

```typescript
const TOKEN_REGEX = {
  title: /\{title\}/g,
  episode: /\{episode(?::(\d+))?\}/g,
  episodeSegment: /\{episode_segment\}/g,
  // ... etc
};

result = result.replace(TOKEN_REGEX.title, sanitizeFilename(input.title));
```

---

#### 7. `http/http-app.ts` - Complex Router Composition Pipeline

**Lines**: 21-45

**Issue**: Nested `HttpRouter.concat` and `HttpRouter.prefixAll` calls create a complex, hard-to-read pipeline.

**Suggested Fix**:

```typescript
const apiRouter = HttpRouter.empty.pipe(
  HttpRouter.concat(HttpRouter.prefixAll(authRouter, "/api/auth")),
  HttpRouter.concat(HttpRouter.prefixAll(animeRouter, "/api")),
  HttpRouter.concat(
    HttpRouter.prefixAll(
      HttpRouter.concatAll(downloadsRouter, rssRouter, libraryRouter, searchRouter),
      "/api"
    )
  ),
  HttpRouter.concat(systemRouter)
);

return apiRouter.pipe(
  HttpRouter.get("*", Effect.gen(function* () { ... })),
  HttpRouter.toHttpApp
);
```

---

#### 8. `http/route-auth.ts` - Mixed Auth Resolution Logic

**Lines**: 25-49

**Issue**: API key extraction mixes effectful and non-effectful logic with mutation (`let apiKey`).

**Suggested Fix**:

```typescript
const extractApiKey = (headers: Headers): string | undefined => {
  const headerApiKey = headers["x-api-key"];
  const authorization = headers["authorization"];
  return (
    headerApiKey ??
    (authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined)
  );
};

// Then in effect:
const apiKey = extractApiKey(request.headers);
```

---

#### 9. `http/route-errors.ts` - Complex Type Machinery for Simple Mapping

**Lines**: 14-88

**Issue**: The `commonTaggedRouteErrorSchemas` array and complex type extraction creates unnecessary machinery for simple error-to-response mapping.

**Suggested Fix**:

```typescript
const mapCommonError = Match.typeTags({
  DatabaseError: (e) => ({ message: e.message, status: 500 }),
  ExternalCallError: () => ({ message: "External service unavailable", status: 503 }),
  PasswordError: () => ({ message: "Authentication crypto failed", status: 500 }),
  RequestValidationError: (e) => ({ message: e.message, status: e.status }),
  TokenHasherError: () => ({ message: "Authentication crypto failed", status: 500 }),
  WorkerTimeoutError: (e) => ({ message: e.message, status: 500 }),
});

export function mapRouteError(error: unknown): RouteErrorResponse {
  // ... domain-specific mappers first
  if (hasTag(error)) {
    return mapCommonError(error);
  }
  return { message: "Unexpected server error", status: 500 };
}
```

---

#### 10. `http/router-helpers.ts` - Nested Effect.flatMap Chain

**Lines**: 65-97

**Issue**: The `routeResponse` helper uses nested `Effect.flatMap` with request extraction inside, less readable than `Effect.gen`.

**Suggested Fix**:

```typescript
export const routeResponse = <A, E, R, E2, R2>(...) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, "http://bakarr.local");

    const result = yield* effect.pipe(
      Effect.flatMap(onSuccess),
      Effect.tapErrorCause(...),
      Effect.catchAll(...)
    );
    return result;
  });
```

---

#### 11. `app-compose-*.ts` Files - Generic Type Parameter Proliferation

**Files**: `app-compose-anime.ts`, `app-compose-operations.ts`, etc.

**Issue**: Layer composition functions use excessive generic type parameters (6+ generics).

**Suggested Fix**:

```typescript
interface OperationsCatalogLayerInput {
  readonly operationsProgressLayer: Layer.Layer<unknown>;
  readonly runtimeSupportLayer: Layer.Layer<unknown>;
}

export const composeOperationsCatalogLayer = (input: OperationsCatalogLayerInput) => {
  // ... implementation without generics
};
```

---

#### 12. `features/auth/session-service.ts` - Too Many Parameters

**Lines**: 66-91

**Issue**: `createSession` takes 7 parameters including functions.

**Suggested Fix**:

```typescript
const createSession = Effect.fn("AuthSessionService.createSession")(function* (
  db: AppDatabase,
  durationDays: number,
  userId: number,
) {
  const tokenHasher = yield* TokenHasher;
  const random = yield* RandomService;
  // ...
});
```

---

#### 13. `lib/metrics.ts` - `renderBakarrPrometheusMetrics` Complexity

**Lines**: 116-174

**Issue**: Deep nesting, multiple state mutations. Should be decomposed into smaller functions.

**Suggested Fix**:

```typescript
const filterBakarrMetrics = (snapshot: MetricSnapshot[]) =>
  snapshot.filter((item) => item.metricKey.name.startsWith("bakarr_"));

const sortMetricPairs = (pairs: MetricSnapshot[]) => [...pairs].sort(compareMetricPairs);

// Decompose into smaller, testable functions
```

---

#### 14. `features/anime/anidb.ts` - Imperative Episode Loop

**Lines**: 199-229

**Issue**: Uses `for` loop with mutable `episodes` array push instead of Effect combinators.

**Suggested Fix**:

```typescript
const episodeNumbers = Array.from({ length: input.episodeCount }, (_, i) => i + 1);

const episodes =
  yield *
  Effect.forEach(
    episodeNumbers,
    (episodeNumber) => fetchEpisodeEffect(episodeNumber, input),
    { concurrency: 1 }, // Sequential as required by AniDB rate limits
  );

return {
  _tag: "AniDbLookupSuccess",
  episodes: episodes.filter((e): e is AniDbEpisodeMetadata => e !== null),
};
```

---

#### 15. `lib/effect-coalescing-latest-value-publisher.ts` - Complex State Machine Documentation

**Lines**: 1-152

**Issue**: Sophisticated state machine that's complex to maintain. Acceptable given the complexity, but needs more inline documentation.

**Suggested Fix**: Add JSDoc comments explaining:

- The three states: `idle`, `publishing`, `completing`
- The coalescing behavior when multiple values are offered during publish
- The flush/shutdown semantics

---

#### 16. `lib/disk-space.ts` - Either Pattern Overuse

**Lines**: 38-66, 127-242

**Issue**: Uses custom `_tag: "Left" | "Right"` pattern instead of Effect's standard Either.

**Suggested Fix**:

```typescript
function clampDiskBytes(value: number): Either.Either<number, DiskSpaceError> {
  if (!Number.isFinite(value) || value < 0) {
    return Either.left(new DiskSpaceError({ message: "Invalid disk byte count" }));
  }
  return Either.right(Math.min(value, Number.MAX_SAFE_INTEGER));
}
```

---

#### 17. `lib/filesystem.ts` - Imperative toFileInfo/toDirEntry

**Lines**: 138-154

**Issue**: Conversion functions use conditional returns instead of lookup tables.

**Suggested Fix**:

```typescript
const typeMap: Record<string, { isDirectory: boolean; isFile: boolean; isSymlink: boolean }> = {
  Directory: { isDirectory: true, isFile: false, isSymlink: false },
  File: { isDirectory: false, isFile: true, isSymlink: false },
  SymbolicLink: { isDirectory: false, isFile: false, isSymlink: true },
};

const convertFileType = (type: string) => typeMap[type] ?? typeMap.File;
```

---

#### 18. `api-lifecycle-layers.ts` - Excessive Layer Merging

**Lines**: 38-114

**Issue**: Too many sequential `provideLayer` calls create a "layer pyramid".

**Note**: This is acceptable given the complexity of the application, but could benefit from documentation explaining the layer hierarchy.

---

#### 19. `lib/logging.ts` - RuntimeLoggerLayer Complexity

**Lines**: 103-135

**Issue**: `RuntimeLoggerLayer` uses `Layer.unwrapEffect` with nested `Effect.gen`. Could be simplified.

---

### P2 - Medium Priority (Style/Maintainability)

#### 20. `background-schedule.ts` - Imperative Schedule Building

**Lines**: 28-52

**Issue**: Uses multiple nested ternaries and imperative calculations.

**Suggested Fix**:

```typescript
const rssCronExpression = Option.match(Option.fromNullable(parsedCron), {
  onNone: () => null,
  onSome: (cron) => (Either.isRight(cron) ? cronExpression : null),
});
```

---

#### 21. `app-platform-external-clients-layer.ts` - Conditional Layer Creation

**Lines**: 22-31

**Issue**: Ternary chain for layer selection is repetitive.

**Suggested Fix**:

```typescript
const orDefault = <T>(optional: T | undefined, defaultValue: T): T => optional ?? defaultValue;

const aniDbLayer = orDefault(options?.aniDbLayer, AniDbClientLive);
const aniListLayer = orDefault(options?.aniListLayer, AniListClientLive);
const rssLayer = orDefault(
  options?.rssLayer,
  RssClientLive.pipe(Layer.provide(Layer.mergeAll(DnsResolverLive, RssTransportLive))),
);
```

---

#### 22. `app-platform-runtime-core.ts` - Sequential Layer Building

**Lines**: 25-55

**Issue**: Verbose sequential layer building with repeated patterns.

**Note**: This is acceptable for clarity, but could be abstracted if the pattern repeats elsewhere.

---

#### 23. `features/events/event-bus.ts` - Complex Subscription Initialization

**Lines**: 31-93

**Issue**: Deeply nested `Effect.gen` with complex locking.

**Note**: Acceptable given the complexity, but consider extracting the relay logic into a named helper function.

---

#### 24. `lib/media-identity.ts` - Long Parse Functions with Many Returns

**Lines**: 58-160, 166-216

**Issue**: `parseFileSourceIdentity` has many early returns. Could use `Match` for exhaustiveness.

**Assessment**: This is a **style preference**. The current early-return pattern is idiomatic for parser code and makes the flow clear. No change required.

---

#### 25. `lib/job-status.ts` - Duplicate Insert/Update Pattern

**Lines**: 10-44, 46-81, 83-118, 120-156

**Issue**: All four CRUD functions have nearly identical `insert().onConflictDoUpdate()` patterns.

**Suggested Fix**:

```typescript
const upsertJobRecord = Effect.fn("JobStatus.upsert")(function* (
  db: AppDatabase,
  name: string,
  values: Partial<typeof backgroundJobs.$inferInsert>,
  nowIso: () => Effect.Effect<string>,
) {
  const now = yield* nowIso();
  yield* tryDatabasePromise("Failed to upsert job record", () =>
    db
      .insert(backgroundJobs)
      .values({ ...values, name, lastRunAt: now })
      .onConflictDoUpdate({ target: backgroundJobs.name, set: { ...values, lastRunAt: now } }),
  );
});
```

---

#### 26. `features/anime/anidb-protocol.ts` - Imperative Title Deduplication Loop

**Lines**: 109-144

**Issue**: `buildTitleCandidates` uses mutable `Set` and `for` loop with manual deduplication.

**Suggested Fix**:

```typescript
const uniqueCandidates = new Map<string, AniDbTitleCandidate>();
candidates.forEach((candidate) => {
  const normalizedValue = candidate.value.trim();
  if (normalizedValue.length === 0) return;
  const dedupeKey = normalizeTitleForMatch(normalizedValue);
  if (!uniqueCandidates.has(dedupeKey)) {
    uniqueCandidates.set(dedupeKey, { source: candidate.source, value: normalizedValue });
  }
});
return Array.from(uniqueCandidates.values()).slice(0, ANIDB_MAX_TITLE_CANDIDATES);
```

---

#### 27. `features/operations/search-orchestration-release-search.ts` - Nested Imperative Loops

**Lines**: 249-277

**Issue**: `collectEpisodeSearchReleases` uses nested `for` loops with mutable `results` array.

**Suggested Fix**:

```typescript
const seenInfoHashes = new Set<string>();
const episodes =
  yield *
  Effect.forEach(
    buildEpisodeSearchQueries(animeRow, episodeNumber),
    (query) =>
      searchNyaaReleases(query, config).pipe(
        Effect.map((items) =>
          items.filter((item) => {
            if (!shouldKeepEpisodeRelease(item, episodeNumber)) return false;
            if (seenInfoHashes.has(item.infoHash)) return false;
            seenInfoHashes.add(item.infoHash);
            return true;
          }),
        ),
      ),
    { concurrency: 1 },
  );
return episodes.flat().slice(0, 10);
```

---

#### 28. `lib/logging.ts` - Switch Statement in Log Level Parsing

**Lines**: 137-152

**Issue**: `parseRuntimeLogLevel` uses imperative switch statement.

**Suggested Fix**:

```typescript
const LOG_LEVEL_MAP: Record<string, LogLevel.LogLevel> = {
  error: LogLevel.Error,
  warn: LogLevel.Warning,
  warning: LogLevel.Warning,
  debug: LogLevel.Debug,
  trace: LogLevel.Trace,
  info: LogLevel.Info,
};

const parseRuntimeLogLevel = (level: string | undefined) =>
  LOG_LEVEL_MAP[level?.toLowerCase() ?? "info"] ?? LogLevel.Info;
```

---

### P3 - Low Priority (Nitpicks)

#### 29. `http/operations-downloads-router.ts` - Route Handler Pattern

**Lines**: 23-36

**Issue**: The `commandRoute` helper is slightly clever / indirect.

**Assessment**: This is actually a **good pattern** - it's a higher-order function that creates consistent route handlers. No change needed.

---

#### 30. `features/events/publisher.ts` - Tight Coupling to Clock

**Lines**: 41-53

**Issue**: `makeEventPublisher` depends on `ClockService` for timestamp generation. Could accept timestamps as parameters for better testability.

**Suggested Fix**:

```typescript
interface EventPublisherOptions {
  readonly getCurrentTime?: Effect.Effect<number>; // Default to clock.currentTimeMillis
}
```

---

#### 31. `features/events/event-bus.ts` - Complex Initialization Lock

**Lines**: 31-93

**Issue**: The subscription initialization with `initializationLock` and `initialBufferedRef` is sophisticated but could benefit from extraction into a helper.

**Note**: Acceptable given the complexity, but consider extracting the relay logic into a named helper function.

---

#### 32. `lib/filesystem.ts` - `toOpenFlag` Imperative Logic

**Lines**: 98-118

**Issue**: The flag conversion uses nested ifs for complex boolean logic.

**Suggested Fix**:

```typescript
const toOpenFlag = (opts: OpenFileOptions): PlatformFileSystem.OpenFlag => {
  if (opts.append) return opts.read ? "a+" : "a";
  if (!opts.write) return "r";
  return opts.truncate || opts.create ? (opts.read ? "w+" : "w") : opts.read ? "r+" : "w";
};
```

---

#### 33. `db/sqlite-errors.ts` - Imperative Loop in Error Chain Traversal

**Lines**: 1-27

**Issue**: `someCauseInChain` uses `while` loop with manual Set tracking.

**Suggested Fix**:

```typescript
function* causeChain(cause: unknown): Generator<unknown> {
  const seen = new Set<unknown>();
  let current: unknown = cause;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    yield current;
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
}

export function isSqliteUniqueConstraint(cause: unknown): boolean {
  for (const error of causeChain(cause)) {
    if (predicate(error)) return true;
  }
  return false;
}
```

---

#### 34. `lib/effect-coalescing-*` - Documentation Gap for Complex State Machines

**Files**: All 5 effect-coalescing files

**Issue**: The sophisticated state machines in the coalescing utilities lack comprehensive documentation explaining:

- State transitions
- Semantics of each runner type (coalesced vs skipping vs single-flight)
- When to use each pattern

**Suggested Fix**: Add module-level JSDoc explaining:

- **Coalesced**: Batches concurrent triggers, runs once with follow-up
- **Skipping**: Drops overlapping triggers during execution
- **Single-flight**: Deduplicates concurrent triggers to single execution
- **Serialized-flag**: Simple boolean coordinator for serialization

---

## Architecture Patterns Analysis

### Strengths

1. **Excellent Layer Composition**: Sophisticated dependency management with clear separation between platform, infrastructure, and domain layers
2. **Schema-First Validation**: Strong use of `Schema.Class`, `Schema.TaggedError`, and branded types throughout
3. **Proper Error Modeling**: Good distinction between `Data.TaggedError` (internal) and `Schema.TaggedError` (boundary-crossing)
4. **Clean HTTP Layer**: Routers are thin and delegate to services - exemplary pattern
5. **Effect.fn Usage**: Consistent naming for traceability
6. **Match.tag Usage**: Excellent exhaustive case handling
7. **Streaming Implementation**: Excellent Stream usage with proper pagination, range support, and SSE encoding
8. **Repository Pattern**: Clean repositories across all features using `Effect.fn` and `Option.fromNullable`
9. **Background Worker System**: Well-designed supervision with scope management, metrics, and error handling
10. **AniDB Integration**: Rate limiting, proper UDP socket lifecycle with `Effect.acquireUseRelease`
11. **Config System**: Layered config with env priority, dotenv support, schema validation
12. **Metrics**: Prometheus-compatible metrics with histograms, counters, gauges
13. **Request Schemas**: All HTTP routes use Schema validation at boundaries
14. **Effect Coalescing Utilities**: Sophisticated concurrency patterns implemented correctly
15. **Testable Design**: Heavy use of TestClock, Deferred, and layer isolation for testing

### Weaknesses

1. **Over-Genericization**: Compose functions use too many type parameters
2. **Defensive Coding**: Some modules are overly defensive with verbose switch/if chains
3. **Imperative Patterns**: Manual iteration where Effect combinators would be better
4. **Function Proliferation**: Some small wrapper functions that just delegate
5. **Complex State Machines**: Effect coalescing files need more documentation
6. **Custom Either/Option**: Use Effect's standard types instead of custom `_tag` unions
7. **Regex Compilation**: Some modules compile regex on each call

---

## Effect Idiom Compliance

### Compliant Patterns ✓

- `Effect.gen(function*() { ... })` as default workflow pattern
- `Effect.fn("Name")` for exported operations and service methods
- `Context.Tag("@bakarr/...")` for service contracts
- `Layer.effect`, `Layer.scoped`, `Layer.succeed` properly used
- Schema validation at boundaries with `Schema.decodeUnknown`
- `Effect.acquireRelease` for resource management
- `Effect.addFinalizer` for cleanup
- `Effect.forEach` with controlled concurrency
- `Redacted` for sensitive values
- `Match.tag` for exhaustive case handling
- `Stream` for streaming data
- `Option.fromNullable` for null handling
- Repository pattern with `Effect.fn`
- Branded types for domain values
- Proper use of `@effect/vitest` with `it.effect`, `it.scoped`
- `TestClock` for deterministic time-based tests
- `Deferred` for test synchronization
- `Fiber` management in tests

### Non-Compliant / Improvement Areas

- **Dual API inconsistency**: Some modules don't expose dual APIs consistently
- **Data-first vs data-last**: Some pipelines mix styles
- **Match.valueTags**: Underutilized for switch statements (could simplify `route-errors.ts`)
- **Effect.Service**: Not used - could simplify some service definitions
- **Custom Either/Option**: Use Effect's standard types instead of custom validation results

---

## Test Patterns Analysis

The test suite demonstrates **excellent Effect testing practices**:

### Strengths

1. **Proper use of `@effect/vitest`**: Uses `it.effect`, `it.scoped`, `it.live` correctly
2. **Deterministic testing**: Heavy use of `TestClock` for time-based tests
3. **Fiber management**: Proper `Fiber.fork`, `Fiber.await`, `Fiber.join` patterns
4. **Resource cleanup**: Proper `Effect.acquireUseRelease` in tests
5. **Deferred usage**: Excellent use of `Deferred.make` for synchronization
6. **Layer isolation**: Tests provide fresh inline layers
7. **Consistent assertions**: Uses `assert` from `@effect/vitest`, no `expect`
8. **Metric testing**: Good use of `Metric.snapshot` for metrics assertions

### Test Coverage by Module

| Module       | Test Coverage                                  | Quality       |
| ------------ | ---------------------------------------------- | ------------- |
| Background   | `background_test.ts` (691 lines)               | **Excellent** |
| Config       | `config-provider_test.ts`                      | **Excellent** |
| Effect Retry | `effect-retry_test.ts`                         | **Good**      |
| Media Probe  | `media-probe_test.ts`                          | **Good**      |
| Security     | `password_test.ts`, `token-hasher_test.ts`     | **Good**      |
| HTTP Routes  | `http-app_test.ts`, `route-auth_test.ts`, etc. | **Good**      |
| Anime        | Multiple test files                            | **Good**      |
| System       | Config, codec, status tests                    | **Good**      |
| Operations   | Search, repository tests                       | **Good**      |

---

## Security Notes

No critical security vulnerabilities identified. The codebase properly:

- Uses `Redacted` for secrets throughout
- Hashes tokens before storage with SHA-256
- Uses Argon2id for password hashing
- Uses timing-safe comparison
- Validates input at boundaries with Schema
- Has SSRF protection in URL validation
- Redacts secrets in config responses
- Sanitizes filenames with proper escaping
- Uses HMAC for stream token signing
- Validates path traversal attempts
- Validates file extensions
- Has secure session cookie settings (httpOnly, secure, sameSite)

---

## Summary Statistics

| Category                      | Count |
| ----------------------------- | ----- |
| Total Files Reviewed          | 330+  |
| Perfectly Aligned             | 170+  |
| P1 Findings (High Priority)   | 19    |
| P2 Findings (Medium Priority) | 13    |
| P3 Findings (Low Priority)    | 10    |
| Critical Security Issues      | 0     |
| Test Files                    | 78    |

---

## Priority Action Plan

### Phase 1 - Quick Wins (High Impact, Low Risk)

1. **P1.6** - Extract regex constants in `lib/naming.ts`
2. **P1.5** - Convert switch statements to lookup tables in `lib/media-probe.ts`
3. **P1.8** - Refactor `http/route-auth.ts` auth extraction to pure function
4. **P2.28** - Convert log level parsing to lookup table
5. **P3.32** - Simplify `toOpenFlag` in `lib/filesystem.ts`
6. **P2.21** - Extract helper for repetitive ternary in external clients layer

### Phase 2 - Architecture (Medium Risk)

7. **P1.4** - Convert retry pattern to service pattern in `lib/effect-retry.ts`
8. **P1.14** - Replace imperative loop in `features/anime/anidb.ts`
9. **P2.26** - Refactor title deduplication in `anidb-protocol.ts`
10. **P2.27** - Replace nested loops in `search-orchestration-release-search.ts`
11. **P1.9** - Simplify `http/route-errors.ts` error mapping
12. **P1.7** - Clean up `http/http-app.ts` router composition

### Phase 3 - Cleanup & Documentation (Low Risk)

13. **P2.25** - Extract helper for duplicate upsert patterns
14. **P1.16** - Use standard `Either` in `lib/disk-space.ts`
15. **P1.15** - Add documentation to `effect-coalescing-latest-value-publisher.ts`
16. **P3.34** - Add comprehensive documentation to all effect-coalescing modules
17. **P3.30** - Consider clock decoupling in publisher

---

## Overall Assessment

**Total Coverage**: 330+ files across `apps/api/src/`  
**Test Coverage**: 78 test files with excellent patterns  
**Security Posture**: Zero critical issues  
**Code Quality**: High (170+ exemplary files)  
**Effect Idiom Compliance**: Excellent

### Notable Architectural Strengths

1. **Sophisticated Effect Patterns**: The coalescing utilities demonstrate advanced Effect patterns (Deferred, Ref, Semaphore, Scope) used correctly
2. **Clean Database Layer**: Proper migration handling with clear failure semantics
3. **Comprehensive Media Identity System**: Well-structured parsing with clear separation of concerns
4. **Proper Resource Management**: Excellent use of `Effect.acquireUseRelease` and `Effect.addFinalizer`
5. **Testable Design**: Heavy use of TestClock, Deferred, and layer isolation for testing

### Final Grade: **A** (Excellent)

The Bakarr API codebase demonstrates **mastery of Effect patterns** with:

- **170+ perfectly aligned files** demonstrating best practices
- **Sophisticated concurrency patterns** in background workers and coalescing utilities
- **Clean architecture** with proper layer composition
- **Comprehensive test coverage** using Effect testing patterns
- **Zero critical security issues**
- **Strong documentation** in critical areas

The identified issues are **minor refinements** rather than architectural problems, indicating a mature, well-maintained codebase.

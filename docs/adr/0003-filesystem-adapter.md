# ADR 0003: Keep FileSystem Adapter For App Semantics

## Status

Accepted

## Context

Bakarr uses `@effect/platform` for filesystem access, but callers need app-specific semantics: `FileSystemError`, URL-to-path handling, directory entries with stat data, scoped file handles, and noop/test layers.

## Decision

Keep `infra/filesystem/filesystem.ts` as the application filesystem seam. Do not expose `@effect/platform` filesystem directly to feature modules.

## Consequences

- Feature modules get stable error and entry shapes.
- Tests keep using noop/override layers without depending on platform details.
- Future cleanup should reduce repetition inside the adapter, but not delete the seam unless callers no longer need these app semantics.

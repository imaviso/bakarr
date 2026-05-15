# ADR 0001: Keep Drizzle Behind Repository Seams

## Status

Accepted

## Context

Bakarr API uses Effect layers for dependency injection and Drizzle for SQLite queries. Older feature modules passed `AppDatabase` into repository functions, which leaked persistence details into domain services and made tests depend on concrete database wiring.

## Decision

Feature services should depend on repository `Context.Tag` modules, not raw `Database.db` or `AppDatabase` parameters. Drizzle queries belong inside repository adapters. Repository methods should expose domain-shaped operations and return typed Effect errors.

## Consequences

- Domain services gain locality: persistence behavior changes inside repository adapters.
- Tests can provide repository test layers without building SQLite when orchestration is under test.
- Existing plain repository functions may remain during incremental migration, but new or touched persistence paths should use repository services.

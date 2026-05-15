# ADR 0002: Map Shared Domain Errors Centrally

## Status

Accepted

## Context

Shared domain errors such as `DomainNotFoundError` and `DomainConflictError` are used by multiple API features. Mapping those classes inside feature-specific route mappers created ordering-sensitive behavior because the same error instance could match several feature schemas.

## Decision

Common domain errors map once in `http/shared/route-errors/index.ts`. Feature route-error mappers only handle feature-specific errors.

## Consequences

- HTTP status mapping for shared domain failures has one seam.
- Feature mappers no longer depend on route mapper order for common error classes.
- Feature-specific HTTP behavior requires a feature-specific tagged error rather than an alias of a shared domain error.

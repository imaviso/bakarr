import { Schema } from "effect";

import type { PasswordError } from "@/security/password.ts";
import type { TokenHasherError } from "@/security/token-hasher.ts";

export class AuthBadRequestError extends Schema.TaggedError<AuthBadRequestError>()(
  "AuthBadRequestError",
  {
    message: Schema.String,
  },
) {}

export class AuthUnauthorizedError extends Schema.TaggedError<AuthUnauthorizedError>()(
  "AuthUnauthorizedError",
  {
    message: Schema.String,
  },
) {}

export class AuthForbiddenError extends Schema.TaggedError<AuthForbiddenError>()(
  "AuthForbiddenError",
  {
    message: Schema.String,
  },
) {}

export class AuthNotFoundError extends Schema.TaggedError<AuthNotFoundError>()(
  "AuthNotFoundError",
  {
    message: Schema.String,
  },
) {}

export class AuthRateLimitedError extends Schema.TaggedError<AuthRateLimitedError>()(
  "AuthRateLimitedError",
  {
    message: Schema.String,
    retryAfterMs: Schema.Number,
  },
) {}

export type AuthError =
  | AuthBadRequestError
  | AuthForbiddenError
  | AuthNotFoundError
  | AuthRateLimitedError
  | AuthUnauthorizedError;

export const AuthErrorSchema = Schema.Union(
  AuthBadRequestError,
  AuthForbiddenError,
  AuthNotFoundError,
  AuthRateLimitedError,
  AuthUnauthorizedError,
);

export type AuthCryptoError = PasswordError | TokenHasherError;

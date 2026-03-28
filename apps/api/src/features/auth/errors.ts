import { Schema } from "effect";

import type { PasswordError } from "../../security/password.ts";
import type { TokenHasherError } from "../../security/token-hasher.ts";

export class AuthError extends Schema.TaggedError<AuthError>()("AuthError", {
  message: Schema.String,
  status: Schema.Literal(400, 401, 403, 404, 409),
}) {}

export type AuthCryptoError = PasswordError | TokenHasherError;

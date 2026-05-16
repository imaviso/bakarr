import { Schema } from "effect";

import type { PasswordError } from "@/security/password.ts";
import type { TokenHasherError } from "@/security/token-hasher.ts";

export class AuthError extends Schema.TaggedError<AuthError>()("AuthError", {
  kind: Schema.Literal("BadRequest", "Unauthorized", "Forbidden", "NotFound"),
  message: Schema.String,
}) {}

export type AuthCryptoError = PasswordError | TokenHasherError;

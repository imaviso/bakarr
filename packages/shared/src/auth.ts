// Shared auth wire contracts.
import { Schema } from "effect";
import { UserIdSchema } from "./ids.ts";
import type { UserId } from "./ids.ts";

export interface AuthUser {
  id: UserId;
  username: string;
  created_at: string;
  updated_at: string;
  must_change_password: boolean;
}

export const AuthUserSchema = Schema.Struct({
  id: UserIdSchema,
  username: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
  must_change_password: Schema.Boolean,
});

export interface LoginRequest {
  username: string;
  password: string;
}

const AuthUsernameSchema = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isMaxLength(128)),
);
const AuthPasswordSchema = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isMaxLength(256)),
);
const ApiKeyStringSchema = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isMaxLength(128)),
  Schema.check(Schema.isPattern(/^[a-fA-F0-9]+$/)),
);

export const LoginRequestSchema = Schema.Struct({
  username: AuthUsernameSchema,
  password: AuthPasswordSchema,
});

export interface ApiKeyLoginRequest {
  api_key: string;
}

export const ApiKeyLoginRequestSchema = Schema.Struct({
  api_key: ApiKeyStringSchema,
});

export interface LoginResponse {
  username: string;
  api_key: string;
  api_key_masked: boolean;
  must_change_password: boolean;
}

export const LoginResponseSchema = Schema.Struct({
  username: Schema.String,
  api_key: Schema.String,
  api_key_masked: Schema.Boolean,
  must_change_password: Schema.Boolean,
});

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export const ChangePasswordRequestSchema = Schema.Struct({
  current_password: AuthPasswordSchema,
  new_password: AuthPasswordSchema,
});

export interface ApiKeyResponse {
  api_key: string;
  api_key_masked: boolean;
}

export const ApiKeyResponseSchema = Schema.Struct({
  api_key: Schema.String,
  api_key_masked: Schema.Boolean,
});

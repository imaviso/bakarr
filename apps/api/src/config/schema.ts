import { Context, Effect, Layer, Option, Schema } from "effect";

import { PositiveIntSchema } from "@/domain/domain-schema.ts";
import { randomHex } from "@/infra/random.ts";
import { readConfigValueWithDefault } from "@/config/read-config-value.ts";

const PortSchema = Schema.Number.pipe(Schema.int(), Schema.between(1, 65_535));

export class AppConfigModel extends Schema.Class<AppConfigModel>("AppConfigModel")({
  appVersion: Schema.String,
  databaseFile: Schema.String,
  port: PortSchema,
  sessionCookieName: Schema.String,
  sessionCookieSecure: Schema.Boolean,
  sessionDurationDays: PositiveIntSchema,
}) {}

export type AppConfigShape = Schema.Schema.Type<typeof AppConfigModel>;

export class BootstrapConfigModel extends Schema.Class<BootstrapConfigModel>(
  "BootstrapConfigModel",
)({
  bootstrapPassword: Schema.String,
  bootstrapPasswordIsEnvOverride: Schema.Boolean,
  bootstrapUsername: Schema.String,
}) {}

export type BootstrapConfigShape = Schema.Schema.Type<typeof BootstrapConfigModel>;

export interface AppConfigOverrides {
  readonly databaseFile?: string;
  readonly port?: number;
  readonly sessionCookieName?: string;
  readonly sessionCookieSecure?: boolean;
  readonly sessionDurationDays?: number;
  readonly appVersion?: string;
}

export interface BootstrapConfigOverrides {
  readonly bootstrapPassword?: string;
  readonly bootstrapUsername?: string;
}

const PortConfigSchema = Schema.NumberFromString.pipe(Schema.compose(PortSchema));

const PositiveIntConfigSchema = Schema.NumberFromString.pipe(Schema.compose(PositiveIntSchema));

const GENERATED_BOOTSTRAP_PASSWORD_BYTES = 18;

export function makeDefaultAppConfig(): AppConfigShape {
  return new AppConfigModel({
    appVersion: "0.1.0",
    databaseFile: "./bakarr.sqlite",
    port: 8000,
    sessionCookieName: "bakarr_session",
    sessionCookieSecure: true,
    sessionDurationDays: 30,
  });
}

export function makeDefaultBootstrapConfig(): BootstrapConfigShape {
  return new BootstrapConfigModel({
    bootstrapPassword: "",
    bootstrapPasswordIsEnvOverride: false,
    bootstrapUsername: "admin",
  });
}

export class AppConfig extends Context.Tag("@bakarr/api/AppConfig")<AppConfig, AppConfigShape>() {
  static Live = AppConfig.layerWithOverrides();

  static layer = AppConfig.Live;

  static layerWithOverrides(overrides: AppConfigOverrides = {}) {
    return Layer.effect(
      AppConfig,
      Effect.gen(function* () {
        const defaults = makeDefaultAppConfig();
        const appVersion = yield* readConfigValueWithDefault(
          overrides.appVersion,
          Schema.Config("BAKARR_APP_VERSION", Schema.String),
          defaults.appVersion,
        );
        const databaseFile = yield* readConfigValueWithDefault(
          overrides.databaseFile,
          Schema.Config("DATABASE_FILE", Schema.String),
          defaults.databaseFile,
        );
        const port = yield* readConfigValueWithDefault(
          overrides.port,
          Schema.Config("PORT", PortConfigSchema),
          defaults.port,
        );
        const sessionCookieName = yield* readConfigValueWithDefault(
          overrides.sessionCookieName,
          Schema.Config("SESSION_COOKIE_NAME", Schema.String),
          defaults.sessionCookieName,
        );
        const sessionCookieSecure = yield* readConfigValueWithDefault(
          overrides.sessionCookieSecure,
          Schema.Config("SESSION_COOKIE_SECURE", Schema.BooleanFromString),
          defaults.sessionCookieSecure,
        );
        const sessionDurationDays = yield* readConfigValueWithDefault(
          overrides.sessionDurationDays,
          Schema.Config("SESSION_DURATION_DAYS", PositiveIntConfigSchema),
          defaults.sessionDurationDays,
        );

        return new AppConfigModel({
          appVersion,
          databaseFile,
          port,
          sessionCookieName,
          sessionCookieSecure,
          sessionDurationDays,
        });
      }),
    );
  }
}

export class BootstrapConfig extends Context.Tag("@bakarr/api/BootstrapConfig")<
  BootstrapConfig,
  BootstrapConfigShape
>() {
  static Live = BootstrapConfig.layerWithOverrides();

  static layer = BootstrapConfig.Live;

  static layerWithOverrides(overrides: BootstrapConfigOverrides = {}) {
    return Layer.effect(
      BootstrapConfig,
      Effect.gen(function* () {
        const defaults = makeDefaultBootstrapConfig();
        const bootstrapPasswordFromEnv =
          overrides.bootstrapPassword !== undefined
            ? Option.some(overrides.bootstrapPassword)
            : yield* Schema.Config("BAKARR_BOOTSTRAP_PASSWORD", Schema.String).pipe(
                Effect.map(Option.some),
                Effect.orElse(() => Effect.succeed(Option.none())),
              );
        const generatedBootstrapPassword = Option.isNone(bootstrapPasswordFromEnv)
          ? yield* randomHex(GENERATED_BOOTSTRAP_PASSWORD_BYTES)
          : defaults.bootstrapPassword;
        const bootstrapPassword = Option.getOrElse(
          bootstrapPasswordFromEnv,
          () => generatedBootstrapPassword,
        );
        const bootstrapUsername = yield* readConfigValueWithDefault(
          overrides.bootstrapUsername,
          Schema.Config("BAKARR_BOOTSTRAP_USERNAME", Schema.String),
          defaults.bootstrapUsername,
        );

        return new BootstrapConfigModel({
          bootstrapPassword,
          bootstrapPasswordIsEnvOverride: Option.isSome(bootstrapPasswordFromEnv),
          bootstrapUsername,
        });
      }),
    );
  }
}

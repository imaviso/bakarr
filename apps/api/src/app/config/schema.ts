import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect";

import { PositiveIntSchema } from "@/infra/schema.ts";
import { randomHex } from "@/infra/random.ts";

const PortSchema = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 65_535 })),
);

export class AppConfigModel extends Schema.Class<AppConfigModel>("AppConfigModel")({
  appVersion: Schema.String,
  databaseFile: Schema.String,
  port: PortSchema,
  sessionCookieName: Schema.String,
  sessionCookieSecure: Schema.Boolean,
  sessionDurationDays: PositiveIntSchema,
  /** Extra Host header values accepted by the DNS-rebinding guard (IP-literal and localhost are always allowed). */
  trustedHosts: Schema.Array(Schema.String),
}) {}

export type AppConfigShape = Schema.Schema.Type<typeof AppConfigModel>;

export class BootstrapConfigModel extends Schema.Class<BootstrapConfigModel>(
  "BootstrapConfigModel",
)({
  bootstrapPassword: Schema.RedactedFromValue(Schema.String),
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
  readonly trustedHosts?: ReadonlyArray<string>;
}

export interface BootstrapConfigOverrides {
  readonly bootstrapPassword?: string;
  readonly bootstrapUsername?: string;
}

const PortConfigSchema = Schema.NumberFromString.pipe(Schema.decodeTo(PortSchema));

const PositiveIntConfigSchema = Schema.NumberFromString.pipe(Schema.decodeTo(PositiveIntSchema));

const GENERATED_BOOTSTRAP_PASSWORD_BYTES = 18;

export function makeDefaultAppConfig(): AppConfigShape {
  return new AppConfigModel({
    appVersion: "0.1.0",
    databaseFile: "./bakarr.sqlite",
    port: 8000,
    sessionCookieName: "bakarr_session",
    sessionCookieSecure: true,
    sessionDurationDays: 30,
    trustedHosts: [],
  });
}

export function makeDefaultBootstrapConfig(): BootstrapConfigShape {
  return new BootstrapConfigModel({
    bootstrapPassword: Redacted.make(""),
    bootstrapPasswordIsEnvOverride: false,
    bootstrapUsername: "admin",
  });
}

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()(
  "@bakarr/api/AppConfig",
) {
  static Live = AppConfig.layerWithOverrides();

  static layer = AppConfig.Live;

  static layerWithOverrides(overrides: AppConfigOverrides = {}) {
    return Layer.effect(
      AppConfig,
      Effect.gen(function* () {
        const defaults = makeDefaultAppConfig();

        const appVersion =
          overrides.appVersion ??
          (yield* Config.schema(Schema.String, "BAKARR_APP_VERSION").pipe(
            Config.withDefault(defaults.appVersion),
          ));
        const databaseFile =
          overrides.databaseFile ??
          (yield* Config.schema(Schema.String, "DATABASE_FILE").pipe(
            Config.withDefault(defaults.databaseFile),
          ));
        const port =
          overrides.port ??
          (yield* Config.schema(PortConfigSchema, "PORT").pipe(Config.withDefault(defaults.port)));
        const sessionCookieName =
          overrides.sessionCookieName ??
          (yield* Config.schema(Schema.String, "SESSION_COOKIE_NAME").pipe(
            Config.withDefault(defaults.sessionCookieName),
          ));
        const sessionCookieSecure =
          overrides.sessionCookieSecure ??
          (yield* Config.boolean("SESSION_COOKIE_SECURE").pipe(
            Config.withDefault(defaults.sessionCookieSecure),
          ));
        const sessionDurationDays =
          overrides.sessionDurationDays ??
          (yield* Config.schema(PositiveIntConfigSchema, "SESSION_DURATION_DAYS").pipe(
            Config.withDefault(defaults.sessionDurationDays),
          ));
        const trustedHosts =
          overrides.trustedHosts ??
          (yield* Config.schema(Schema.String, "BAKARR_TRUSTED_HOSTS").pipe(
            Config.withDefault(""),
            Effect.map((value) =>
              value
                .split(",")
                .map((host) => host.trim().toLowerCase())
                .filter((host) => host.length > 0),
            ),
          ));

        return new AppConfigModel({
          appVersion,
          databaseFile,
          port,
          sessionCookieName,
          sessionCookieSecure,
          sessionDurationDays,
          trustedHosts,
        });
      }),
    );
  }
}

export class BootstrapConfig extends Context.Service<BootstrapConfig, BootstrapConfigShape>()(
  "@bakarr/api/BootstrapConfig",
) {
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
            : yield* Config.option(Config.schema(Schema.String, "BAKARR_BOOTSTRAP_PASSWORD"));
        const bootstrapPassword = Option.isSome(bootstrapPasswordFromEnv)
          ? Redacted.make(bootstrapPasswordFromEnv.value)
          : Redacted.make(yield* randomHex(GENERATED_BOOTSTRAP_PASSWORD_BYTES));
        const bootstrapUsername =
          overrides.bootstrapUsername ??
          (yield* Config.schema(Schema.String, "BAKARR_BOOTSTRAP_USERNAME").pipe(
            Config.withDefault(defaults.bootstrapUsername),
          ));

        return new BootstrapConfigModel({
          bootstrapPassword,
          bootstrapPasswordIsEnvOverride: Option.isSome(bootstrapPasswordFromEnv),
          bootstrapUsername,
        });
      }),
    );
  }
}

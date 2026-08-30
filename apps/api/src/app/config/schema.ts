import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect";

import { PositiveIntSchema } from "@/infra/schema.ts";
import { randomHex } from "@/infra/random.ts";

const PortSchema = Schema.Number.pipe(Schema.int(), Schema.between(1, 65_535));

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
  bootstrapPassword: Schema.Redacted(Schema.String),
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

export class AppConfig extends Context.Tag("@bakarr/api/AppConfig")<AppConfig, AppConfigShape>() {
  static Live = AppConfig.layerWithOverrides();

  static layer = AppConfig.Live;

  static layerWithOverrides(overrides: AppConfigOverrides = {}) {
    return Layer.effect(
      AppConfig,
      Effect.gen(function* () {
        const defaults = makeDefaultAppConfig();

        const appVersion =
          overrides.appVersion ??
          (yield* Schema.Config("BAKARR_APP_VERSION", Schema.String).pipe(
            Config.withDefault(defaults.appVersion),
          ));
        const databaseFile =
          overrides.databaseFile ??
          (yield* Schema.Config("DATABASE_FILE", Schema.String).pipe(
            Config.withDefault(defaults.databaseFile),
          ));
        const port =
          overrides.port ??
          (yield* Schema.Config("PORT", PortConfigSchema).pipe(Config.withDefault(defaults.port)));
        const sessionCookieName =
          overrides.sessionCookieName ??
          (yield* Schema.Config("SESSION_COOKIE_NAME", Schema.String).pipe(
            Config.withDefault(defaults.sessionCookieName),
          ));
        const sessionCookieSecure =
          overrides.sessionCookieSecure ??
          (yield* Schema.Config("SESSION_COOKIE_SECURE", Schema.BooleanFromString).pipe(
            Config.withDefault(defaults.sessionCookieSecure),
          ));
        const sessionDurationDays =
          overrides.sessionDurationDays ??
          (yield* Schema.Config("SESSION_DURATION_DAYS", PositiveIntConfigSchema).pipe(
            Config.withDefault(defaults.sessionDurationDays),
          ));
        const trustedHosts =
          overrides.trustedHosts ??
          (yield* Schema.Config("BAKARR_TRUSTED_HOSTS", Schema.String).pipe(
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
            : yield* Config.option(Schema.Config("BAKARR_BOOTSTRAP_PASSWORD", Schema.String));
        const bootstrapPassword = Option.isSome(bootstrapPasswordFromEnv)
          ? Redacted.make(bootstrapPasswordFromEnv.value)
          : Redacted.make(yield* randomHex(GENERATED_BOOTSTRAP_PASSWORD_BYTES));
        const bootstrapUsername =
          overrides.bootstrapUsername ??
          (yield* Schema.Config("BAKARR_BOOTSTRAP_USERNAME", Schema.String).pipe(
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

import { Config as EffectConfig, Context, Effect, Layer, Option, Schema } from "effect";

import { PositiveIntSchema } from "@/lib/domain-schema.ts";
import { randomHexSync } from "@/lib/random.ts";

const PortSchema = Schema.Number.pipe(Schema.int(), Schema.between(1, 65_535));

export class AppConfigModel extends Schema.Class<AppConfigModel>("AppConfigModel")({
  appVersion: Schema.String,
  bootstrapPassword: Schema.String,
  bootstrapPasswordIsEnvOverride: Schema.Boolean,
  bootstrapUsername: Schema.String,
  databaseFile: Schema.String,
  port: PortSchema,
  sessionCookieName: Schema.String,
  sessionCookieSecure: Schema.Boolean,
  sessionDurationDays: PositiveIntSchema,
}) {}

export type AppConfigShape = Schema.Schema.Type<typeof AppConfigModel>;

export interface AppConfigOverrides {
  readonly databaseFile?: string;
  readonly port?: number;
  readonly bootstrapUsername?: string;
  readonly bootstrapPassword?: string;
  readonly sessionCookieName?: string;
  readonly sessionCookieSecure?: boolean;
  readonly sessionDurationDays?: number;
  readonly appVersion?: string;
}

const PortConfigSchema = Schema.NumberFromString.pipe(Schema.compose(PortSchema));

const PositiveIntConfigSchema = Schema.NumberFromString.pipe(Schema.compose(PositiveIntSchema));

const GENERATED_BOOTSTRAP_PASSWORD_BYTES = 18;

export const defaultAppConfig = new AppConfigModel({
  appVersion: "0.1.0",
  bootstrapPassword: randomHexSync(GENERATED_BOOTSTRAP_PASSWORD_BYTES),
  bootstrapPasswordIsEnvOverride: false,
  bootstrapUsername: "admin",
  databaseFile: "./bakarr.sqlite",
  port: 8000,
  sessionCookieName: "bakarr_session",
  sessionCookieSecure: true,
  sessionDurationDays: 30,
});

export class AppConfig extends Context.Tag("@bakarr/api/AppConfig")<AppConfig, AppConfigShape>() {
  static layer(overrides: AppConfigOverrides = {}) {
    return Layer.effect(
      AppConfig,
      Effect.gen(function* () {
        const appVersion = yield* readConfigValue(
          overrides.appVersion,
          Schema.Config("BAKARR_APP_VERSION", Schema.String).pipe(
            EffectConfig.orElse(() => EffectConfig.succeed(defaultAppConfig.appVersion)),
          ),
        );
        const bootstrapPasswordFromEnv =
          overrides.bootstrapPassword !== undefined
            ? Option.some(overrides.bootstrapPassword)
            : yield* Schema.Config("BAKARR_BOOTSTRAP_PASSWORD", Schema.String).pipe(
                Effect.map(Option.some),
                Effect.orElse(() => Effect.succeed(Option.none())),
              );
        const bootstrapPassword = Option.getOrElse(
          bootstrapPasswordFromEnv,
          () => defaultAppConfig.bootstrapPassword,
        );
        const bootstrapPasswordIsEnvOverride = Option.isSome(bootstrapPasswordFromEnv);
        const bootstrapUsername = yield* readConfigValue(
          overrides.bootstrapUsername,
          Schema.Config("BAKARR_BOOTSTRAP_USERNAME", Schema.String).pipe(
            EffectConfig.orElse(() => EffectConfig.succeed(defaultAppConfig.bootstrapUsername)),
          ),
        );
        const databaseFile = yield* readConfigValue(
          overrides.databaseFile,
          Schema.Config("DATABASE_FILE", Schema.String).pipe(
            EffectConfig.orElse(() => EffectConfig.succeed(defaultAppConfig.databaseFile)),
          ),
        );
        const port = yield* readConfigValue(
          overrides.port,
          Schema.Config("PORT", PortConfigSchema).pipe(
            EffectConfig.orElse(() => EffectConfig.succeed(defaultAppConfig.port)),
          ),
        );
        const sessionCookieName = yield* readConfigValue(
          overrides.sessionCookieName,
          Schema.Config("SESSION_COOKIE_NAME", Schema.String).pipe(
            EffectConfig.orElse(() => EffectConfig.succeed(defaultAppConfig.sessionCookieName)),
          ),
        );
        const sessionCookieSecure = yield* readConfigValue(
          overrides.sessionCookieSecure,
          Schema.Config("SESSION_COOKIE_SECURE", Schema.BooleanFromString).pipe(
            EffectConfig.orElse(() => EffectConfig.succeed(defaultAppConfig.sessionCookieSecure)),
          ),
        );
        const sessionDurationDays = yield* readConfigValue(
          overrides.sessionDurationDays,
          Schema.Config("SESSION_DURATION_DAYS", PositiveIntConfigSchema).pipe(
            EffectConfig.orElse(() => EffectConfig.succeed(defaultAppConfig.sessionDurationDays)),
          ),
        );

        return new AppConfigModel({
          appVersion,
          bootstrapPassword,
          bootstrapPasswordIsEnvOverride,
          bootstrapUsername,
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

export const AppConfigLive = AppConfig.layer();

function readConfigValue<A>(override: A | undefined, config: EffectConfig.Config<A>) {
  return override === undefined ? config : EffectConfig.succeed(override);
}

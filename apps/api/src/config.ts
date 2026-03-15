import {
  Config as EffectConfig,
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";

export interface AppConfigShape {
  readonly databaseFile: string;
  readonly port: number;
  readonly bootstrapUsername: string;
  readonly bootstrapPassword: Redacted.Redacted<string>;
  /** True when the bootstrap password was explicitly set via env var or override (not randomly generated). */
  readonly bootstrapPasswordIsEnvOverride: boolean;
  readonly sessionCookieName: string;
  readonly sessionDurationDays: number;
  readonly appVersion: string;
}

export interface AppConfigOverrides {
  readonly databaseFile?: string;
  readonly port?: number;
  readonly bootstrapUsername?: string;
  readonly bootstrapPassword?: string | Redacted.Redacted<string>;
  readonly sessionCookieName?: string;
  readonly sessionDurationDays?: number;
  readonly appVersion?: string;
}

const PortSchema = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.between(1, 65_535),
);

const PositiveIntSchema = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.greaterThan(0),
);

export const defaultAppConfig: AppConfigShape = {
  appVersion: "0.1.0",
  bootstrapPassword: Redacted.make(
    Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  ),
  bootstrapPasswordIsEnvOverride: false,
  bootstrapUsername: "admin",
  databaseFile: "./bakarr.sqlite",
  port: 8000,
  sessionCookieName: "bakarr_session",
  sessionDurationDays: 30,
};

export class AppConfig extends Context.Tag("@bakarr/api/AppConfig")<
  AppConfig,
  AppConfigShape
>() {
  static layer(overrides: AppConfigOverrides = {}) {
    return Layer.effect(
      AppConfig,
      Effect.gen(function* () {
        const appVersion = yield* readConfigValue(
          overrides.appVersion,
          Schema.Config("BAKARR_APP_VERSION", Schema.String).pipe(
            EffectConfig.orElse(() =>
              EffectConfig.succeed(defaultAppConfig.appVersion)
            ),
          ),
        );
        const bootstrapPasswordFromEnv =
          overrides.bootstrapPassword !== undefined
            ? Option.some(
              normalizePasswordOverride(overrides.bootstrapPassword)!,
            )
            : yield* EffectConfig.redacted("BAKARR_BOOTSTRAP_PASSWORD").pipe(
              Effect.map(Option.some),
              Effect.orElse(() => Effect.succeed(Option.none())),
            );
        const bootstrapPassword = Option.getOrElse(
          bootstrapPasswordFromEnv,
          () => defaultAppConfig.bootstrapPassword,
        );
        const bootstrapPasswordIsEnvOverride = Option.isSome(
          bootstrapPasswordFromEnv,
        );
        const bootstrapUsername = yield* readConfigValue(
          overrides.bootstrapUsername,
          Schema.Config("BAKARR_BOOTSTRAP_USERNAME", Schema.String).pipe(
            EffectConfig.orElse(() =>
              EffectConfig.succeed(defaultAppConfig.bootstrapUsername)
            ),
          ),
        );
        const databaseFile = yield* readConfigValue(
          overrides.databaseFile,
          Schema.Config("DATABASE_FILE", Schema.String).pipe(
            EffectConfig.orElse(() =>
              EffectConfig.succeed(defaultAppConfig.databaseFile)
            ),
          ),
        );
        const port = yield* readConfigValue(
          overrides.port,
          Schema.Config("PORT", PortSchema).pipe(
            EffectConfig.orElse(() =>
              EffectConfig.succeed(defaultAppConfig.port)
            ),
          ),
        );
        const sessionCookieName = yield* readConfigValue(
          overrides.sessionCookieName,
          Schema.Config("SESSION_COOKIE_NAME", Schema.String).pipe(
            EffectConfig.orElse(() =>
              EffectConfig.succeed(defaultAppConfig.sessionCookieName)
            ),
          ),
        );
        const sessionDurationDays = yield* readConfigValue(
          overrides.sessionDurationDays,
          Schema.Config("SESSION_DURATION_DAYS", PositiveIntSchema).pipe(
            EffectConfig.orElse(() =>
              EffectConfig.succeed(defaultAppConfig.sessionDurationDays)
            ),
          ),
        );

        return {
          appVersion,
          bootstrapPassword,
          bootstrapPasswordIsEnvOverride,
          bootstrapUsername,
          databaseFile,
          port,
          sessionCookieName,
          sessionDurationDays,
        } satisfies AppConfigShape;
      }),
    );
  }
}

export const AppConfigLive = AppConfig.layer();

function readConfigValue<A>(
  override: A | undefined,
  config: EffectConfig.Config<A>,
) {
  return override === undefined ? config : EffectConfig.succeed(override);
}

function normalizePasswordOverride(
  override: string | Redacted.Redacted<string> | undefined,
) {
  if (override === undefined) {
    return undefined;
  }

  return typeof override === "string" ? Redacted.make(override) : override;
}

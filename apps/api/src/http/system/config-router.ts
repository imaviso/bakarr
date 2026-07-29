import { HttpRouter } from "effect/unstable/http";
import { Effect, Schema } from "effect";
import { QualitySchema, ReleaseProfileSchema } from "@packages/shared/index.ts";

import { QualityProfileService } from "@/features/system/quality-profile-service.ts";
import { ReleaseProfileService } from "@/features/system/release-profile-service.ts";
import { SystemConfigUpdateService } from "@/features/system/system-config-update-service.ts";
import {
  redactConfigSecrets,
  SystemConfigService,
} from "@/features/system/system-config-service.ts";
import { IdParamsSchema } from "@/http/shared/common-request-schemas.ts";
import {
  ConfigSchema,
  CreateReleaseProfileSchema,
  NameParamsSchema,
  QualityProfileSchema,
  UpdateReleaseProfileSchema,
} from "@/http/system/request-schemas.ts";
import {
  authedRouteResponse,
  decodeJsonBodyWithLabel,
  decodePathParams,
  schemaJsonResponse,
  successResponse,
} from "@/http/shared/router-helpers.ts";

export const configRoutes = [
  HttpRouter.route(
    "GET",
    "/api/system/config",
    authedRouteResponse(
      Effect.flatMap(SystemConfigService, (service) =>
        service.getConfig().pipe(Effect.map(redactConfigSecrets)),
      ),
      schemaJsonResponse(ConfigSchema),
    ),
  ),
  HttpRouter.route(
    "PUT",
    "/api/system/config",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(ConfigSchema, "update system config");
        return yield* (yield* SystemConfigUpdateService)
          .updateConfig(body)
          .pipe(Effect.map(redactConfigSecrets));
      }),
      schemaJsonResponse(ConfigSchema),
    ),
  ),
  HttpRouter.route(
    "GET",
    "/api/profiles",
    authedRouteResponse(
      Effect.flatMap(QualityProfileService, (service) => service.listProfiles()),
      schemaJsonResponse(Schema.Array(QualityProfileSchema)),
    ),
  ),
  HttpRouter.route(
    "GET",
    "/api/profiles/qualities",
    authedRouteResponse(
      Effect.flatMap(QualityProfileService, (service) => service.listQualities()),
      schemaJsonResponse(Schema.Array(QualitySchema)),
    ),
  ),
  HttpRouter.route(
    "POST",
    "/api/profiles",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(QualityProfileSchema, "create quality profile");
        return yield* (yield* QualityProfileService).createProfile(body);
      }),
      schemaJsonResponse(QualityProfileSchema),
    ),
  ),
  HttpRouter.route(
    "PUT",
    "/api/profiles/:name",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(NameParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(QualityProfileSchema, "update quality profile");
        return yield* (yield* QualityProfileService).updateProfile(params.name, body);
      }),
      schemaJsonResponse(QualityProfileSchema),
    ),
  ),
  HttpRouter.route(
    "DELETE",
    "/api/profiles/:name",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(NameParamsSchema);
        yield* (yield* QualityProfileService).deleteProfile(params.name);
      }),
      successResponse,
    ),
  ),
  HttpRouter.route(
    "GET",
    "/api/release-profiles",
    authedRouteResponse(
      Effect.flatMap(ReleaseProfileService, (service) => service.listReleaseProfiles()),
      schemaJsonResponse(Schema.Array(ReleaseProfileSchema)),
    ),
  ),
  HttpRouter.route(
    "POST",
    "/api/release-profiles",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(
          CreateReleaseProfileSchema,
          "create release profile",
        );
        return yield* (yield* ReleaseProfileService).createReleaseProfile(body);
      }),
      schemaJsonResponse(ReleaseProfileSchema),
    ),
  ),
  HttpRouter.route(
    "PUT",
    "/api/release-profiles/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(
          UpdateReleaseProfileSchema,
          "update release profile",
        );
        yield* (yield* ReleaseProfileService).updateReleaseProfile(params.id, body);
      }),
      successResponse,
    ),
  ),
  HttpRouter.route(
    "DELETE",
    "/api/release-profiles/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* ReleaseProfileService).deleteReleaseProfile(params.id);
      }),
      successResponse,
    ),
  ),
];

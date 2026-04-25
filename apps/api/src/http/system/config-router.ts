import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

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
  jsonResponse,
  successResponse,
} from "@/http/shared/router-helpers.ts";

export const configRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/system/config",
    authedRouteResponse(
      Effect.flatMap(SystemConfigService, (service) =>
        service.getConfig().pipe(Effect.map(redactConfigSecrets)),
      ),
      jsonResponse,
    ),
  ),
  HttpRouter.put(
    "/api/system/config",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(ConfigSchema, "update system config");
        return yield* (yield* SystemConfigUpdateService).updateConfig(body);
      }),
      successResponse,
    ),
  ),
  HttpRouter.get(
    "/api/profiles",
    authedRouteResponse(
      Effect.flatMap(QualityProfileService, (service) => service.listProfiles()),
      jsonResponse,
    ),
  ),
  HttpRouter.get(
    "/api/profiles/qualities",
    authedRouteResponse(
      Effect.flatMap(QualityProfileService, (service) => service.listQualities()),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/api/profiles",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(QualityProfileSchema, "create quality profile");
        return yield* (yield* QualityProfileService).createProfile(body);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.put(
    "/api/profiles/:name",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(NameParamsSchema);
        const body = yield* decodeJsonBodyWithLabel(QualityProfileSchema, "update quality profile");
        return yield* (yield* QualityProfileService).updateProfile(params.name, body);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/api/profiles/:name",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(NameParamsSchema);
        yield* (yield* QualityProfileService).deleteProfile(params.name);
      }),
      successResponse,
    ),
  ),
  HttpRouter.get(
    "/api/release-profiles",
    authedRouteResponse(
      Effect.flatMap(ReleaseProfileService, (service) => service.listReleaseProfiles()),
      jsonResponse,
    ),
  ),
  HttpRouter.post(
    "/api/release-profiles",
    authedRouteResponse(
      Effect.gen(function* () {
        const body = yield* decodeJsonBodyWithLabel(
          CreateReleaseProfileSchema,
          "create release profile",
        );
        return yield* (yield* ReleaseProfileService).createReleaseProfile(body);
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.put(
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
  HttpRouter.del(
    "/api/release-profiles/:id",
    authedRouteResponse(
      Effect.gen(function* () {
        const params = yield* decodePathParams(IdParamsSchema);
        yield* (yield* ReleaseProfileService).deleteReleaseProfile(params.id);
      }),
      successResponse,
    ),
  ),
);

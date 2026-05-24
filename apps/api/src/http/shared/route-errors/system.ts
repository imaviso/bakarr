import { Match, Schema } from "effect";

import { DiskSpaceError } from "@/features/system/disk-space.ts";
import {
  ConfigValidationError,
  ImageAssetAccessError,
  ImageAssetNotFoundError,
  ImageAssetTooLargeError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
  StoredUnmappedFolderCorruptError,
  SystemConflictError,
  SystemNotFoundError,
} from "@/features/system/errors.ts";
import type { RouteErrorResponse } from "@/http/shared/route-types.ts";
import {
  errorStatus,
  fixedStatus,
  mapTaggedRouteError,
  messageStatus,
} from "@/http/shared/route-errors/helpers.ts";

const internalServerError = fixedStatus("Internal server error", 500);

const SystemRouteErrorSchema = Schema.Union(
  ConfigValidationError,
  DiskSpaceError,
  ImageAssetAccessError,
  ImageAssetNotFoundError,
  ImageAssetTooLargeError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
  StoredUnmappedFolderCorruptError,
  SystemConflictError,
  SystemNotFoundError,
);

type SystemRouteError = Schema.Schema.Type<typeof SystemRouteErrorSchema>;

const systemRouteErrorMappers: {
  [K in SystemRouteError["_tag"]]: (
    error: Extract<SystemRouteError, { _tag: K }>,
  ) => RouteErrorResponse;
} = {
  ConfigValidationError: messageStatus(400),
  DiskSpaceError: internalServerError,
  ImageAssetAccessError: errorStatus,
  ImageAssetNotFoundError: errorStatus,
  ImageAssetTooLargeError: errorStatus,
  StoredConfigCorruptError: internalServerError,
  StoredConfigMissingError: internalServerError,
  StoredUnmappedFolderCorruptError: internalServerError,
  SystemConflictError: messageStatus(409),
  SystemNotFoundError: messageStatus(404),
};

export const mapSystemRouteError = mapTaggedRouteError(SystemRouteErrorSchema, (error) =>
  Match.valueTags(error, systemRouteErrorMappers),
);

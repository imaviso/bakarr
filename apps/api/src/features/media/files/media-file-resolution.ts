import { Schema } from "effect";

export class UnitFileResolved extends Schema.TaggedClass<UnitFileResolved>()("UnitFileResolved", {
  fileName: Schema.String,
  filePath: Schema.String,
}) {}

export class UnitFileUnmapped extends Schema.TaggedClass<UnitFileUnmapped>()(
  "UnitFileUnmapped",
  {},
) {}

export class UnitFileRootInaccessible extends Schema.TaggedClass<UnitFileRootInaccessible>()(
  "UnitFileRootInaccessible",
  { rootFolder: Schema.String },
) {}

export class UnitFileMissing extends Schema.TaggedClass<UnitFileMissing>()("UnitFileMissing", {
  filePath: Schema.String,
}) {}

export class UnitFileOutsideRoot extends Schema.TaggedClass<UnitFileOutsideRoot>()(
  "UnitFileOutsideRoot",
  {
    animeRoot: Schema.String,
    filePath: Schema.String,
  },
) {}

export type UnitFileResolution =
  | UnitFileResolved
  | UnitFileUnmapped
  | UnitFileRootInaccessible
  | UnitFileMissing
  | UnitFileOutsideRoot;

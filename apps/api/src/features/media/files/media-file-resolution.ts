import { Schema } from "effect";

export class EpisodeFileResolved extends Schema.TaggedClass<EpisodeFileResolved>()(
  "EpisodeFileResolved",
  {
    fileName: Schema.String,
    filePath: Schema.String,
  },
) {}

export class EpisodeFileUnmapped extends Schema.TaggedClass<EpisodeFileUnmapped>()(
  "EpisodeFileUnmapped",
  {},
) {}

export class EpisodeFileRootInaccessible extends Schema.TaggedClass<EpisodeFileRootInaccessible>()(
  "EpisodeFileRootInaccessible",
  { rootFolder: Schema.String },
) {}

export class EpisodeFileMissing extends Schema.TaggedClass<EpisodeFileMissing>()(
  "EpisodeFileMissing",
  {
    filePath: Schema.String,
  },
) {}

export class EpisodeFileOutsideRoot extends Schema.TaggedClass<EpisodeFileOutsideRoot>()(
  "EpisodeFileOutsideRoot",
  {
    animeRoot: Schema.String,
    filePath: Schema.String,
  },
) {}

export type EpisodeFileResolution =
  | EpisodeFileResolved
  | EpisodeFileUnmapped
  | EpisodeFileRootInaccessible
  | EpisodeFileMissing
  | EpisodeFileOutsideRoot;

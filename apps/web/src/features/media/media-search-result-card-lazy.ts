import { lazy } from "react";

export const MediaSearchResultCardLazy = lazy(() =>
  import("@/features/media/media-search-result-card").then((module) => ({
    default: module.MediaSearchResultCard,
  })),
);

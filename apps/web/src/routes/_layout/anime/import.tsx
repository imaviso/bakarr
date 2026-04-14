import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import * as v from "valibot";
import { ImportPageContent } from "~/components/import/import-page-content";
import { createImportPageState } from "~/components/import/import-page-state";
import { GeneralError } from "~/components/general-error";
import { animeListQueryOptions, profilesQueryOptions, systemConfigQueryOptions } from "~/lib/api";
import { usePageTitle } from "~/lib/page-title";

const ImportSearchSchema = v.object({
  animeId: v.optional(
    v.pipe(
      v.union([v.string(), v.number()]),
      v.transform((value) => (typeof value === "number" ? value : Number(value))),
      v.check((value) => Number.isInteger(value) && value > 0, "Invalid anime id"),
      v.integer(),
    ),
  ),
});

export const Route = createFileRoute("/_layout/anime/import")({
  validateSearch: (search) => v.parse(ImportSearchSchema, search),
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(animeListQueryOptions()),
      queryClient.ensureQueryData(profilesQueryOptions()),
      queryClient.ensureQueryData(systemConfigQueryOptions()),
    ]);
  },
  component: ImportPage,
  errorComponent: GeneralError,
});

function ImportPage() {
  usePageTitle(() => "Import");
  const navigate = useNavigate();
  const search = Route.useSearch();

  const state = createImportPageState({
    animeId: () => search().animeId,
    onImportSuccess: () => {
      void navigate({
        to: "/anime",
        search: { q: "", filter: "all", view: "grid" },
      });
    },
  });

  return <ImportPageContent state={state} />;
}

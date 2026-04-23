import { createFileRoute } from "@tanstack/react-router";
import { AnimeCalendar } from "~/components/anime-calendar";
import { GeneralError } from "~/components/general-error";
import { usePageTitle } from "~/lib/page-title";

export const Route = createFileRoute("/_layout/calendar")({
  component: CalendarPage,
  errorComponent: GeneralError,
});

function CalendarPage() {
  usePageTitle("Calendar");
  return <AnimeCalendar />;
}

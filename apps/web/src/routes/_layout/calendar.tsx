import { createFileRoute } from "@tanstack/react-router";
import { AnimeCalendar } from "~/features/media/media-calendar";
import { GeneralError } from "~/components/shared/general-error";
import { usePageTitle } from "~/domain/page-title";

export const Route = createFileRoute("/_layout/calendar")({
  component: CalendarPage,
  errorComponent: GeneralError,
});

function CalendarPage() {
  usePageTitle("Calendar");
  return <AnimeCalendar />;
}

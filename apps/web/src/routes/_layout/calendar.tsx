import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";
import { AnimeCalendar } from "~/features/media/media-calendar";
import { GeneralError } from "~/components/shared/general-error";
import { usePageTitle } from "~/app/page-title";

const CalendarSearchSchema = Schema.Struct({
  month: Schema.optional(Schema.String),
});

export const Route = createFileRoute("/_layout/calendar")({
  validateSearch: (search) => Schema.decodeUnknownSync(CalendarSearchSchema)(search),
  component: CalendarPage,
  errorComponent: GeneralError,
});

function CalendarPage() {
  usePageTitle("Calendar");
  const { month } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <AnimeCalendar month={month} onMonthChange={(next) => navigate({ search: { month: next } })} />
  );
}

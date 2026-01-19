import { createFileRoute } from "@tanstack/solid-router";
import {
	addMonths,
	endOfMonth,
	endOfWeek,
	startOfMonth,
	startOfWeek,
	subMonths,
} from "date-fns";
import { AnimeCalendar } from "~/components/anime-calendar";
import { GeneralError } from "~/components/general-error";
import { calendarQueryOptions } from "~/lib/api";

export const Route = createFileRoute("/_layout/calendar")({
	loader: ({ context: { queryClient } }) => {
		const now = new Date();
		const fetchStart = subMonths(startOfWeek(startOfMonth(now)), 1);
		const fetchEnd = addMonths(endOfWeek(endOfMonth(now)), 1);
		queryClient.ensureQueryData(calendarQueryOptions(fetchStart, fetchEnd));
	},
	component: CalendarPage,
	errorComponent: GeneralError,
});

function CalendarPage() {
	return <AnimeCalendar />;
}

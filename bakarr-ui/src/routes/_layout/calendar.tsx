import { createFileRoute } from "@tanstack/solid-router";
import {
	addMonths,
	endOfMonth,
	endOfWeek,
	startOfMonth,
	startOfWeek,
	subMonths,
} from "date-fns";
import { Suspense } from "solid-js";
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
	return (
		<Suspense
			fallback={
				<div class="flex h-[400px] items-center justify-center">
					<div class="linear-spinner h-8 w-8 text-primary">
						<div class="linear-spinner-arc" />
					</div>
				</div>
			}
		>
			<AnimeCalendar />
		</Suspense>
	);
}

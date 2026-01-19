import { For } from "solid-js";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

export function AnimeListSkeleton() {
	return (
		<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
			<For each={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}>
				{() => (
					<Card class="overflow-hidden">
						<Skeleton class="aspect-[2/3] w-full" />
						<div class="p-3 flex flex-col gap-2">
							<Skeleton class="h-4 w-3/4" />
							<div class="flex items-center justify-between gap-2 mt-auto">
								<Skeleton class="h-5 w-16" />
								<Skeleton class="h-1.5 w-1.5 rounded-full" />
							</div>
						</div>
					</Card>
				)}
			</For>
		</div>
	);
}

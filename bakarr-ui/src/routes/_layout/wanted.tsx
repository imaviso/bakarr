import { IconDots, IconSearch } from "@tabler/icons-solidjs";
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { GeneralError } from "~/components/general-error";
import { SearchModal } from "~/components/search-modal";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import {
	createSearchMissingMutation,
	createWantedQuery,
	type MissingEpisode,
} from "~/lib/api";

export const Route = createFileRoute("/_layout/wanted")({
	component: WantedPage,
	errorComponent: GeneralError,
});

function WantedPage() {
	const [limit] = createSignal(100);
	const wantedQuery = createWantedQuery(limit);
	const searchMissing = createSearchMissingMutation();

	const [searchModalState, setSearchModalState] = createSignal<{
		open: boolean;
		animeId: number;
		episodeNumber: number;
		episodeTitle?: string;
	}>({
		open: false,
		animeId: 0,
		episodeNumber: 1,
	});

	const handleSearchAll = () => {
		toast.promise(searchMissing.mutateAsync(undefined), {
			loading: "Triggering global search...",
			success: "Global search triggered in background",
			error: (err) => `Failed to trigger search: ${err.message}`,
		});
	};

	return (
		<div class="space-y-6">
			<div class="flex flex-col gap-4">
				<div class="flex items-center justify-between px-1">
					<h1 class="text-xl font-semibold tracking-tight">Wanted</h1>
					<Button
						variant="default"
						size="sm"
						onClick={handleSearchAll}
						disabled={searchMissing.isPending || wantedQuery.data?.length === 0}
					>
						<IconSearch class="mr-2 h-4 w-4" />
						Search All
					</Button>
				</div>
				<p class="text-sm text-muted-foreground px-1">
					Missing episodes that have aired but haven't been downloaded yet.
				</p>
			</div>

			<Card>
				<div class="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead class="w-[60px]" />
								<TableHead>Anime</TableHead>
								<TableHead class="w-[100px]">Episode</TableHead>
								<TableHead class="hidden md:table-cell">Title</TableHead>
								<TableHead class="w-[150px]">Air Date</TableHead>
								<TableHead class="w-[50px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							<Show
								when={wantedQuery.data && wantedQuery.data.length > 0}
								fallback={
									<TableRow>
										<TableCell colSpan={6} class="h-24 text-center">
											{wantedQuery.isLoading
												? "Loading..."
												: "No missing episodes found."}
										</TableCell>
									</TableRow>
								}
							>
								<For each={wantedQuery.data}>
									{(item) => (
										<WantedRow
											item={item}
											onSearch={() =>
												setSearchModalState({
													open: true,
													animeId: item.anime_id,
													episodeNumber: item.episode_number,
													episodeTitle: item.episode_title,
												})
											}
										/>
									)}
								</For>
							</Show>
						</TableBody>
					</Table>
				</div>
			</Card>

			<SearchModal
				animeId={searchModalState().animeId}
				episodeNumber={searchModalState().episodeNumber}
				episodeTitle={searchModalState().episodeTitle}
				open={searchModalState().open}
				onOpenChange={(open) =>
					setSearchModalState((prev) => ({ ...prev, open }))
				}
			/>
		</div>
	);
}

function WantedRow(props: { item: MissingEpisode; onSearch: () => void }) {
	return (
		<TableRow>
			<TableCell>
				<div class="h-10 w-7 rounded overflow-hidden bg-muted">
					<Show when={props.item.anime_image}>
						<img
							src={props.item.anime_image}
							alt={props.item.anime_title}
							class="h-full w-full object-cover"
						/>
					</Show>
				</div>
			</TableCell>
			<TableCell class="font-medium">
				<Link
					to="/anime/$id"
					params={{ id: props.item.anime_id.toString() }}
					class="hover:underline"
				>
					{props.item.anime_title}
				</Link>
			</TableCell>
			<TableCell>
				<Badge variant="outline" class="font-mono font-normal">
					{props.item.episode_number.toString().padStart(2, "0")}
				</Badge>
			</TableCell>
			<TableCell class="hidden md:table-cell text-muted-foreground truncate max-w-[200px]">
				{props.item.episode_title || "-"}
			</TableCell>
			<TableCell class="text-sm">
				{props.item.aired
					? new Date(props.item.aired).toLocaleDateString()
					: "-"}
			</TableCell>
			<TableCell>
				<DropdownMenu placement="bottom-end">
					<DropdownMenuTrigger
						as={Button}
						variant="ghost"
						size="icon"
						class="h-8 w-8"
					>
						<IconDots class="h-4 w-4" />
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuItem onClick={props.onSearch}>
							<IconSearch class="mr-2 h-4 w-4" />
							Search
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</TableCell>
		</TableRow>
	);
}

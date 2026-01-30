import {
	IconAlertTriangle,
	IconCheck,
	IconDeviceTv,
	IconFolder,
	IconLoader2,
	IconPlus,
	IconSearch,
} from "@tabler/icons-solidjs";
import { createForm } from "@tanstack/solid-form";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createEffect, createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import * as v from "valibot";
import { GeneralError } from "~/components/general-error";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
	TextField,
	TextFieldInput,
	TextFieldLabel,
} from "~/components/ui/text-field";
import {
	type AnimeSearchResult,
	createAddAnimeMutation,
	createAnimeListQuery,
	createAnimeSearchQuery,
	createProfilesQuery,
	createReleaseProfilesQuery,
	createSystemConfigQuery,
	profilesQueryOptions,
	releaseProfilesQueryOptions,
	systemConfigQueryOptions,
} from "~/lib/api";
import { cn } from "~/lib/utils";

const searchSchema = v.object({
	id: v.optional(v.string()),
});

export const Route = createFileRoute("/_layout/anime/add")({
	validateSearch: searchSchema,
	loader: ({ context: { queryClient } }) => {
		queryClient.ensureQueryData(profilesQueryOptions());
		queryClient.ensureQueryData(releaseProfilesQueryOptions());
		queryClient.ensureQueryData(systemConfigQueryOptions());
	},
	component: AddAnimePage,
	errorComponent: GeneralError,
});

function AddAnimePage() {
	const _navigate = useNavigate();
	const search = Route.useSearch();
	const [query, setQuery] = createSignal("");
	const [debouncedQuery, setDebouncedQuery] = createSignal("");
	const [selectedAnime, setSelectedAnime] =
		createSignal<AnimeSearchResult | null>(null);

	// Auto-select anime if id is provided in search params
	createEffect(() => {
		const searchParams = search();
		const id = searchParams.id;
		if (id) {
			const idNum = Number.parseInt(id, 10);
			if (!Number.isNaN(idNum)) {
				// Set query to trigger search
				setQuery(id);
				setDebouncedQuery(id);
			}
		}
	});

	createEffect(() => {
		const q = query();
		const timeout = setTimeout(() => setDebouncedQuery(q), 500);
		return () => clearTimeout(timeout);
	});

	const searchQuery = createAnimeSearchQuery(debouncedQuery);
	const animeListQuery = createAnimeListQuery();

	// Auto-select anime when search results include the id from URL
	createEffect(() => {
		const searchParams = search();
		const id = searchParams.id;
		if (id && searchQuery.data && !selectedAnime()) {
			const idNum = Number.parseInt(id, 10);
			const found = searchQuery.data.find((a) => a.id === idNum);
			if (found) {
				setSelectedAnime(found);
			}
		}
	});

	const isAlreadyAdded = (id: number) => {
		return animeListQuery.data?.some((a) => a.id === id);
	};

	return (
		<div class="space-y-6">
			<div class="flex flex-col gap-4">
				<h1 class="text-xl font-semibold tracking-tight px-1">Add New Anime</h1>
				<div class="relative max-w-xl">
					<IconSearch class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<TextField class="w-full" value={query()} onChange={setQuery}>
						<TextFieldInput
							placeholder="Search for anime by title..."
							class="pl-9 h-11"
							autofocus
						/>
					</TextField>
					<Show when={searchQuery.isFetching}>
						<div class="absolute right-3 top-1/2 -translate-y-1/2">
							<IconLoader2 class="h-4 w-4 animate-spin text-muted-foreground" />
						</div>
					</Show>
				</div>
			</div>

			<Show
				when={debouncedQuery()}
				fallback={
					<div class="flex flex-col items-center justify-center py-20 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/10">
						<IconSearch class="h-12 w-12 mb-4 opacity-50" />
						<h3 class="font-medium text-lg">Search for your next anime</h3>
						<p class="text-sm mt-1">
							Type in the search bar above to calculate metadata
						</p>
					</div>
				}
			>
				<Show
					when={!searchQuery.error}
					fallback={
						<div class="p-8 text-center text-destructive bg-destructive/10 rounded-lg">
							<p>Failed to search anime. Please try again.</p>
							<p class="text-sm mt-2 opacity-80">
								{(searchQuery.error as Error).message}
							</p>
						</div>
					}
				>
					<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
						<Show
							when={!searchQuery.isLoading}
							fallback={
								<For each={[1, 2, 3, 4, 5, 6, 7, 8]}>
									{() => (
										<div class="space-y-3">
											<Skeleton class="aspect-[2/3] w-full rounded-lg" />
											<div class="space-y-2">
												<Skeleton class="h-4 w-3/4" />
												<Skeleton class="h-3 w-1/2" />
											</div>
										</div>
									)}
								</For>
							}
						>
							<Show
								when={searchQuery.data?.length !== 0}
								fallback={
									<div class="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground">
										<IconAlertTriangle class="h-10 w-10 mb-3 opacity-50" />
										<p>No results found for "{debouncedQuery()}"</p>
									</div>
								}
							>
								<For each={searchQuery.data}>
									{(anime) => {
										const added = isAlreadyAdded(anime.id);
										return (
											<Card class="overflow-hidden flex flex-col transition-all hover:border-primary/50 group">
												<div class="relative aspect-[2/3] w-full bg-muted overflow-hidden">
													<Show
														when={anime.cover_image}
														fallback={
															<div class="absolute inset-0 flex items-center justify-center">
																<IconDeviceTv class="h-12 w-12 text-muted-foreground/30" />
															</div>
														}
													>
														<img
															src={anime.cover_image}
															alt={anime.title.romaji}
															class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
															loading="lazy"
														/>
													</Show>
													<div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
														<Button
															size="sm"
															variant={added ? "secondary" : "default"}
															class="w-full gap-2"
															disabled={added}
															onClick={() => setSelectedAnime(anime)}
														>
															<Show
																when={added}
																fallback={
																	<>
																		<IconPlus class="h-4 w-4" />
																		Add to Library
																	</>
																}
															>
																<IconCheck class="h-4 w-4" />
																Already Added
															</Show>
														</Button>
													</div>
												</div>
												<CardContent class="p-4 flex-1">
													<h3
														class="font-medium leading-tight line-clamp-2 mb-1"
														title={anime.title.romaji}
													>
														{anime.title.romaji}
													</h3>
													<Show
														when={anime.title.english !== anime.title.romaji}
													>
														<p
															class="text-xs text-muted-foreground line-clamp-1 mb-2"
															title={anime.title.english}
														>
															{anime.title.english}
														</p>
													</Show>
													<div class="flex flex-wrap gap-1.5 mt-auto">
														<Show when={anime.format}>
															<Badge
																variant="outline"
																class="text-[10px] h-5 px-1.5 font-normal"
															>
																{anime.format}
															</Badge>
														</Show>
														<Show when={anime.episode_count}>
															<Badge
																variant="outline"
																class="text-[10px] h-5 px-1.5 font-normal"
															>
																{anime.episode_count} eps
															</Badge>
														</Show>
														<Show when={anime.status}>
															<Badge
																variant="outline"
																class={cn(
																	"text-[10px] h-5 px-1.5 font-normal capitalize",
																	anime.status?.toLowerCase() === "releasing"
																		? "text-green-500 border-green-500/30"
																		: "text-muted-foreground",
																)}
															>
																{anime.status?.replace("_", " ").toLowerCase()}
															</Badge>
														</Show>
													</div>
												</CardContent>
											</Card>
										);
									}}
								</For>
							</Show>
						</Show>
					</div>
				</Show>
			</Show>

			<Show when={selectedAnime()}>
				<AddAnimeDialog
					// biome-ignore lint/style/noNonNullAssertion: Guarded by Show
					anime={selectedAnime()!}
					open={!!selectedAnime()}
					onOpenChange={(open) => !open && setSelectedAnime(null)}
					onSuccess={() => {
						setSelectedAnime(null);
						toast.success(`Added ${selectedAnime()?.title.romaji} to library`);
					}}
				/>
			</Show>
		</div>
	);
}

const AddAnimeSchema = v.object({
	root_folder: v.pipe(v.string(), v.minLength(1, "Root folder is required")),
	profile_name: v.pipe(v.string(), v.minLength(1, "Profile is required")),
	monitor: v.boolean(),
	search_now: v.boolean(),
	release_profile_ids: v.array(v.number()),
});

function AddAnimeDialog(props: {
	anime: AnimeSearchResult;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}) {
	const profilesQuery = createProfilesQuery();
	const releaseProfilesQuery = createReleaseProfilesQuery();
	const configQuery = createSystemConfigQuery();
	const addAnimeMutation = createAddAnimeMutation();

	const form = createForm(() => ({
		defaultValues: {
			root_folder: configQuery.data?.library.library_path || "",
			profile_name: profilesQuery.data?.[0]?.name || "",
			monitor: true,
			search_now: true,
			release_profile_ids: [] as number[],
		},
		validators: {
			onChange: AddAnimeSchema,
		},
		onSubmit: async ({ value }) => {
			await addAnimeMutation.mutateAsync({
				id: props.anime.id,
				profile_name: value.profile_name,
				root_folder: value.root_folder,
				monitor_and_search: value.search_now,
				monitored: value.monitor,
				release_profile_ids: value.release_profile_ids,
			});
			props.onSuccess();
		},
	}));

	createEffect(() => {
		if (
			configQuery.data?.library.library_path &&
			!form.getFieldValue("root_folder")
		) {
			form.setFieldValue("root_folder", configQuery.data.library.library_path);
		}
		if (profilesQuery.data?.[0]?.name && !form.getFieldValue("profile_name")) {
			form.setFieldValue("profile_name", profilesQuery.data[0].name);
		}
	});

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent class="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>Add to Library</DialogTitle>
					<DialogDescription>
						Configure settings for{" "}
						<span class="font-medium text-foreground">
							{props.anime.title.romaji}
						</span>
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					class="space-y-6 py-4"
				>
					<form.Field name="root_folder">
						{(field) => (
							<TextField
								value={field().state.value}
								onChange={field().handleChange}
							>
								<TextFieldLabel>Root Folder Path</TextFieldLabel>
								<div class="relative">
									<IconFolder class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
									<TextFieldInput class="pl-9" placeholder="/path/to/anime" />
								</div>
								<Show when={field().state.meta.errors.length > 0}>
									<p class="text-[0.8rem] text-destructive mt-1">
										{field().state.meta.errors[0]?.message}
									</p>
								</Show>
							</TextField>
						)}
					</form.Field>

					<form.Field name="profile_name">
						{(field) => (
							<div class="space-y-2">
								<label
									class="text-sm font-medium leading-none"
									for={field().name}
								>
									Quality Profile
								</label>
								<Select
									name={field().name}
									value={
										profilesQuery.data
											?.map((p) => p.name)
											.includes(field().state.value)
											? field().state.value
											: null
									}
									onChange={(val) => val && field().handleChange(val)}
									options={profilesQuery.data?.map((p) => p.name) || []}
									placeholder="Select profile..."
									itemComponent={(props) => (
										<SelectItem item={props.item}>
											{props.item.rawValue}
										</SelectItem>
									)}
								>
									<SelectTrigger>
										<SelectValue<string>>
											{(state) => state.selectedOption()}
										</SelectValue>
									</SelectTrigger>
									<SelectContent />
								</Select>
								<Show when={field().state.meta.errors.length > 0}>
									<p class="text-[0.8rem] text-destructive">
										{field().state.meta.errors[0]?.message}
									</p>
								</Show>
							</div>
						)}
					</form.Field>

					<form.Field name="release_profile_ids" mode="array">
						{(field) => (
							<div class="space-y-2">
								<div class="text-sm font-medium leading-none">
									Release Profiles (Optional)
								</div>
								<div class="border rounded-md p-3 max-h-[150px] overflow-y-auto space-y-2">
									<Show
										when={
											releaseProfilesQuery.data &&
											releaseProfilesQuery.data.length > 0
										}
										fallback={
											<div class="text-sm text-muted-foreground text-center py-2">
												No release profiles available
											</div>
										}
									>
										<For each={releaseProfilesQuery.data}>
											{(profile) => (
												<div class="flex items-center space-x-2">
													<Checkbox
														id={`rp-${profile.id}`}
														checked={field().state.value.includes(profile.id)}
														onChange={(checked) => {
															if (checked) {
																field().pushValue(profile.id);
															} else {
																const idx = field().state.value.indexOf(
																	profile.id,
																);
																if (idx !== -1) field().removeValue(idx);
															}
														}}
													/>
													<label
														for={`rp-${profile.id}`}
														class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1 flex items-center justify-between"
													>
														<span>{profile.name}</span>
														<div class="flex gap-2">
															<Show when={profile.is_global}>
																<Badge
																	variant="outline"
																	class="text-[10px] h-4 px-1"
																>
																	Global
																</Badge>
															</Show>
															<Show when={!profile.enabled}>
																<Badge
																	variant="outline"
																	class="text-[10px] h-4 px-1 text-muted-foreground"
																>
																	Disabled
																</Badge>
															</Show>
														</div>
													</label>
												</div>
											)}
										</For>
									</Show>
								</div>
								<p class="text-[10px] text-muted-foreground">
									Global profiles are applied automatically unless disabled.
									Select specific profiles to apply them to this series.
								</p>
							</div>
						)}
					</form.Field>

					<div class="flex flex-col gap-4">
						<form.Field name="monitor">
							{(field) => (
								<div class="items-top flex space-x-2">
									<Checkbox
										id="monitor"
										checked={field().state.value}
										onChange={(c) => field().handleChange(c)}
									/>
									<div class="grid gap-1.5 leading-none">
										<label
											for="monitor"
											class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
										>
											Monitor
										</label>
										<p class="text-xs text-muted-foreground">
											Track this show for new episodes (RSS).
										</p>
									</div>
								</div>
							)}
						</form.Field>

						<form.Field name="search_now">
							{(field) => (
								<div class="items-top flex space-x-2">
									<Checkbox
										id="search_now"
										checked={field().state.value}
										onChange={(c) => field().handleChange(c)}
									/>
									<div class="grid gap-1.5 leading-none">
										<label
											for="search_now"
											class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
										>
											Start Search
										</label>
										<p class="text-xs text-muted-foreground">
											Immediately search for missing episodes.
										</p>
									</div>
								</div>
							)}
						</form.Field>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => props.onOpenChange(false)}
						>
							Cancel
						</Button>
						<form.Subscribe
							selector={(state) => [state.canSubmit, state.isSubmitting]}
						>
							{(state) => (
								<Button
									type="submit"
									disabled={!state()[0] || addAnimeMutation.isPending}
								>
									<Show
										when={!addAnimeMutation.isPending}
										fallback={
											<>
												<IconLoader2 class="mr-2 h-4 w-4 animate-spin" />
												Adding...
											</>
										}
									>
										Add Anime
									</Show>
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

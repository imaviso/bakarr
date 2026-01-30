import { IconCheck, IconDeviceTv, IconFolder, IconLoader2, IconPlus } from "@tabler/icons-solidjs";
import { createForm } from "@tanstack/solid-form";
import { createEffect, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import * as v from "valibot";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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
	createProfilesQuery,
	createReleaseProfilesQuery,
	createSystemConfigQuery,
} from "~/lib/api";
import { cn } from "~/lib/utils";

const AddAnimeSchema = v.object({
	root_folder: v.pipe(v.string(), v.minLength(1, "Root folder is required")),
	profile_name: v.pipe(v.string(), v.minLength(1, "Profile is required")),
	monitor: v.boolean(),
	search_now: v.boolean(),
	release_profile_ids: v.array(v.number()),
});

export interface AddAnimeDialogProps {
	anime: AnimeSearchResult;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess?: () => void;
}

export function AddAnimeDialog(props: AddAnimeDialogProps) {
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
			props.onSuccess?.();
			props.onOpenChange(false);
			toast.success(`Added ${props.anime.title.romaji} to library`);
		},
	}));

	createEffect(() => {
		if (
			configQuery.data?.library.library_path &&
			!form.getFieldValue("root_folder")
		) {
			form.setFieldValue("root_folder", configQuery.data.library.library_path);
		}
	});

	createEffect(() => {
		if (profilesQuery.data?.[0]?.name && !form.getFieldValue("profile_name")) {
			form.setFieldValue("profile_name", profilesQuery.data[0].name);
		}
	});

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent class="sm:max-w-[550px]">
				<DialogHeader>
					<DialogTitle class="flex items-center gap-3">
						<Show
							when={props.anime.cover_image}
							fallback={
								<div class="w-12 h-16 bg-muted rounded flex items-center justify-center">
									<IconDeviceTv class="h-6 w-6 text-muted-foreground" />
								</div>
							}
						>
							<img
								src={props.anime.cover_image}
								alt={props.anime.title.romaji}
								class="w-12 h-16 object-cover rounded"
							/>
						</Show>
						<div class="flex-1 min-w-0">
							<div class="truncate">{props.anime.title.romaji}</div>
							<Show when={props.anime.title.english}>
								<div class="text-sm text-muted-foreground font-normal truncate">
									{props.anime.title.english}
								</div>
							</Show>
						</div>
					</DialogTitle>
					<DialogDescription>
						Configure how this anime should be added to your library.
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					class="space-y-5 py-4"
				>
					<form.Field name="root_folder">
						{(field) => (
							<TextField
								value={field().state.value}
								onChange={field().handleChange}
							>
								<TextFieldLabel class="flex items-center gap-2">
									<IconFolder class="h-4 w-4" />
									Root Folder
								</TextFieldLabel>
								<TextFieldInput placeholder="/path/to/library" />
							</TextField>
						)}
					</form.Field>

					<form.Field name="profile_name">
						{(field) => (
							<div class="space-y-2">
								<label class="text-sm font-medium">Quality Profile</label>
								<Show
									when={!profilesQuery.isLoading}
									fallback={<Skeleton class="h-10 w-full" />}
								>
									<Select
										value={field().state.value}
										onChange={(val) => val && field().handleChange(val)}
										options={profilesQuery.data?.map((p) => p.name) || []}
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
								</Show>
							</div>
						)}
					</form.Field>

					<Show when={releaseProfilesQuery.data?.length}>
						<form.Field name="release_profile_ids" mode="array">
							{(field) => (
								<div class="space-y-2">
									<label class="text-sm font-medium">Release Profiles</label>
									<div class="flex flex-wrap gap-2">
										<For each={releaseProfilesQuery.data}>
											{(profile) => {
												const isSelected = () =>
													field().state.value.includes(profile.id);
												return (
													<label
														class={cn(
															"flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors",
															isSelected()
																? "bg-primary/10 border-primary/30"
																: "hover:bg-accent"
														)}
													>
														<Checkbox
															checked={isSelected()}
															onChange={(checked) => {
																if (checked) {
																	field().pushValue(profile.id);
																} else {
																	field().removeValue(
																		field().state.value.indexOf(
																			profile.id
																		)
																	);
																}
															}}
														/>
														<span class="text-sm">{profile.name}</span>
													</label>
												);
											}}
										</For>
									</div>
								</div>
							)}
						</form.Field>
					</Show>

					<div class="flex items-center gap-6">
						<form.Field name="monitor">
							{(field) => (
								<label class="flex items-center gap-2 cursor-pointer">
									<Checkbox
										checked={field().state.value}
										onChange={field().handleChange}
									/>
									<span class="text-sm">Monitor for new episodes</span>
								</label>
							)}
						</form.Field>

						<form.Field name="search_now">
							{(field) => (
								<label class="flex items-center gap-2 cursor-pointer">
									<Checkbox
										checked={field().state.value}
										onChange={field().handleChange}
									/>
									<span class="text-sm">Search for episodes now</span>
								</label>
							)}
						</form.Field>
					</div>

					<Show when={props.anime.already_in_library}>
						<div class="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md text-yellow-600">
							<IconCheck class="h-4 w-4" />
							<span class="text-sm">
								This anime is already in your library
							</span>
						</div>
					</Show>

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
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
									disabled={
										!state()[0] ||
										addAnimeMutation.isPending ||
										props.anime.already_in_library
									}
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
										<IconPlus class="mr-2 h-4 w-4" />
										Add to Library
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

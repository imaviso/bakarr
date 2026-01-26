import {
	IconAdjustments,
	IconEdit,
	IconGripVertical,
	IconListCheck,
	IconPlus,
	IconPower,
	IconSettings,
	IconTrash,
	IconX,
} from "@tabler/icons-solidjs";
import { createForm } from "@tanstack/solid-form";
import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For, Index, Show } from "solid-js";
import { toast } from "solid-sonner";
import * as v from "valibot";
import { GeneralError } from "~/components/general-error";
import { SystemStatus } from "~/components/system-status";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
	TextField,
	TextFieldErrorMessage,
	TextFieldInput,
	TextFieldLabel,
} from "~/components/ui/text-field";
import {
	type Config,
	createCreateProfileMutation,
	createCreateReleaseProfileMutation,
	createDeleteProfileMutation,
	createDeleteReleaseProfileMutation,
	createProfilesQuery,
	createQualitiesQuery,
	createReleaseProfilesQuery,
	createSystemConfigQuery,
	createSystemStatusQuery,
	createTriggerRssCheckMutation,
	createTriggerScanMutation,
	createUpdateProfileMutation,
	createUpdateReleaseProfileMutation,
	createUpdateSystemConfigMutation,
	profilesQueryOptions,
	type QualityProfile,
	qualitiesQueryOptions,
	type ReleaseProfile,
	releaseProfilesQueryOptions,
	systemConfigQueryOptions,
} from "~/lib/api";

export const Route = createFileRoute("/_layout/settings")({
	loader: ({ context: { queryClient } }) => {
		queryClient.ensureQueryData(profilesQueryOptions());
		queryClient.ensureQueryData(qualitiesQueryOptions());
		queryClient.ensureQueryData(systemConfigQueryOptions());
		queryClient.ensureQueryData(releaseProfilesQueryOptions());
	},
	component: SettingsPage,
	errorComponent: GeneralError,
});

function SettingsPage() {
	const [activeTab, setActiveTab] = createSignal("general");
	const [editingProfile, setEditingProfile] =
		createSignal<QualityProfile | null>(null);
	const [editingReleaseProfile, setEditingReleaseProfile] =
		createSignal<ReleaseProfile | null>(null);
	const [isCreating, setIsCreating] = createSignal(false);
	const [isCreatingReleaseProfile, setIsCreatingReleaseProfile] =
		createSignal(false);

	const profilesQuery = createProfilesQuery();
	const deleteProfile = createDeleteProfileMutation();
	const releaseProfilesQuery = createReleaseProfilesQuery();
	const deleteReleaseProfile = createDeleteReleaseProfileMutation();

	return (
		<div class="space-y-6">
			<div class="flex flex-col gap-4">
				<h1 class="text-xl font-semibold tracking-tight px-1">Settings</h1>
				<SystemStatus />
			</div>

			<Tabs
				defaultValue="general"
				value={activeTab()}
				onChange={setActiveTab}
				class="w-full space-y-6"
			>
				<TabsList class="w-full justify-start border-b rounded-none p-0 h-auto bg-transparent mb-6">
					<TabsTrigger
						value="general"
						class="rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent px-4 py-2"
					>
						<IconSettings class="mr-2 h-4 w-4" />
						General
					</TabsTrigger>
					<TabsTrigger
						value="profiles"
						class="rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent px-4 py-2"
					>
						<IconAdjustments class="mr-2 h-4 w-4" />
						Quality Profiles
					</TabsTrigger>
					<TabsTrigger
						value="release-profiles"
						class="rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent px-4 py-2"
					>
						<IconListCheck class="mr-2 h-4 w-4" />
						Release Profiles
					</TabsTrigger>
				</TabsList>

				<TabsContent value="general" class="mt-0">
					<div class="mb-6">
						<h2 class="text-lg font-medium">General Settings</h2>
						<p class="text-sm text-muted-foreground">
							Manage your application settings and configuration
						</p>
					</div>
					<GeneralSettingsForm />
				</TabsContent>

				<TabsContent value="profiles" class="mt-0">
					<Show
						when={!isCreating() && !editingProfile()}
						fallback={
							<div class="mb-6">
								<Show when={isCreating()}>
									<ProfileForm
										onCancel={() => setIsCreating(false)}
										onSuccess={() => setIsCreating(false)}
									/>
								</Show>
								<Show when={editingProfile()}>
									<ProfileForm
										// biome-ignore lint/style/noNonNullAssertion: Guarded by Show
										profile={editingProfile()!}
										onCancel={() => setEditingProfile(null)}
										onSuccess={() => setEditingProfile(null)}
									/>
								</Show>
							</div>
						}
					>
						<div class="flex justify-between items-center mb-6">
							<div>
								<h2 class="text-lg font-medium">Quality Profiles</h2>
								<p class="text-sm text-muted-foreground">
									Configure quality profiles for automatic downloads
								</p>
							</div>
							<Button
								onClick={() => setIsCreating(true)}
								disabled={isCreating()}
								size="sm"
							>
								<IconPlus class="mr-2 h-4 w-4" />
								Add Profile
							</Button>
						</div>

						<Show when={profilesQuery.isLoading}>
							<div class="space-y-4">
								<For each={[1, 2]}>
									{() => <Skeleton class="h-32 rounded-lg" />}
								</For>
							</div>
						</Show>

						<Show
							when={
								!profilesQuery.isLoading && profilesQuery.data?.length === 0
							}
						>
							<Card class="p-12 text-center border-dashed bg-transparent">
								<div class="flex flex-col items-center gap-4">
									<IconAdjustments class="h-12 w-12 text-muted-foreground/50" />
									<div>
										<h3 class="font-medium">No quality profiles</h3>
										<p class="text-sm text-muted-foreground mt-1">
											Create a profile to define download quality settings
										</p>
									</div>
									<Button onClick={() => setIsCreating(true)}>
										<IconPlus class="mr-2 h-4 w-4" />
										Create Profile
									</Button>
								</div>
							</Card>
						</Show>

						<Show when={profilesQuery.data && profilesQuery.data.length > 0}>
							<div class="grid gap-4">
								<For each={profilesQuery.data}>
									{(profile) => (
										<Card class="group transition-all duration-200 hover:border-primary/50">
											<CardHeader class="pb-3">
												<div class="flex justify-between items-start">
													<div class="space-y-1">
														<CardTitle class="text-base flex items-center gap-2">
															{profile.name}
															<Show when={profile.seadex_preferred}>
																<Badge
																	variant="secondary"
																	class="text-[10px] h-5 px-1.5 font-normal text-muted-foreground"
																>
																	SeaDex
																</Badge>
															</Show>
														</CardTitle>
														<div class="text-xs text-muted-foreground">
															Cutoff:{" "}
															<span class="font-medium text-foreground">
																{profile.cutoff}
															</span>
														</div>
													</div>
													<div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
														<Button
															size="icon"
															variant="ghost"
															class="h-8 w-8"
															onClick={() => setEditingProfile(profile)}
														>
															<IconEdit class="h-4 w-4" />
														</Button>
														<AlertDialog>
															<AlertDialogTrigger
																as={Button}
																variant="ghost"
																size="icon"
																class="h-8 w-8 text-muted-foreground hover:text-destructive"
															>
																<IconTrash class="h-4 w-4" />
															</AlertDialogTrigger>
															<AlertDialogContent>
																<AlertDialogHeader>
																	<AlertDialogTitle>
																		Delete Profile
																	</AlertDialogTitle>
																	<AlertDialogDescription>
																		Are you sure you want to delete profile "
																		{profile.name}"? This action cannot be
																		undone.
																	</AlertDialogDescription>
																</AlertDialogHeader>
																<AlertDialogFooter>
																	<AlertDialogCancel>Cancel</AlertDialogCancel>
																	<AlertDialogAction
																		class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
																		onClick={() =>
																			deleteProfile.mutate(profile.name)
																		}
																	>
																		Delete
																	</AlertDialogAction>
																</AlertDialogFooter>
															</AlertDialogContent>
														</AlertDialog>
													</div>
												</div>
											</CardHeader>
											<CardContent class="pt-0">
												<div class="flex flex-wrap gap-1.5">
													<For each={profile.allowed_qualities}>
														{(q) => (
															<Badge
																variant="outline"
																class="text-xs font-normal border-transparent bg-secondary/50 text-secondary-foreground hover:bg-secondary"
															>
																{q}
															</Badge>
														)}
													</For>
												</div>
												<div class="flex gap-4 mt-4 text-sm items-center text-muted-foreground">
													<span class="flex items-center gap-2">
														<Switch
															checked={profile.upgrade_allowed}
															disabled
															class="pointer-events-none"
														/>
														<span
															class={
																profile.upgrade_allowed ? "text-foreground" : ""
															}
														>
															Upgrades
														</span>
													</span>
													<span class="flex items-center gap-2">
														<Switch
															checked={profile.seadex_preferred}
															disabled
															class="pointer-events-none"
														/>
														<span
															class={
																profile.seadex_preferred
																	? "text-foreground"
																	: ""
															}
														>
															SeaDex
														</span>
													</span>
												</div>
											</CardContent>
										</Card>
									)}
								</For>
							</div>
						</Show>
					</Show>
				</TabsContent>

				<TabsContent value="release-profiles" class="mt-0">
					<Show
						when={!isCreatingReleaseProfile() && !editingReleaseProfile()}
						fallback={
							<div class="mb-6">
								<Show when={isCreatingReleaseProfile()}>
									<ReleaseProfileForm
										onCancel={() => setIsCreatingReleaseProfile(false)}
										onSuccess={() => setIsCreatingReleaseProfile(false)}
									/>
								</Show>
								<Show when={editingReleaseProfile()}>
									<ReleaseProfileForm
										// biome-ignore lint/style/noNonNullAssertion: Guarded
										profile={editingReleaseProfile()!}
										onCancel={() => setEditingReleaseProfile(null)}
										onSuccess={() => setEditingReleaseProfile(null)}
									/>
								</Show>
							</div>
						}
					>
						<div class="flex justify-between items-center mb-6">
							<div>
								<h2 class="text-lg font-medium">Release Profiles</h2>
								<p class="text-sm text-muted-foreground">
									Global scoring and filtering rules for releases (Groups, Tags)
								</p>
							</div>
							<Button
								onClick={() => setIsCreatingReleaseProfile(true)}
								disabled={isCreatingReleaseProfile()}
								size="sm"
							>
								<IconPlus class="mr-2 h-4 w-4" />
								Add Profile
							</Button>
						</div>

						<Show when={releaseProfilesQuery.isLoading}>
							<div class="space-y-4">
								<For each={[1, 2]}>
									{() => <Skeleton class="h-32 rounded-lg" />}
								</For>
							</div>
						</Show>

						<Show
							when={
								!releaseProfilesQuery.isLoading &&
								releaseProfilesQuery.data?.length === 0
							}
						>
							<Card class="p-12 text-center border-dashed bg-transparent">
								<div class="flex flex-col items-center gap-4">
									<IconListCheck class="h-12 w-12 text-muted-foreground/50" />
									<div>
										<h3 class="font-medium">No release profiles</h3>
										<p class="text-sm text-muted-foreground mt-1">
											Create a profile to prefer certain groups or filter
											releases
										</p>
									</div>
									<Button onClick={() => setIsCreatingReleaseProfile(true)}>
										<IconPlus class="mr-2 h-4 w-4" />
										Create Profile
									</Button>
								</div>
							</Card>
						</Show>

						<Show
							when={
								releaseProfilesQuery.data &&
								releaseProfilesQuery.data.length > 0
							}
						>
							<div class="grid gap-4">
								<For each={releaseProfilesQuery.data}>
									{(profile) => (
										<Card class="group transition-all duration-200 hover:border-primary/50">
											<CardHeader class="pb-3">
												<div class="flex justify-between items-start">
													<div class="space-y-1">
														<CardTitle class="text-base flex items-center gap-2">
															{profile.name}
															<Show when={!profile.enabled}>
																<Badge variant="outline" class="text-xs">
																	Disabled
																</Badge>
															</Show>
														</CardTitle>
														<div class="text-xs text-muted-foreground">
															{profile.rules.length} Rules
														</div>
													</div>
													<div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
														<Button
															size="icon"
															variant="ghost"
															class="h-8 w-8"
															onClick={() => setEditingReleaseProfile(profile)}
														>
															<IconEdit class="h-4 w-4" />
														</Button>
														<AlertDialog>
															<AlertDialogTrigger
																as={Button}
																variant="ghost"
																size="icon"
																class="h-8 w-8 text-muted-foreground hover:text-destructive"
															>
																<IconTrash class="h-4 w-4" />
															</AlertDialogTrigger>
															<AlertDialogContent>
																<AlertDialogHeader>
																	<AlertDialogTitle>
																		Delete Profile
																	</AlertDialogTitle>
																	<AlertDialogDescription>
																		Are you sure you want to delete profile "
																		{profile.name}"? This action cannot be
																		undone.
																	</AlertDialogDescription>
																</AlertDialogHeader>
																<AlertDialogFooter>
																	<AlertDialogCancel>Cancel</AlertDialogCancel>
																	<AlertDialogAction
																		class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
																		onClick={() =>
																			deleteReleaseProfile.mutate(profile.id)
																		}
																	>
																		Delete
																	</AlertDialogAction>
																</AlertDialogFooter>
															</AlertDialogContent>
														</AlertDialog>
													</div>
												</div>
											</CardHeader>
											<CardContent class="pt-0">
												<div class="flex flex-wrap gap-2">
													<For each={profile.rules.slice(0, 5)}>
														{(rule) => (
															<Badge
																variant={
																	rule.rule_type === "must_not"
																		? "error"
																		: "secondary"
																}
																class="text-xs font-normal"
															>
																<Show
																	when={rule.rule_type === "preferred"}
																	fallback={
																		rule.rule_type === "must"
																			? "Must: "
																			: "Block: "
																	}
																>
																	{rule.score > 0 ? "+" : ""}
																	{rule.score}{" "}
																</Show>
																{rule.term}
															</Badge>
														)}
													</For>
													<Show when={profile.rules.length > 5}>
														<Badge variant="outline" class="text-xs">
															+{profile.rules.length - 5} more
														</Badge>
													</Show>
												</div>
											</CardContent>
										</Card>
									)}
								</For>
							</div>
						</Show>
					</Show>
				</TabsContent>
			</Tabs>
		</div>
	);
}

function SortableQualityList(props: {
	value: string[];
	onChange: (value: string[]) => void;
	availableQualities: string[];
}) {
	const [draggedItem, setDraggedItem] = createSignal<string | null>(null);

	const handleDragStart = (e: DragEvent, item: string) => {
		setDraggedItem(item);
		// biome-ignore lint/style/noNonNullAssertion: DataTransfer exists
		e.dataTransfer!.effectAllowed = "move";
	};

	const handleDragOver = (e: DragEvent, targetItem: string) => {
		e.preventDefault();
		const dragged = draggedItem();
		if (!dragged || dragged === targetItem) return;

		const currentList = [...props.value];
		const fromIndex = currentList.indexOf(dragged);
		const toIndex = currentList.indexOf(targetItem);

		if (fromIndex === -1 || toIndex === -1) return;

		// Move item
		currentList.splice(fromIndex, 1);
		currentList.splice(toIndex, 0, dragged);

		props.onChange(currentList);
	};

	const handleDragEnd = () => {
		setDraggedItem(null);
	};

	const removeQuality = (quality: string) => {
		props.onChange(props.value.filter((q) => q !== quality));
	};

	const addQuality = (quality: string) => {
		if (!props.value.includes(quality)) {
			props.onChange([...props.value, quality]);
		}
	};

	const unusedQualities = () =>
		props.availableQualities.filter((q) => !props.value.includes(q));

	return (
		<div class="space-y-3">
			<div class="space-y-1">
				<div class="text-sm font-medium leading-none">Allowed Qualities</div>
				<p class="text-[10px] text-muted-foreground">
					Drag to reorder. Top items are preferred.
				</p>
			</div>

			<ul class="border rounded-md divide-y bg-card overflow-hidden">
				<For each={props.value}>
					{(quality) => (
						<li
							draggable="true"
							onDragStart={(e) => handleDragStart(e, quality)}
							onDragOver={(e) => handleDragOver(e, quality)}
							onDragEnd={handleDragEnd}
							class={`flex items-center gap-3 p-2.5 text-sm group bg-card hover:bg-accent/50 transition-colors cursor-default ${
								draggedItem() === quality ? "opacity-50" : ""
							}`}
						>
							<IconGripVertical class="h-4 w-4 text-muted-foreground/50 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" />
							<span class="flex-1 font-medium">{quality}</span>
							<Button
								variant="ghost"
								size="icon"
								class="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
								onClick={() => removeQuality(quality)}
							>
								<IconX class="h-3.5 w-3.5" />
							</Button>
						</li>
					)}
				</For>
				<Show when={props.value.length === 0}>
					<li class="p-4 text-center text-sm text-muted-foreground bg-muted/20">
						No qualities selected
					</li>
				</Show>
			</ul>

			<Select
				value={null}
				onChange={(val) => val && addQuality(val)}
				options={unusedQualities()}
				placeholder="Add quality..."
				itemComponent={(props) => (
					<SelectItem item={props.item}>{props.item.rawValue}</SelectItem>
				)}
			>
				<SelectTrigger class="w-full">
					<SelectValue<string>>
						{() => (
							<div class="flex items-center gap-2 text-muted-foreground">
								<IconPlus class="h-4 w-4" />
								Add Quality...
							</div>
						)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent />
			</Select>
		</div>
	);
}

const ProfileSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1, "Name is required")),
	cutoff: v.pipe(v.string(), v.minLength(1, "Cutoff is required")),
	upgrade_allowed: v.boolean(),
	seadex_preferred: v.boolean(),
	allowed_qualities: v.array(v.string()),
});

function ProfileForm(props: {
	profile?: QualityProfile;
	onCancel: () => void;
	onSuccess: () => void;
}) {
	const createProfile = createCreateProfileMutation();
	const updateProfile = createUpdateProfileMutation();
	const qualitiesQuery = createQualitiesQuery();
	const isEditing = !!props.profile;

	const form = createForm(() => ({
		defaultValues: {
			name: props.profile?.name || "",
			cutoff: props.profile?.cutoff || "BluRay 1080p",
			upgrade_allowed: props.profile?.upgrade_allowed ?? true,
			seadex_preferred: props.profile?.seadex_preferred ?? true,
			allowed_qualities: props.profile?.allowed_qualities || [
				"BluRay 1080p",
				"WEB-DL 1080p",
			],
		},
		validators: {
			onChange: ProfileSchema,
		},
		onSubmit: async ({ value }) => {
			if (isEditing && props.profile) {
				await updateProfile.mutateAsync({
					name: props.profile.name,
					profile: value,
				});
			} else {
				await createProfile.mutateAsync(value);
			}
			props.onSuccess();
		},
	}));

	const qualityNames = () => qualitiesQuery.data?.map((q) => q.name) ?? [];

	return (
		<Card class="border-primary/20">
			<CardHeader class="pb-4">
				<CardTitle class="text-base">
					{isEditing ? "Edit Profile" : "Create Profile"}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					class="space-y-4"
				>
					<form.Field name="name">
						{(field) => (
							<TextField
								value={field().state.value}
								onChange={field().handleChange}
								disabled={isEditing}
							>
								<TextFieldLabel>Profile Name</TextFieldLabel>
								<TextFieldInput placeholder="e.g., HD Quality" />
								<TextFieldErrorMessage>
									{field().state.meta.errors[0]?.message}
								</TextFieldErrorMessage>
							</TextField>
						)}
					</form.Field>

					<form.Field name="cutoff">
						{(field) => (
							<div class="flex flex-col gap-1">
								<label
									class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
									for={field().name}
								>
									Cutoff Quality
								</label>
								<Select
									name={field().name}
									value={
										qualityNames().includes(field().state.value)
											? field().state.value
											: null
									}
									onChange={(val) => val && field().handleChange(val)}
									options={qualityNames()}
									placeholder="Select cutoff..."
									itemComponent={(props) => (
										<SelectItem item={props.item}>
											{props.item.rawValue}
										</SelectItem>
									)}
								>
									<SelectTrigger class="w-full">
										<SelectValue<string>>
											{(state) => state.selectedOption()}
										</SelectValue>
									</SelectTrigger>
									<SelectContent />
								</Select>
								<Show when={field().state.meta.errors.length > 0}>
									<div class="text-[0.8rem] text-destructive">
										{field().state.meta.errors[0]?.message}
									</div>
								</Show>
							</div>
						)}
					</form.Field>

					<form.Field name="allowed_qualities">
						{(field) => (
							<SortableQualityList
								value={field().state.value}
								onChange={field().handleChange}
								availableQualities={qualityNames()}
							/>
						)}
					</form.Field>

					<div class="flex gap-6 pt-2">
						<form.Field name="upgrade_allowed">
							{(field) => (
								<div class="flex items-center gap-2">
									<Switch
										id={field().name}
										checked={field().state.value}
										onChange={(checked) => field().handleChange(checked)}
									/>
									<label
										for={field().name}
										class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
									>
										Allow Upgrades
									</label>
								</div>
							)}
						</form.Field>

						<form.Field name="seadex_preferred">
							{(field) => (
								<div class="flex items-center gap-2">
									<Switch
										id={field().name}
										checked={field().state.value}
										onChange={(checked) => field().handleChange(checked)}
									/>
									<label
										for={field().name}
										class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
									>
										Prefer SeaDex
									</label>
								</div>
							)}
						</form.Field>
					</div>

					<div class="flex gap-2 justify-end pt-2">
						<Button type="button" variant="ghost" onClick={props.onCancel}>
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
										createProfile.isPending ||
										updateProfile.isPending
									}
								>
									{state()[1] ? "Saving..." : isEditing ? "Update" : "Create"}
								</Button>
							)}
						</form.Subscribe>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

const ReleaseProfileSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1, "Name is required")),
	enabled: v.boolean(),
	rules: v.array(
		v.object({
			term: v.pipe(v.string(), v.minLength(1, "Term is required")),
			rule_type: v.picklist(["preferred", "must", "must_not"]),
			score: v.number(),
		}),
	),
});

function ReleaseProfileForm(props: {
	profile?: ReleaseProfile;
	onCancel: () => void;
	onSuccess: () => void;
}) {
	const createProfile = createCreateReleaseProfileMutation();
	const updateProfile = createUpdateReleaseProfileMutation();
	const isEditing = !!props.profile;

	const form = createForm(() => ({
		defaultValues: {
			name: props.profile?.name || "",
			enabled: props.profile?.enabled ?? true,
			rules: props.profile?.rules || [],
		},
		validators: {
			onChange: ReleaseProfileSchema,
		},
		onSubmit: async ({ value }) => {
			if (isEditing && props.profile) {
				await updateProfile.mutateAsync({
					id: props.profile.id,
					data: value,
				});
			} else {
				await createProfile.mutateAsync(value);
			}
			props.onSuccess();
		},
	}));

	return (
		<Card class="border-primary/20">
			<CardHeader class="pb-4">
				<CardTitle class="text-base">
					{isEditing ? "Edit Profile" : "Create Profile"}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					class="space-y-4"
				>
					<div class="flex items-start gap-4">
						<form.Field name="name">
							{(field) => (
								<TextField
									class="flex-1"
									value={field().state.value}
									onChange={field().handleChange}
								>
									<TextFieldLabel>Profile Name</TextFieldLabel>
									<TextFieldInput placeholder="e.g., Preferred Groups" />
									<TextFieldErrorMessage>
										{field().state.meta.errors[0]?.message}
									</TextFieldErrorMessage>
								</TextField>
							)}
						</form.Field>

						<form.Field name="enabled">
							{(field) => (
								<div class="flex flex-col gap-3 pt-8">
									<div class="flex items-center gap-2">
										<Switch
											id={field().name}
											checked={field().state.value}
											onChange={(checked) => field().handleChange(checked)}
										/>
										<label
											for={field().name}
											class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
										>
											Enabled
										</label>
									</div>
								</div>
							)}
						</form.Field>
					</div>

					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<div class="space-y-1">
								<h4 class="text-sm font-medium">Rules</h4>
								<p class="text-xs text-muted-foreground">
									Define terms to prefer or require/block
								</p>
							</div>
							<form.Field name="rules" mode="array">
								{(field) => (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() =>
											field().pushValue({
												term: "",
												rule_type: "preferred",
												score: 10,
											})
										}
									>
										<IconPlus class="mr-2 h-3.5 w-3.5" />
										Add Rule
									</Button>
								)}
							</form.Field>
						</div>

						<form.Field name="rules" mode="array">
							{(field) => (
								<div class="space-y-2">
									<Index each={field().state.value}>
										{(_, index) => (
											<div class="flex gap-2 items-start">
												<form.Field name={`rules[${index}].term`}>
													{(termField) => (
														<div class="flex-1">
															<TextField
																value={termField().state.value}
																onChange={termField().handleChange}
															>
																<TextFieldInput placeholder="Term (e.g. SubsPlease)" />
															</TextField>
														</div>
													)}
												</form.Field>

												<form.Field name={`rules[${index}].rule_type`}>
													{(typeField) => (
														<div class="w-[140px]">
															<Select
																value={typeField().state.value}
																onChange={(val) =>
																	val && typeField().handleChange(val)
																}
																options={["preferred", "must", "must_not"]}
																itemComponent={(props) => (
																	<SelectItem item={props.item}>
																		{props.item.rawValue === "preferred"
																			? "Preferred"
																			: props.item.rawValue === "must"
																				? "Must Contain"
																				: "Must Not Contain"}
																	</SelectItem>
																)}
															>
																<SelectTrigger>
																	<SelectValue<string>>
																		{(state) =>
																			state.selectedOption() === "preferred"
																				? "Preferred"
																				: state.selectedOption() === "must"
																					? "Must Contain"
																					: "Must Not Contain"
																		}
																	</SelectValue>
																</SelectTrigger>
																<SelectContent />
															</Select>
														</div>
													)}
												</form.Field>

												<form.Field name={`rules[${index}].score`}>
													{(scoreField) => (
														<div class="w-[100px]">
															<TextField
																value={scoreField().state.value.toString()}
																onChange={(v) =>
																	scoreField().handleChange(Number(v))
																}
																disabled={
																	form.getFieldValue(
																		`rules[${index}].rule_type`,
																	) !== "preferred"
																}
															>
																<TextFieldInput
																	type="number"
																	placeholder="Score"
																/>
															</TextField>
														</div>
													)}
												</form.Field>

												<Button
													type="button"
													variant="ghost"
													size="icon"
													class="mt-0.5 text-muted-foreground hover:text-destructive"
													onClick={() => field().removeValue(index)}
												>
													<IconTrash class="h-4 w-4" />
												</Button>
											</div>
										)}
									</Index>
									<Show when={field().state.value.length === 0}>
										<div class="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg bg-muted/20">
											No rules defined. Add a rule to start scoring releases.
										</div>
									</Show>
								</div>
							)}
						</form.Field>
					</div>

					<div class="flex gap-2 justify-end pt-4">
						<Button type="button" variant="ghost" onClick={props.onCancel}>
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
										createProfile.isPending ||
										updateProfile.isPending
									}
								>
									{state()[1] ? "Saving..." : isEditing ? "Update" : "Create"}
								</Button>
							)}
						</form.Subscribe>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

const ConfigSchema = v.object({
	general: v.object({
		database_path: v.string(),
		log_level: v.string(),
		images_path: v.string(),
		suppress_connection_errors: v.boolean(),
	}),
	qbittorrent: v.object({
		enabled: v.boolean(),
		url: v.string(),
		username: v.string(),
		password: v.nullish(v.string()),
		default_category: v.string(),
	}),
	nyaa: v.object({
		base_url: v.string(),
		default_category: v.string(),
		filter_remakes: v.boolean(),
		preferred_resolution: v.nullish(v.string()),
		min_seeders: v.number(),
	}),
	scheduler: v.object({
		enabled: v.boolean(),
		check_interval_minutes: v.number(),
		cron_expression: v.nullish(v.string()),
		max_concurrent_checks: v.number(),
		check_delay_seconds: v.number(),
	}),
	downloads: v.object({
		root_path: v.string(),
		create_anime_folders: v.boolean(),
		preferred_groups: v.array(v.string()),
		use_seadex: v.boolean(),
		prefer_dual_audio: v.boolean(),
		preferred_codec: v.nullish(v.string()),
		max_size_gb: v.number(),
		remote_path_mappings: v.array(v.array(v.string())),
	}),
	library: v.object({
		library_path: v.string(),
		recycle_path: v.string(),
		recycle_cleanup_days: v.number(),
		naming_format: v.string(),
		import_mode: v.string(),
		movie_naming_format: v.string(),
	}),
	profiles: v.array(
		v.object({
			name: v.string(),
			cutoff: v.string(),
			upgrade_allowed: v.boolean(),
			seadex_preferred: v.boolean(),
			allowed_qualities: v.array(v.string()),
		}),
	),
	auth: v.object({
		username: v.string(),
		password: v.nullish(v.string()),
		api_key: v.nullish(v.string()),
	}),
});

function GeneralSettingsForm() {
	const configQuery = createSystemConfigQuery();
	const updateConfig = createUpdateSystemConfigMutation();

	// Use a signal to track if we've ever loaded data to prevent skeleton flicker after first load
	const [hasLoaded, setHasLoaded] = createSignal(false);

	return (
		<Show
			when={configQuery.data || hasLoaded()}
			fallback={<Skeleton class="h-96 rounded-lg" />}
		>
			<div
				ref={() => {
					if (configQuery.data) setHasLoaded(true);
				}}
			>
				<SystemForm
					// biome-ignore lint/style/noNonNullAssertion: Guarded by Show
					defaultValues={configQuery.data!}
					onSubmit={async (values) => {
						await updateConfig.mutateAsync(values);
					}}
					isSaving={updateConfig.isPending}
				/>
			</div>
		</Show>
	);
}

function SystemForm(props: {
	defaultValues: Config;
	onSubmit: (values: Config) => Promise<void>;
	isSaving?: boolean;
}) {
	const form = createForm(() => ({
		defaultValues: props.defaultValues,
		validators: {
			onChange: ConfigSchema,
		},
		onSubmit: async ({ value, formApi }) => {
			try {
				await props.onSubmit(value);
				formApi.reset(value);
				toast.success("Settings saved successfully");
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
	}));

	const systemStatus = createSystemStatusQuery();
	const triggerScan = createTriggerScanMutation();
	const triggerRss = createTriggerRssCheckMutation();

	const handleTriggerScan = async () => {
		try {
			await triggerScan.mutateAsync();
			toast.success("Library scan started");
		} catch (_e) {
			toast.error("Failed to start scan");
		}
	};

	const handleTriggerRss = async () => {
		try {
			await triggerRss.mutateAsync();
			toast.success("RSS check started");
		} catch (_e) {
			toast.error("Failed to start RSS check");
		}
	};

	const formatLastRun = (dateStr?: string | null) => {
		if (!dateStr) return "Never";
		try {
			// SQLite stores as "YYYY-MM-DD HH:MM:SS" in UTC
			const date = new Date(`${dateStr.replace(" ", "T")}Z`);
			return date.toLocaleString();
		} catch (_e) {
			return dateStr;
		}
	};

	return (
		<form
			autocomplete="off"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			class="space-y-12 pb-24"
		>
			<input type="password" style={{ display: "none" }} />

			{/* General Section */}
			<section class="space-y-6">
				<div class="mb-4 pb-2 border-b">
					<h3 class="text-base font-medium text-foreground">Application</h3>
					<p class="text-sm text-muted-foreground mt-1">
						Basic application configuration
					</p>
				</div>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
					<form.Field name="general.log_level">
						{(field) => (
							<div class="flex flex-col gap-1">
								<label
									class="text-sm font-medium leading-none"
									for={field().name}
								>
									Log Level
								</label>
								<Select
									name={field().name}
									value={field().state.value}
									onChange={(val) => val && field().handleChange(val)}
									options={["error", "warn", "info", "debug", "trace"]}
									placeholder="Select log level..."
									itemComponent={(props) => (
										<SelectItem item={props.item}>
											{props.item.rawValue}
										</SelectItem>
									)}
								>
									<SelectTrigger class="w-full">
										<SelectValue<string>>
											{(state) => state.selectedOption()}
										</SelectValue>
									</SelectTrigger>
									<SelectContent />
								</Select>
							</div>
						)}
					</form.Field>
					<form.Field name="general.images_path">
						{(field) => (
							<TextField
								value={field().state.value}
								onChange={field().handleChange}
							>
								<TextFieldLabel>Images Path</TextFieldLabel>
								<TextFieldInput />
							</TextField>
						)}
					</form.Field>
					<form.Field name="general.suppress_connection_errors">
						{(field) => (
							<div class="flex items-center gap-3 pt-6">
								<Switch
									checked={field().state.value}
									onChange={(checked) => field().handleChange(checked)}
								/>
								<div>
									<span class="text-sm font-medium block">
										Suppress Connection Errors
									</span>
									<span class="text-xs text-muted-foreground">
										Hide noisy retry logs from qBittorrent/Network
									</span>
								</div>
							</div>
						)}
					</form.Field>
				</div>
			</section>

			{/* Library Section */}
			<section class="space-y-6">
				<div class="mb-4 pb-2 border-b">
					<h3 class="text-base font-medium text-foreground">Library</h3>
					<p class="text-sm text-muted-foreground mt-1">
						Media library paths and organization
					</p>
				</div>
				<div class="space-y-6 max-w-4xl">
					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<form.Field name="library.library_path">
							{(field) => (
								<TextField
									value={field().state.value}
									onChange={field().handleChange}
								>
									<TextFieldLabel>Library Root Path</TextFieldLabel>
									<TextFieldInput />
								</TextField>
							)}
						</form.Field>
						<form.Field name="library.recycle_path">
							{(field) => (
								<TextField
									value={field().state.value}
									onChange={field().handleChange}
								>
									<TextFieldLabel>Recycle Bin Path</TextFieldLabel>
									<TextFieldInput />
								</TextField>
							)}
						</form.Field>
					</div>
					<form.Field name="library.naming_format">
						{(field) => (
							<TextField
								value={field().state.value}
								onChange={field().handleChange}
							>
								<TextFieldLabel>Naming Format (TV)</TextFieldLabel>
								<TextFieldInput placeholder="{Series Title} - S{Season:02}E{Episode:02} - {Title}" />
								<p class="text-xs text-muted-foreground mt-1">
									Available:{" "}
									{
										"{Series Title}, {Season}, {Episode}, {Title}, {Year}, {Resolution}, {Codec}, {Duration}, {Audio}, {Group}"
									}
								</p>
							</TextField>
						)}
					</form.Field>
					<form.Field name="library.movie_naming_format">
						{(field) => (
							<TextField
								value={field().state.value}
								onChange={field().handleChange}
							>
								<TextFieldLabel>Naming Format (Movies)</TextFieldLabel>
								<TextFieldInput placeholder="{Series Title}/{Series Title}" />
								<p class="text-xs text-muted-foreground mt-1">
									Available:{" "}
									{
										"{Series Title}, {Title}, {Year}, {Resolution}, {Codec}, {Duration}, {Audio}, {Group}"
									}
								</p>
							</TextField>
						)}
					</form.Field>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<form.Field name="library.import_mode">
							{(field) => (
								<div class="flex flex-col gap-1">
									<label
										class="text-sm font-medium leading-none"
										for={field().name}
									>
										Import Mode
									</label>
									<Select
										name={field().name}
										value={field().state.value}
										onChange={(val) => val && field().handleChange(val)}
										options={["Copy", "Move", "Hardlink"]}
										placeholder="Select mode..."
										itemComponent={(props) => (
											<SelectItem item={props.item}>
												{props.item.rawValue}
											</SelectItem>
										)}
									>
										<SelectTrigger class="w-full">
											<SelectValue<string>>
												{(state) => state.selectedOption()}
											</SelectValue>
										</SelectTrigger>
										<SelectContent />
									</Select>
								</div>
							)}
						</form.Field>
					</div>
				</div>
			</section>

			{/* Download Client Section */}
			<section class="space-y-6">
				<div class="mb-4 pb-2 border-b flex justify-between items-center">
					<div>
						<h3 class="text-base font-medium text-foreground">
							Download Client
						</h3>
						<p class="text-sm text-muted-foreground mt-1">
							Connection settings for qBittorrent
						</p>
					</div>
					<form.Field name="qbittorrent.enabled">
						{(field) => (
							<div class="flex items-center gap-3">
								<span class="text-sm font-medium text-muted-foreground flex items-center gap-2">
									<IconPower class="h-3.5 w-3.5" />
									Enabled
								</span>
								<Switch
									checked={field().state.value}
									onChange={(checked) => field().handleChange(checked)}
								/>
							</div>
						)}
					</form.Field>
				</div>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
					<form.Field name="qbittorrent.url">
						{(field) => (
							<TextField
								value={field().state.value}
								onChange={field().handleChange}
							>
								<TextFieldLabel>URL</TextFieldLabel>
								<TextFieldInput placeholder="http://localhost:8080" />
							</TextField>
						)}
					</form.Field>
					<form.Field name="qbittorrent.default_category">
						{(field) => (
							<TextField
								value={field().state.value}
								onChange={field().handleChange}
							>
								<TextFieldLabel>Category</TextFieldLabel>
								<TextFieldInput placeholder="bakarr" />
							</TextField>
						)}
					</form.Field>
					<form.Field name="qbittorrent.username">
						{(field) => (
							<TextField
								value={field().state.value}
								onChange={field().handleChange}
							>
								<TextFieldLabel>Username</TextFieldLabel>
								<TextFieldInput autocomplete="off" />
							</TextField>
						)}
					</form.Field>
					<form.Field name="qbittorrent.password">
						{(field) => (
							<TextField
								value={field().state.value || ""}
								onChange={field().handleChange}
							>
								<TextFieldLabel>Password</TextFieldLabel>
								<TextFieldInput type="password" autocomplete="off" />
							</TextField>
						)}
					</form.Field>
				</div>
			</section>

			{/* Scheduler Section */}
			<section class="space-y-6">
				<div class="mb-4 pb-2 border-b flex justify-between items-center">
					<div>
						<h3 class="text-base font-medium text-foreground">Scheduler</h3>
						<p class="text-sm text-muted-foreground mt-1">
							Configure background tasks and check intervals
						</p>
					</div>
					<form.Field name="scheduler.enabled">
						{(field) => (
							<div class="flex items-center gap-3">
								<span class="text-sm font-medium text-muted-foreground flex items-center gap-2">
									<IconPower class="h-3.5 w-3.5" />
									Enabled
								</span>
								<Switch
									checked={field().state.value}
									onChange={(checked) => field().handleChange(checked)}
								/>
							</div>
						)}
					</form.Field>
				</div>

				<div class="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-5xl">
					<div class="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
						<form.Field name="scheduler.check_interval_minutes">
							{(field) => (
								<TextField
									value={field().state.value.toString()}
									onChange={(v) => field().handleChange(Number(v))}
								>
									<TextFieldLabel>Check Interval (Minutes)</TextFieldLabel>
									<TextFieldInput type="number" />
								</TextField>
							)}
						</form.Field>
						<form.Field name="scheduler.max_concurrent_checks">
							{(field) => (
								<TextField
									value={field().state.value.toString()}
									onChange={(v) => field().handleChange(Number(v))}
								>
									<TextFieldLabel>Max Concurrent Checks</TextFieldLabel>
									<TextFieldInput type="number" />
								</TextField>
							)}
						</form.Field>
						<form.Field name="scheduler.check_delay_seconds">
							{(field) => (
								<TextField
									value={field().state.value.toString()}
									onChange={(v) => field().handleChange(Number(v))}
								>
									<TextFieldLabel>Check Delay (Seconds)</TextFieldLabel>
									<TextFieldInput type="number" />
								</TextField>
							)}
						</form.Field>
						<form.Field name="scheduler.cron_expression">
							{(field) => (
								<TextField
									value={field().state.value || ""}
									onChange={field().handleChange}
								>
									<TextFieldLabel>Cron Expression (Optional)</TextFieldLabel>
									<TextFieldInput placeholder="0 */6 * * *" />
									<p class="text-xs text-muted-foreground mt-1">
										Overrides interval if set
									</p>
								</TextField>
							)}
						</form.Field>
					</div>

					<div class="space-y-4">
						<h4 class="text-sm font-medium text-muted-foreground uppercase tracking-wider">
							Task Status
						</h4>
						<div class="space-y-3">
							<div class="p-3 border rounded-lg bg-secondary/20 flex flex-col gap-2">
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium">Library Scan</span>
									<Button
										variant="outline"
										size="sm"
										class="h-7 text-[10px] px-2"
										onClick={handleTriggerScan}
										disabled={triggerScan.isPending}
									>
										Run Now
									</Button>
								</div>
								<div class="text-[11px] text-muted-foreground flex justify-between">
									<span>Last Run:</span>
									<span class="text-foreground font-mono">
										{formatLastRun(systemStatus.data?.last_scan)}
									</span>
								</div>
							</div>

							<div class="p-3 border rounded-lg bg-secondary/20 flex flex-col gap-2">
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium">RSS Check</span>
									<Button
										variant="outline"
										size="sm"
										class="h-7 text-[10px] px-2"
										onClick={handleTriggerRss}
										disabled={triggerRss.isPending}
									>
										Run Now
									</Button>
								</div>
								<div class="text-[11px] text-muted-foreground flex justify-between">
									<span>Last Run:</span>
									<span class="text-foreground font-mono">
										{formatLastRun(systemStatus.data?.last_rss)}
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Indexer Section */}
			<section class="space-y-6">
				<div class="mb-4 pb-2 border-b">
					<h3 class="text-base font-medium text-foreground">Indexer</h3>
					<p class="text-sm text-muted-foreground mt-1">
						Nyaa.si configuration
					</p>
				</div>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
					<form.Field name="nyaa.base_url">
						{(field) => (
							<TextField
								value={field().state.value}
								onChange={field().handleChange}
							>
								<TextFieldLabel>Base URL</TextFieldLabel>
								<TextFieldInput placeholder="https://nyaa.si" />
							</TextField>
						)}
					</form.Field>
					<form.Field name="nyaa.min_seeders">
						{(field) => (
							<TextField
								value={field().state.value.toString()}
								onChange={(v) => field().handleChange(Number(v))}
							>
								<TextFieldLabel>Minimum Seeders</TextFieldLabel>
								<TextFieldInput type="number" />
							</TextField>
						)}
					</form.Field>
					<form.Field name="nyaa.filter_remakes">
						{(field) => (
							<div class="flex items-center gap-3 pt-6">
								<Switch
									checked={field().state.value}
									onChange={(checked) => field().handleChange(checked)}
								/>
								<div>
									<span class="text-sm font-medium block">Filter Remakes</span>
									<span class="text-xs text-muted-foreground">
										Exclude remakes from search results
									</span>
								</div>
							</div>
						)}
					</form.Field>
				</div>
			</section>

			{/* Downloads Section */}
			<section class="space-y-6">
				<div class="mb-4 pb-2 border-b">
					<h3 class="text-base font-medium text-foreground">Downloads</h3>
					<p class="text-sm text-muted-foreground mt-1">
						Global download and folder settings
					</p>
				</div>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
					<form.Field name="downloads.root_path">
						{(field) => (
							<TextField
								value={field().state.value}
								onChange={field().handleChange}
							>
								<TextFieldLabel>Download Root Path</TextFieldLabel>
								<TextFieldInput />
							</TextField>
						)}
					</form.Field>
					<form.Field name="downloads.max_size_gb">
						{(field) => (
							<TextField
								value={field().state.value.toString()}
								onChange={(v) => field().handleChange(Number(v))}
							>
								<TextFieldLabel>Max Size (GB)</TextFieldLabel>
								<TextFieldInput type="number" />
							</TextField>
						)}
					</form.Field>
					<form.Field name="downloads.create_anime_folders">
						{(field) => (
							<div class="flex items-center gap-3 pt-6">
								<Switch
									checked={field().state.value}
									onChange={(checked) => field().handleChange(checked)}
								/>
								<div>
									<span class="text-sm font-medium block">
										Create Anime Folders
									</span>
									<span class="text-xs text-muted-foreground">
										Create a separate folder for each anime
									</span>
								</div>
							</div>
						)}
					</form.Field>
					<form.Field name="downloads.use_seadex">
						{(field) => (
							<div class="flex items-center gap-3 pt-6">
								<Switch
									checked={field().state.value}
									onChange={(checked) => field().handleChange(checked)}
								/>
								<div>
									<span class="text-sm font-medium block">Use SeaDex</span>
									<span class="text-xs text-muted-foreground">
										Use SeaDex for release scoring and best release selection
									</span>
								</div>
							</div>
						)}
					</form.Field>
				</div>
			</section>

			<div class="flex gap-2 justify-end pt-2">
				<form.Subscribe
					selector={(state) => [
						state.canSubmit,
						state.isSubmitting,
						state.isDirty,
					]}
				>
					{(state) => (
						<Button
							type="submit"
							disabled={!state()[0] || props.isSaving}
							title={!state()[0] ? "Form validation failed" : ""}
						>
							{props.isSaving ? "Saving..." : "Save Changes"}
						</Button>
					)}
				</form.Subscribe>
			</div>
		</form>
	);
}

import {
	IconAdjustments,
	IconCopy,
	IconEdit,
	IconEye,
	IconEyeOff,
	IconGripVertical,
	IconKey,
	IconListCheck,
	IconLock,
	IconPlus,
	IconRefresh,
	IconSettings,
	IconTrash,
	IconX,
} from "@tabler/icons-solidjs";
import { createForm } from "@tanstack/solid-form";
import { createFileRoute } from "@tanstack/solid-router";
import {
	createEffect,
	createSignal,
	For,
	Index,
	type JSX,
	Show,
} from "solid-js";
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
import { Input } from "~/components/ui/input";
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
	createAuthApiKeyQuery,
	createChangePasswordMutation,
	createCreateProfileMutation,
	createCreateReleaseProfileMutation,
	createDeleteProfileMutation,
	createDeleteReleaseProfileMutation,
	createProfilesQuery,
	createQualitiesQuery,
	createRegenerateApiKeyMutation,
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
import { useAuth } from "~/lib/auth";

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
					<TabsTrigger
						value="security"
						class="rounded-none border-b-2 border-transparent data-[selected]:border-primary data-[selected]:shadow-none bg-transparent px-4 py-2"
					>
						<IconLock class="mr-2 h-4 w-4" />
						Security
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
														<Show when={profile.min_size || profile.max_size}>
															<div class="text-[10px] text-muted-foreground flex gap-2">
																<Show when={profile.min_size}>
																	<span>Min: {profile.min_size}</span>
																</Show>
																<Show when={profile.max_size}>
																	<span>Max: {profile.max_size}</span>
																</Show>
															</div>
														</Show>
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
															<div class="flex items-center gap-1.5">
																<Show
																	when={profile.enabled}
																	fallback={
																		<Badge
																			variant="outline"
																			class="text-[10px] h-5 px-1.5 text-muted-foreground"
																		>
																			Disabled
																		</Badge>
																	}
																>
																	<Badge class="text-[10px] h-5 px-1.5 bg-green-500/10 text-green-600 border-green-500/20 font-medium">
																		Enabled
																	</Badge>
																</Show>
																<Show when={profile.is_global}>
																	<Badge
																		variant="secondary"
																		class="text-[10px] h-5 px-1.5 font-normal"
																	>
																		Global
																	</Badge>
																</Show>
															</div>
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

				<TabsContent value="security" class="mt-0">
					<div class="mb-6">
						<h2 class="text-lg font-medium">Security</h2>
						<p class="text-sm text-muted-foreground">
							Manage your password and API access
						</p>
					</div>
					<SecuritySettingsForm />
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

function SizeInput(props: {
	label: string;
	value: string;
	onChange: (value: string | undefined) => void;
	error?: string;
}) {
	const [amount, setAmount] = createSignal<string>("");
	const [unit, setUnit] = createSignal<"MB" | "GB">("MB");

	// Parse initial value
	createEffect(() => {
		if (props.value) {
			const match = props.value.match(/^(\d+(?:\.\d+)?)\s*(MB|GB)$/i);
			if (match) {
				setAmount(match[1]);
				setUnit(match[2].toUpperCase() as "MB" | "GB");
			}
		}
	});

	// Update parent when amount or unit changes
	const updateValue = () => {
		const amt = amount();
		if (amt && !Number.isNaN(Number(amt)) && Number(amt) > 0) {
			props.onChange(`${amt} ${unit()}`);
		} else {
			props.onChange(undefined);
		}
	};

	const inputId = `size-input-${props.label.toLowerCase().replace(/\s+/g, "-")}`;

	return (
		<div class="flex flex-col gap-1.5">
			<label
				for={inputId}
				class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
			>
				{props.label}
			</label>
			<div class="flex gap-2">
				<Input
					id={inputId}
					type="number"
					min="0"
					step="0.1"
					value={amount()}
					onInput={(e) => {
						setAmount(e.currentTarget.value);
						updateValue();
					}}
					placeholder="0"
					class="flex-1"
				/>
				<Select
					value={unit()}
					onChange={(val) => {
						if (val) {
							setUnit(val);
							updateValue();
						}
					}}
					options={["MB", "GB"]}
					itemComponent={(itemProps) => (
						<SelectItem item={itemProps.item}>
							{itemProps.item.rawValue}
						</SelectItem>
					)}
				>
					<SelectTrigger class="w-20">
						<SelectValue<string>>
							{(state) => state.selectedOption()}
						</SelectValue>
					</SelectTrigger>
					<SelectContent />
				</Select>
			</div>
			{props.error && (
				<div class="text-[0.8rem] text-destructive">{props.error}</div>
			)}
		</div>
	);
}

const ProfileSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1, "Name is required")),
	cutoff: v.pipe(v.string(), v.minLength(1, "Cutoff is required")),
	upgrade_allowed: v.boolean(),
	seadex_preferred: v.boolean(),
	allowed_qualities: v.array(v.string()),
	min_size: v.union([v.string(), v.undefined()]),
	max_size: v.union([v.string(), v.undefined()]),
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
			min_size: props.profile?.min_size || undefined,
			max_size: props.profile?.max_size || undefined,
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

					<div class="grid grid-cols-2 gap-4">
						<form.Field
							name="min_size"
							validators={{
								onChange: v.optional(
									v.pipe(
										v.string(),
										v.regex(
											/^\d+(\.\d+)?\s*(MB|GB)$/i,
											"Must be format like '500 MB' or '2.5 GB'",
										),
									),
								),
							}}
						>
							{(field) => (
								<SizeInput
									label="Minimum Size"
									value={field().state.value || ""}
									onChange={field().handleChange}
									error={field().state.meta.errors[0]?.message}
								/>
							)}
						</form.Field>

						<form.Field
							name="max_size"
							validators={{
								onChange: v.optional(
									v.pipe(
										v.string(),
										v.regex(
											/^\d+(\.\d+)?\s*(MB|GB)$/i,
											"Must be format like '500 MB' or '2.5 GB'",
										),
									),
								),
							}}
						>
							{(field) => (
								<SizeInput
									label="Maximum Size"
									value={field().state.value || ""}
									onChange={field().handleChange}
									error={field().state.meta.errors[0]?.message}
								/>
							)}
						</form.Field>
					</div>

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
	is_global: v.boolean(),
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
			is_global: props.profile?.is_global ?? true,
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

						<form.Field name="is_global">
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
											Global
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
		worker_threads: v.number(),
		max_db_connections: v.number(),
		min_db_connections: v.number(),
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
		metadata_refresh_hours: v.number(),
	}),
	downloads: v.object({
		root_path: v.pipe(
			v.string(),
			v.check(
				(s) => s.startsWith("/") || s.startsWith("\\") || s.includes(":\\"),
				"Must be an absolute path",
			),
		),
		create_anime_folders: v.boolean(),
		preferred_groups: v.array(v.string()),
		use_seadex: v.boolean(),
		prefer_dual_audio: v.boolean(),
		preferred_codec: v.nullish(v.string()),
		max_size_gb: v.number(),
		remote_path_mappings: v.array(v.array(v.string())),
	}),
	library: v.object({
		library_path: v.pipe(
			v.string(),
			v.check(
				(s) => s.startsWith("/") || s.startsWith("\\") || s.includes(":\\"),
				"Must be an absolute path",
			),
		),
		recycle_path: v.pipe(
			v.string(),
			v.check(
				(s) => s.startsWith("/") || s.startsWith("\\") || s.includes(":\\"),
				"Must be an absolute path",
			),
		),
		recycle_cleanup_days: v.number(),
		naming_format: v.string(),
		import_mode: v.string(),
		movie_naming_format: v.string(),
		auto_scan_interval_hours: v.number(),
		preferred_title: v.string(),
	}),
	profiles: v.array(
		v.object({
			name: v.string(),
			cutoff: v.string(),
			upgrade_allowed: v.boolean(),
			seadex_preferred: v.boolean(),
			allowed_qualities: v.array(v.string()),
			min_size: v.nullish(v.string()),
			max_size: v.nullish(v.string()),
		}),
	),
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

// Inline setting row component for Linear-style settings
function SettingRow(props: {
	label: string;
	description?: string;
	children: JSX.Element;
	class?: string;
}) {
	return (
		<div
			class={`flex items-center justify-between py-3 gap-8 ${props.class ?? ""}`}
		>
			<div class="flex-1 min-w-0">
				<div class="text-sm font-medium text-foreground">{props.label}</div>
				<Show when={props.description}>
					<div class="text-xs text-muted-foreground mt-0.5">
						{props.description}
					</div>
				</Show>
			</div>
			<div class="shrink-0">{props.children}</div>
		</div>
	);
}

// Section header for Linear-style grouping
function SettingSection(props: { title: string; children: JSX.Element }) {
	return (
		<div class="space-y-1">
			<div class="text-xs font-medium text-muted-foreground uppercase tracking-wider px-0.5 mb-3">
				{props.title}
			</div>
			<div class="divide-y divide-border/50">{props.children}</div>
		</div>
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
			class="space-y-8 pb-24 max-w-3xl"
		>
			<input type="password" style={{ display: "none" }} />

			{/* Application Section */}
			<SettingSection title="Application">
				<form.Field name="general.log_level">
					{(field) => (
						<SettingRow
							label="Log Level"
							description="Control verbosity of application logs"
						>
							<Select
								name={field().name}
								value={field().state.value}
								onChange={(val) => val && field().handleChange(val)}
								options={["error", "warn", "info", "debug", "trace"]}
								placeholder="Select..."
								itemComponent={(itemProps) => (
									<SelectItem item={itemProps.item}>
										{itemProps.item.rawValue}
									</SelectItem>
								)}
							>
								<SelectTrigger class="w-32">
									<SelectValue<string>>
										{(state) => state.selectedOption()}
									</SelectValue>
								</SelectTrigger>
								<SelectContent />
							</Select>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="general.images_path">
					{(field) => (
						<SettingRow
							label="Images Path"
							description="Local cache for cover art and images"
						>
							<Input
								value={field().state.value}
								onInput={(e) => field().handleChange(e.currentTarget.value)}
								class="w-64"
							/>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="general.worker_threads">
					{(field) => (
						<SettingRow
							label="Worker Threads"
							description="Number of threads for background tasks (0 = auto)"
						>
							<Input
								type="number"
								min="0"
								value={field().state.value?.toString() ?? "2"}
								onInput={(e) =>
									field().handleChange(Number(e.currentTarget.value))
								}
								class="w-24"
							/>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="general.suppress_connection_errors">
					{(field) => (
						<SettingRow
							label="Suppress Connection Errors"
							description="Hide noisy retry logs from qBittorrent/Network"
						>
							<Switch
								checked={field().state.value}
								onChange={(checked) => field().handleChange(checked)}
							/>
						</SettingRow>
					)}
				</form.Field>
			</SettingSection>

			{/* Library Section */}
			<SettingSection title="Library">
				<form.Field name="library.library_path">
					{(field) => (
						<SettingRow
							label="Library Path"
							description="Root folder for your anime library"
						>
							<Input
								value={field().state.value}
								onInput={(e) => field().handleChange(e.currentTarget.value)}
								class="w-64"
							/>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="library.recycle_path">
					{(field) => (
						<SettingRow
							label="Recycle Bin Path"
							description="Deleted files are moved here before permanent deletion"
						>
							<Input
								value={field().state.value}
								onInput={(e) => field().handleChange(e.currentTarget.value)}
								class="w-64"
							/>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="library.import_mode">
					{(field) => (
						<SettingRow
							label="Import Mode"
							description="How files are moved from downloads to library"
						>
							<Select
								name={field().name}
								value={field().state.value}
								onChange={(val) => val && field().handleChange(val)}
								options={["Copy", "Move", "Hardlink"]}
								placeholder="Select..."
								itemComponent={(itemProps) => (
									<SelectItem item={itemProps.item}>
										{itemProps.item.rawValue}
									</SelectItem>
								)}
							>
								<SelectTrigger class="w-32">
									<SelectValue<string>>
										{(state) => state.selectedOption()}
									</SelectValue>
								</SelectTrigger>
								<SelectContent />
							</Select>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="library.preferred_title">
					{(field) => (
						<SettingRow
							label="Preferred Title"
							description="Title language for folder and file naming"
						>
							<Select
								name={field().name}
								value={field().state.value}
								onChange={(val) => val && field().handleChange(val)}
								options={["stored", "english", "romaji"]}
								placeholder="Select..."
								itemComponent={(itemProps) => (
									<SelectItem item={itemProps.item}>
										{itemProps.item.rawValue === "stored"
											? "Existing"
											: itemProps.item.rawValue === "english"
												? "English"
												: "Romaji"}
									</SelectItem>
								)}
							>
								<SelectTrigger class="w-32">
									<SelectValue<string>>
										{(state) =>
											state.selectedOption() === "stored"
												? "Existing"
												: state.selectedOption() === "english"
													? "English"
													: "Romaji"
										}
									</SelectValue>
								</SelectTrigger>
								<SelectContent />
							</Select>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="library.auto_scan_interval_hours">
					{(field) => (
						<SettingRow
							label="Auto Scan Interval"
							description="Hours between automatic library scans"
						>
							<div class="flex items-center gap-2">
								<Input
									type="number"
									value={field().state.value.toString()}
									onInput={(e) =>
										field().handleChange(Number(e.currentTarget.value))
									}
									class="w-20"
								/>
								<span class="text-xs text-muted-foreground">hours</span>
							</div>
						</SettingRow>
					)}
				</form.Field>
			</SettingSection>

			{/* Naming Formats */}
			<SettingSection title="Naming Formats">
				<div class="py-3 space-y-4">
					<form.Field name="library.naming_format">
						{(field) => (
							<div class="space-y-2">
								<div class="text-sm font-medium text-foreground">
									TV Episodes
								</div>
								<Input
									value={field().state.value}
									onInput={(e) => field().handleChange(e.currentTarget.value)}
									placeholder="{Series Title} - S{Season:02}E{Episode:02} - {Title}"
									class="font-mono text-xs"
								/>
								<div class="text-[10px] text-muted-foreground">
									{
										"{Series Title}, {Season}, {Episode}, {Title}, {Year}, {Resolution}, {Codec}, {Group}"
									}
								</div>
							</div>
						)}
					</form.Field>

					<form.Field name="library.movie_naming_format">
						{(field) => (
							<div class="space-y-2">
								<div class="text-sm font-medium text-foreground">Movies</div>
								<Input
									value={field().state.value}
									onInput={(e) => field().handleChange(e.currentTarget.value)}
									placeholder="{Series Title}/{Series Title}"
									class="font-mono text-xs"
								/>
								<div class="text-[10px] text-muted-foreground">
									{
										"{Series Title}, {Title}, {Year}, {Resolution}, {Codec}, {Group}"
									}
								</div>
							</div>
						)}
					</form.Field>
				</div>
			</SettingSection>

			{/* Download Client Section */}
			<SettingSection title="Download Client">
				<form.Field name="qbittorrent.enabled">
					{(field) => (
						<SettingRow
							label="Enable qBittorrent"
							description="Connect to qBittorrent for downloading"
						>
							<Switch
								checked={field().state.value}
								onChange={(checked) => field().handleChange(checked)}
							/>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="qbittorrent.url">
					{(field) => (
						<SettingRow label="URL" description="qBittorrent Web UI address">
							<Input
								value={field().state.value}
								onInput={(e) => field().handleChange(e.currentTarget.value)}
								placeholder="http://localhost:8080"
								class="w-56"
							/>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="qbittorrent.username">
					{(field) => (
						<SettingRow label="Username">
							<Input
								value={field().state.value}
								onInput={(e) => field().handleChange(e.currentTarget.value)}
								autocomplete="off"
								class="w-40"
							/>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="qbittorrent.password">
					{(field) => (
						<SettingRow label="Password">
							<Input
								type="password"
								value={field().state.value || ""}
								onInput={(e) => field().handleChange(e.currentTarget.value)}
								autocomplete="off"
								class="w-40"
							/>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="qbittorrent.default_category">
					{(field) => (
						<SettingRow
							label="Category"
							description="qBittorrent category for downloads"
						>
							<Input
								value={field().state.value}
								onInput={(e) => field().handleChange(e.currentTarget.value)}
								placeholder="bakarr"
								class="w-32"
							/>
						</SettingRow>
					)}
				</form.Field>
			</SettingSection>

			{/* Scheduler Section */}
			<SettingSection title="Scheduler">
				<form.Field name="scheduler.enabled">
					{(field) => (
						<SettingRow
							label="Enable Scheduler"
							description="Run automated background tasks"
						>
							<Switch
								checked={field().state.value}
								onChange={(checked) => field().handleChange(checked)}
							/>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="scheduler.check_interval_minutes">
					{(field) => (
						<SettingRow
							label="Check Interval"
							description="Minutes between RSS checks"
						>
							<div class="flex items-center gap-2">
								<Input
									type="number"
									value={field().state.value.toString()}
									onInput={(e) =>
										field().handleChange(Number(e.currentTarget.value))
									}
									class="w-20"
								/>
								<span class="text-xs text-muted-foreground">min</span>
							</div>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="scheduler.max_concurrent_checks">
					{(field) => (
						<SettingRow
							label="Max Concurrent Checks"
							description="Parallel anime checks"
						>
							<Input
								type="number"
								value={field().state.value.toString()}
								onInput={(e) =>
									field().handleChange(Number(e.currentTarget.value))
								}
								class="w-20"
							/>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="scheduler.metadata_refresh_hours">
					{(field) => (
						<SettingRow
							label="Metadata Refresh"
							description="Hours between metadata updates"
						>
							<div class="flex items-center gap-2">
								<Input
									type="number"
									value={field().state.value.toString()}
									onInput={(e) =>
										field().handleChange(Number(e.currentTarget.value))
									}
									class="w-20"
								/>
								<span class="text-xs text-muted-foreground">hours</span>
							</div>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="scheduler.cron_expression">
					{(field) => (
						<SettingRow
							label="Cron Expression"
							description="Custom schedule (overrides interval)"
						>
							<Input
								value={field().state.value || ""}
								onInput={(e) => field().handleChange(e.currentTarget.value)}
								placeholder="0 */6 * * *"
								class="w-36 font-mono text-xs"
							/>
						</SettingRow>
					)}
				</form.Field>
			</SettingSection>

			{/* Tasks */}
			<SettingSection title="Tasks">
				<SettingRow
					label="Library Scan"
					description={`Last run: ${formatLastRun(systemStatus.data?.last_scan)}`}
				>
					<Button
						variant="outline"
						size="sm"
						onClick={handleTriggerScan}
						disabled={triggerScan.isPending}
					>
						{triggerScan.isPending ? "Running..." : "Run Now"}
					</Button>
				</SettingRow>

				<SettingRow
					label="RSS Check"
					description={`Last run: ${formatLastRun(systemStatus.data?.last_rss)}`}
				>
					<Button
						variant="outline"
						size="sm"
						onClick={handleTriggerRss}
						disabled={triggerRss.isPending}
					>
						{triggerRss.isPending ? "Running..." : "Run Now"}
					</Button>
				</SettingRow>
			</SettingSection>

			{/* Indexer Section */}
			<SettingSection title="Indexer">
				<form.Field name="nyaa.base_url">
					{(field) => (
						<SettingRow label="Nyaa URL" description="Base URL for Nyaa.si">
							<Input
								value={field().state.value}
								onInput={(e) => field().handleChange(e.currentTarget.value)}
								placeholder="https://nyaa.si"
								class="w-48"
							/>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="nyaa.min_seeders">
					{(field) => (
						<SettingRow
							label="Minimum Seeders"
							description="Skip releases with fewer seeders"
						>
							<Input
								type="number"
								value={field().state.value.toString()}
								onInput={(e) =>
									field().handleChange(Number(e.currentTarget.value))
								}
								class="w-20"
							/>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="nyaa.filter_remakes">
					{(field) => (
						<SettingRow
							label="Filter Remakes"
							description="Exclude remakes from search results"
						>
							<Switch
								checked={field().state.value}
								onChange={(checked) => field().handleChange(checked)}
							/>
						</SettingRow>
					)}
				</form.Field>
			</SettingSection>

			{/* Downloads Section */}
			<SettingSection title="Downloads">
				<form.Field name="downloads.root_path">
					{(field) => (
						<SettingRow
							label="Download Path"
							description="Where downloaded files are saved"
						>
							<Input
								value={field().state.value}
								onInput={(e) => field().handleChange(e.currentTarget.value)}
								class="w-64"
							/>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="downloads.max_size_gb">
					{(field) => (
						<SettingRow
							label="Max Size"
							description="Maximum file size for downloads"
						>
							<div class="flex items-center gap-2">
								<Input
									type="number"
									value={field().state.value.toString()}
									onInput={(e) =>
										field().handleChange(Number(e.currentTarget.value))
									}
									class="w-20"
								/>
								<span class="text-xs text-muted-foreground">GB</span>
							</div>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="downloads.create_anime_folders">
					{(field) => (
						<SettingRow
							label="Create Anime Folders"
							description="Organize downloads by anime title"
						>
							<Switch
								checked={field().state.value}
								onChange={(checked) => field().handleChange(checked)}
							/>
						</SettingRow>
					)}
				</form.Field>

				<form.Field name="downloads.use_seadex">
					{(field) => (
						<SettingRow
							label="Use SeaDex"
							description="Prefer SeaDex best releases for scoring"
						>
							<Switch
								checked={field().state.value}
								onChange={(checked) => field().handleChange(checked)}
							/>
						</SettingRow>
					)}
				</form.Field>
			</SettingSection>

			{/* Save Button - Sticky at bottom */}
			<div class="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-background via-background to-transparent -mx-1 px-1">
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
							class="w-full sm:w-auto"
						>
							{props.isSaving ? "Saving..." : "Save Changes"}
						</Button>
					)}
				</form.Subscribe>
			</div>
		</form>
	);
}

function SecuritySettingsForm() {
	const { auth } = useAuth();
	const apiKeyQuery = createAuthApiKeyQuery();
	const changePassword = createChangePasswordMutation();
	const regenerateApiKey = createRegenerateApiKeyMutation();

	const [currentPassword, setCurrentPassword] = createSignal("");
	const [newPassword, setNewPassword] = createSignal("");
	const [confirmPassword, setConfirmPassword] = createSignal("");
	const [passwordError, setPasswordError] = createSignal<string | null>(null);
	const [showCurrentPassword, setShowCurrentPassword] = createSignal(false);
	const [showNewPassword, setShowNewPassword] = createSignal(false);
	const [showApiKey, setShowApiKey] = createSignal(false);

	const handleChangePassword = async (e: Event) => {
		e.preventDefault();
		setPasswordError(null);

		if (newPassword().length < 8) {
			setPasswordError("Password must be at least 8 characters");
			return;
		}

		if (newPassword() !== confirmPassword()) {
			setPasswordError("Passwords do not match");
			return;
		}

		try {
			await changePassword.mutateAsync({
				current_password: currentPassword(),
				new_password: newPassword(),
			});
			toast.success("Password changed successfully");
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
		} catch (err) {
			setPasswordError(
				err instanceof Error ? err.message : "Failed to change password",
			);
		}
	};

	const handleRegenerateApiKey = async () => {
		try {
			const result = await regenerateApiKey.mutateAsync();
			// Update the stored API key in auth state
			const currentAuth = auth();
			if (currentAuth.isAuthenticated && result.api_key) {
				localStorage.setItem(
					"bakarr_auth",
					JSON.stringify({
						...currentAuth,
						apiKey: result.api_key,
					}),
				);
			}
			toast.success("API key regenerated successfully");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to regenerate API key",
			);
		}
	};

	const copyApiKey = async () => {
		const key = apiKeyQuery.data?.api_key;
		if (key) {
			await navigator.clipboard.writeText(key);
			toast.success("API key copied to clipboard");
		}
	};

	return (
		<div class="space-y-8">
			{/* Change Password Section */}
			<Card>
				<CardHeader>
					<CardTitle class="text-base flex items-center gap-2">
						<IconLock class="h-4 w-4" />
						Change Password
					</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleChangePassword} class="space-y-4 max-w-md">
						<TextField>
							<TextFieldLabel>Current Password</TextFieldLabel>
							<div class="relative">
								<TextFieldInput
									type={showCurrentPassword() ? "text" : "password"}
									value={currentPassword()}
									onInput={(e) => setCurrentPassword(e.currentTarget.value)}
									autocomplete="current-password"
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
									onClick={() => setShowCurrentPassword(!showCurrentPassword())}
								>
									<Show
										when={showCurrentPassword()}
										fallback={
											<IconEyeOff class="h-4 w-4 text-muted-foreground" />
										}
									>
										<IconEye class="h-4 w-4 text-muted-foreground" />
									</Show>
								</Button>
							</div>
						</TextField>

						<TextField>
							<TextFieldLabel>New Password</TextFieldLabel>
							<div class="relative">
								<TextFieldInput
									type={showNewPassword() ? "text" : "password"}
									value={newPassword()}
									onInput={(e) => setNewPassword(e.currentTarget.value)}
									autocomplete="new-password"
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
									onClick={() => setShowNewPassword(!showNewPassword())}
								>
									<Show
										when={showNewPassword()}
										fallback={
											<IconEyeOff class="h-4 w-4 text-muted-foreground" />
										}
									>
										<IconEye class="h-4 w-4 text-muted-foreground" />
									</Show>
								</Button>
							</div>
							<p class="text-xs text-muted-foreground mt-1">
								Minimum 8 characters
							</p>
						</TextField>

						<TextField>
							<TextFieldLabel>Confirm New Password</TextFieldLabel>
							<TextFieldInput
								type="password"
								value={confirmPassword()}
								onInput={(e) => setConfirmPassword(e.currentTarget.value)}
								autocomplete="new-password"
							/>
						</TextField>

						<Show when={passwordError()}>
							<p class="text-sm text-destructive">{passwordError()}</p>
						</Show>

						<Button
							type="submit"
							disabled={
								changePassword.isPending ||
								!currentPassword() ||
								!newPassword() ||
								!confirmPassword()
							}
						>
							{changePassword.isPending ? "Changing..." : "Change Password"}
						</Button>
					</form>
				</CardContent>
			</Card>

			{/* API Key Section */}
			<Card>
				<CardHeader>
					<CardTitle class="text-base flex items-center gap-2">
						<IconKey class="h-4 w-4" />
						API Key
					</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<p class="text-sm text-muted-foreground">
						Use this API key to authenticate external applications and streaming
						clients.
					</p>

					<div class="flex items-center gap-2 max-w-xl">
						<div class="flex-1 relative">
							<Input
								type={showApiKey() ? "text" : "password"}
								value={apiKeyQuery.data?.api_key || ""}
								readOnly
								class="pr-20 font-mono text-sm"
							/>
							<div class="absolute right-0 top-0 h-full flex items-center gap-1 pr-1">
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="h-7 w-7"
									onClick={() => setShowApiKey(!showApiKey())}
									title={showApiKey() ? "Hide API key" : "Show API key"}
								>
									<Show
										when={showApiKey()}
										fallback={
											<IconEyeOff class="h-4 w-4 text-muted-foreground" />
										}
									>
										<IconEye class="h-4 w-4 text-muted-foreground" />
									</Show>
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="h-7 w-7"
									onClick={copyApiKey}
									title="Copy API key"
								>
									<IconCopy class="h-4 w-4 text-muted-foreground" />
								</Button>
							</div>
						</div>
					</div>

					<AlertDialog>
						<AlertDialogTrigger
							as={(props: { onClick: () => void }) => (
								<Button
									variant="outline"
									onClick={props.onClick}
									disabled={regenerateApiKey.isPending}
								>
									<IconRefresh class="mr-2 h-4 w-4" />
									{regenerateApiKey.isPending
										? "Regenerating..."
										: "Regenerate API Key"}
								</Button>
							)}
						/>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
								<AlertDialogDescription>
									This will invalidate your current API key. Any applications or
									services using the old key will need to be updated with the
									new one.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction onClick={handleRegenerateApiKey}>
									Regenerate
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</CardContent>
			</Card>
		</div>
	);
}

import {
	IconAdjustments,
	IconArrowUp,
	IconEdit,
	IconPlus,
	IconPower,
	IconSettings,
	IconStar,
	IconTrash,
} from "@tabler/icons-solidjs";
import { createForm } from "@tanstack/solid-form";
import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
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
import { Checkbox } from "~/components/ui/checkbox";
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
	createDeleteProfileMutation,
	createProfilesQuery,
	createSystemConfigQuery,
	createUpdateProfileMutation,
	createUpdateSystemConfigMutation,
	profilesQueryOptions,
	type QualityProfile,
	systemConfigQueryOptions,
} from "~/lib/api";

export const Route = createFileRoute("/_layout/settings")({
	loader: ({ context: { queryClient } }) => {
		queryClient.ensureQueryData(profilesQueryOptions());
		queryClient.ensureQueryData(systemConfigQueryOptions());
	},
	component: SettingsPage,
	errorComponent: GeneralError,
});

const QUALITY_OPTIONS = [
	"BluRay 2160p",
	"WEB 2160p",
	"BluRay 1080p",
	"WEB 1080p",
	"BluRay 720p",
	"WEB 720p",
	"HDTV 1080p",
	"HDTV 720p",
	"HDTV 480p",
];

function SettingsPage() {
	const [activeTab, setActiveTab] = createSignal("general");
	const [editingProfile, setEditingProfile] =
		createSignal<QualityProfile | null>(null);
	const [isCreating, setIsCreating] = createSignal(false);

	const profilesQuery = createProfilesQuery();
	const deleteProfile = createDeleteProfileMutation();

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
				</TabsList>

				<TabsContent value="general" class="mt-0">
					<div class="animate-in fade-in duration-500 ease-out">
						<div class="mb-6">
							<h2 class="text-lg font-medium">General Settings</h2>
							<p class="text-sm text-muted-foreground">
								Manage your application settings and configuration
							</p>
						</div>
						<GeneralSettingsForm />
					</div>
				</TabsContent>

				<TabsContent value="profiles" class="mt-0">
					<div class="animate-in fade-in duration-500 ease-out">
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

						<Show when={isCreating()}>
							<div class="mb-6">
								<ProfileForm
									onCancel={() => setIsCreating(false)}
									onSuccess={() => setIsCreating(false)}
								/>
							</div>
						</Show>

						<Show when={editingProfile()}>
							<div class="mb-6">
								<ProfileForm
									// biome-ignore lint/style/noNonNullAssertion: Guarded by Show
									profile={editingProfile()!}
									onCancel={() => setEditingProfile(null)}
									onSuccess={() => setEditingProfile(null)}
								/>
							</div>
						</Show>

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
					</div>
				</TabsContent>
			</Tabs>
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
	const isEditing = !!props.profile;

	const form = createForm(() => ({
		defaultValues: {
			name: props.profile?.name || "",
			cutoff: props.profile?.cutoff || "BluRay 1080p",
			upgrade_allowed: props.profile?.upgrade_allowed ?? true,
			seadex_preferred: props.profile?.seadex_preferred ?? true,
			allowed_qualities: props.profile?.allowed_qualities || [
				"BluRay 1080p",
				"WEB 1080p",
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
										QUALITY_OPTIONS.includes(field().state.value)
											? field().state.value
											: null
									}
									onChange={(val) => val && field().handleChange(val)}
									options={QUALITY_OPTIONS}
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
							<div class="space-y-2">
								<div class="text-sm font-medium leading-none">
									Allowed Qualities
								</div>
								<div class="grid grid-cols-2 md:grid-cols-3 gap-2">
									<For each={QUALITY_OPTIONS}>
										{(q) => (
											// biome-ignore lint/a11y/noLabelWithoutControl: Wrapped checkbox
											<label class="flex items-center gap-2 text-sm cursor-pointer">
												<Checkbox
													checked={field().state.value.includes(q)}
													onChange={(checked) => {
														if (checked) {
															field().handleChange([...field().state.value, q]);
														} else {
															field().handleChange(
																field().state.value.filter((x) => x !== q),
															);
														}
													}}
												/>
												{q}
											</label>
										)}
									</For>
								</div>
							</div>
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
										<IconArrowUp class="h-3.5 w-3.5" />
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
										<IconStar class="h-3.5 w-3.5" />
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

function GeneralSettingsForm() {
	const configQuery = createSystemConfigQuery();
	const updateConfig = createUpdateSystemConfigMutation();

	return (
		<Show
			when={configQuery.data}
			fallback={<Skeleton class="h-96 rounded-lg" />}
		>
			<SystemForm
				// biome-ignore lint/style/noNonNullAssertion: Guarded by Show
				defaultValues={configQuery.data!}
				onSubmit={async (values) => {
					await updateConfig.mutateAsync(values);
				}}
			/>
		</Show>
	);
}

function SystemForm(props: {
	defaultValues: Config;
	onSubmit: (values: Config) => Promise<void>;
}) {
	const form = createForm(() => ({
		defaultValues: props.defaultValues,
		onSubmit: async ({ value, formApi }) => {
			await props.onSubmit(value);
			formApi.reset(value);
		},
	}));

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

			<div class="flex gap-2 justify-end pt-2">
				<form.Subscribe
					selector={(state) => [
						state.canSubmit,
						state.isSubmitting,
						state.isDirty,
					]}
				>
					{(state) => (
						<Button type="submit" disabled={!state()[0] || !state()[2]}>
							{state()[1] ? "Saving..." : "Save Changes"}
						</Button>
					)}
				</form.Subscribe>
			</div>
		</form>
	);
}

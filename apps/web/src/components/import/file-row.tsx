import { IconAlertTriangle, IconCheck, IconFile } from "@tabler/icons-solidjs";
import { createMemo, Show } from "solid-js";
import { EditMappingPopover } from "~/components/edit-mapping-popover";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import type { FileRowProps } from "./types";

export function FileRow(props: FileRowProps) {
	const matchedAnimeId = () =>
		props.file.matched_anime?.id || props.selectedAnimeId;
	const hasMatch = () => !!matchedAnimeId();

	const displayEpisode = () =>
		props.currentEpisode !== undefined
			? props.currentEpisode
			: Math.floor(props.file.episode_number);
	const displaySeason = () =>
		props.currentSeason !== undefined ? props.currentSeason : props.file.season;

	const allOptions = createMemo(() => {
		return [
			...props.animeList.map((a) => ({ ...a, source: "library" as const })),
			...props.candidates
				.filter((c) => !props.animeList.some((a) => a.id === c.id))
				.map((c) => ({ ...c, source: "candidate" as const })),
		].sort((a, b) => {
			const titleA = a.title.english || a.title.romaji || "";
			const titleB = b.title.english || b.title.romaji || "";
			return titleA.localeCompare(titleB);
		});
	});

	return (
		<li
			class={cn(
				"px-8 py-3 transition-colors list-none",
				props.isSelected ? "bg-primary/5" : "hover:bg-muted/50",
			)}
		>
			<div class="flex items-center gap-4 min-w-0">
				<Checkbox
					checked={props.isSelected}
					disabled={!hasMatch()}
					onChange={(checked) => {
						const id = matchedAnimeId();
						if (checked && id) {
							props.onToggle(id);
						} else if (!checked && id) {
							props.onToggle(id);
						}
					}}
					class="shrink-0"
				/>
				<IconFile class="h-4 w-4 text-muted-foreground shrink-0" />
				<div class="flex-1 min-w-0 overflow-hidden">
					<span class="text-sm font-medium truncate block">
						{props.file.filename}
					</span>
				</div>
				<div class="flex items-center gap-1.5 shrink-0">
					<EditMappingPopover
						episode={displayEpisode()}
						season={displaySeason()}
						onSave={props.onMappingChange}
					/>
					<Show when={props.file.resolution}>
						<Badge variant="secondary" class="text-xs">
							{props.file.resolution}
						</Badge>
					</Show>
				</div>
				<div class="flex items-center gap-2 shrink-0 w-64">
					<Show
						when={hasMatch()}
						fallback={
							<>
								<IconAlertTriangle class="h-4 w-4 text-yellow-600 shrink-0" />
								<Select
									value={null}
									onChange={(v) => {
										if (v) {
											const newId = v.id;
											props.onToggle(newId);
										}
									}}
									options={allOptions()}
									optionValue="id"
									optionTextValue={(opt) =>
										opt.title.english || opt.title.romaji || "Unknown Title"
									}
									placeholder="Select anime..."
									itemComponent={(props) => (
										<SelectItem item={props.item}>
											<span class="flex items-center gap-2">
												{props.item.rawValue?.title.english ||
													props.item.rawValue?.title.romaji}
												<Show
													when={props.item.rawValue?.source === "candidate"}
												>
													<Badge
														variant="secondary"
														class="h-4 px-1 text-[9px]"
													>
														New
													</Badge>
												</Show>
											</span>
										</SelectItem>
									)}
								>
									<SelectTrigger class="h-8 text-xs flex-1">
										{/* biome-ignore lint/suspicious/noExplicitAny: complex type */}
										<SelectValue<any>>
											{(_state) => (
												<span class="text-muted-foreground">
													Select anime...
												</span>
											)}
										</SelectValue>
									</SelectTrigger>
									<SelectContent />
								</Select>
							</>
						}
					>
						<IconCheck class="h-4 w-4 text-green-600 shrink-0" />
						<Select
							value={allOptions().find(
								(o) => o.id === (props.selectedAnimeId || matchedAnimeId()),
							)}
							onChange={(v) => {
								if (v) {
									const newId = v.id;
									props.onAnimeChange(newId);
									if (!props.isSelected) {
										props.onToggle(newId);
									}
								}
							}}
							options={allOptions()}
							optionValue="id"
							optionTextValue={(opt) =>
								opt.title.english || opt.title.romaji || "Unknown Title"
							}
							itemComponent={(props) => (
								<SelectItem item={props.item}>
									<span class="flex items-center gap-2">
										{props.item.rawValue?.title.english ||
											props.item.rawValue?.title.romaji}
										<Show when={props.item.rawValue?.source === "candidate"}>
											<Badge variant="secondary" class="h-4 px-1 text-[9px]">
												New
											</Badge>
										</Show>
									</span>
								</SelectItem>
							)}
						>
							<SelectTrigger class="h-8 text-xs flex-1">
								{/* biome-ignore lint/suspicious/noExplicitAny: complex type */}
								<SelectValue<any>>
									{(state) =>
										state.selectedOption()?.title.english ||
										state.selectedOption()?.title.romaji ||
										`ID: ${props.selectedAnimeId || matchedAnimeId()}`
									}
								</SelectValue>
							</SelectTrigger>
							<SelectContent />
						</Select>
					</Show>
				</div>
			</div>
		</li>
	);
}

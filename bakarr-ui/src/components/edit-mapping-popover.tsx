import { IconPencil } from "@tabler/icons-solidjs";
import { createSignal } from "solid-js";
import { Button } from "~/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import {
	TextField,
	TextFieldInput,
	TextFieldLabel,
} from "~/components/ui/text-field";

interface EditMappingPopoverProps {
	season?: number | null;
	episode: number;
	onSave: (season: number, episode: number) => void;
}

export function EditMappingPopover(props: EditMappingPopoverProps) {
	const [open, setOpen] = createSignal(false);
	const [localSeason, setLocalSeason] = createSignal(
		props.season?.toString() ?? "1",
	);
	const [localEpisode, setLocalEpisode] = createSignal(
		props.episode.toString(),
	);

	const handleOpenChange = (isOpen: boolean) => {
		if (isOpen) {
			setLocalSeason(props.season?.toString() ?? "1");
			setLocalEpisode(props.episode.toString());
		}
		setOpen(isOpen);
	};

	const handleSave = () => {
		const s = Number.parseInt(localSeason(), 10);
		const e = Number.parseInt(localEpisode(), 10);

		if (!Number.isNaN(s) && !Number.isNaN(e)) {
			props.onSave(s, e);
			setOpen(false);
		}
	};

	return (
		<Popover open={open()} onOpenChange={handleOpenChange}>
			<PopoverTrigger
				as={Button}
				variant="secondary"
				size="sm"
				class="h-6 px-2 text-xs font-mono gap-1.5 hover:bg-secondary/80"
			>
				<span>
					S{props.season ?? 1} E{props.episode}
				</span>
				<IconPencil class="h-3 w-3 opacity-50" />
			</PopoverTrigger>
			<PopoverContent class="w-64 p-4">
				<div class="space-y-4">
					<div class="space-y-2">
						<h4 class="font-medium leading-none">Edit Mapping</h4>
						<p class="text-xs text-muted-foreground">
							Override the detected season and episode.
						</p>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-2">
							<TextField value={localSeason()} onChange={setLocalSeason}>
								<TextFieldLabel class="text-xs">Season</TextFieldLabel>
								<TextFieldInput type="number" min={0} class="h-8" />
							</TextField>
						</div>
						<div class="space-y-2">
							<TextField value={localEpisode()} onChange={setLocalEpisode}>
								<TextFieldLabel class="text-xs">Episode</TextFieldLabel>
								<TextFieldInput type="number" min={0} class="h-8" />
							</TextField>
						</div>
					</div>
					<div class="flex justify-end pt-2">
						<Button size="sm" onClick={handleSave} class="h-8 text-xs">
							Save Changes
						</Button>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

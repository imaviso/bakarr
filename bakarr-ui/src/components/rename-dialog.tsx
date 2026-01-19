import {
	IconAlertTriangle,
	IconCheck,
	IconLoader2,
} from "@tabler/icons-solidjs";
import { createEffect, createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import {
	createExecuteRenameMutation,
	createRenamePreviewQuery,
	type RenameResult,
} from "~/lib/api";

interface RenameDialogProps {
	animeId: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function RenameDialog(props: RenameDialogProps) {
	const animeId = () => props.animeId;
	const previewQuery = createRenamePreviewQuery(animeId);
	const executeRename = createExecuteRenameMutation();

	const [result, setResult] = createSignal<RenameResult | null>(null);

	createEffect(() => {
		if (props.open) {
			setResult(null);
			previewQuery.refetch();
		}
	});

	const handleRename = () => {
		executeRename.mutate(props.animeId, {
			onSuccess: (data: RenameResult) => {
				setResult(data);
				if (data.failed === 0) {
					toast.success(`Successfully renamed ${data.renamed} episodes`);
				} else {
					toast.warning(
						`Renamed ${data.renamed}, failed ${data.failed} episodes`,
					);
				}
			},
			onError: (error) => {
				toast.error(`Rename failed: ${error.message}`);
			},
		});
	};

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent class="sm:max-w-7xl max-h-[80vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>Rename Episodes</DialogTitle>
					<DialogDescription>
						Preview changes before applying renames. This will move/rename files
						according to your library settings.
					</DialogDescription>
				</DialogHeader>

				<div class="flex-1 overflow-auto min-h-[300px]">
					<Show
						when={!previewQuery.isLoading}
						fallback={
							<div class="flex items-center justify-center h-full">
								<IconLoader2 class="h-8 w-8 animate-spin" />
							</div>
						}
					>
						<Show
							when={!result()}
							fallback={
								<div class="space-y-4">
									<Show when={result()!.failed > 0}>
										<Alert variant="destructive">
											<IconAlertTriangle class="h-4 w-4" />
											<AlertTitle>Errors Occurred</AlertTitle>
											<AlertDescription>
												<ul class="list-disc pl-4 mt-2">
													<For each={result()!.failures}>
														{(f) => <li>{f}</li>}
													</For>
												</ul>
											</AlertDescription>
										</Alert>
									</Show>
									<Show when={result()!.renamed > 0}>
										<div class="flex flex-col items-center justify-center py-8 text-center">
											<IconCheck class="h-16 w-16 text-green-500 mb-4" />
											<h3 class="text-xl font-semibold">Rename Complete</h3>
											<p class="text-muted-foreground">
												Successfully renamed {result()!.renamed} files.
											</p>
										</div>
									</Show>
								</div>
							}
						>
							<Show
								when={previewQuery.data && previewQuery.data.length > 0}
								fallback={
									<div class="flex items-center justify-center h-full text-muted-foreground">
										No files need renaming.
									</div>
								}
							>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead class="w-[100px]">Episode</TableHead>
											<TableHead>Current Filename</TableHead>
											<TableHead>New Filename</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										<For each={previewQuery.data}>
											{(item) => (
												<TableRow>
													<TableCell>{item.episode_number}</TableCell>
													<TableCell class="font-mono text-sm break-all text-muted-foreground">
														{item.current_path.split("/").pop()}
													</TableCell>
													<TableCell class="font-mono text-sm break-all text-green-600 dark:text-green-400">
														{item.new_filename}
													</TableCell>
												</TableRow>
											)}
										</For>
									</TableBody>
								</Table>
							</Show>
						</Show>
					</Show>
				</div>

				<DialogFooter>
					<Show
						when={!result()}
						fallback={
							<Button onClick={() => props.onOpenChange(false)}>Close</Button>
						}
					>
						<Button variant="outline" onClick={() => props.onOpenChange(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleRename}
							disabled={
								executeRename.isPending ||
								!previewQuery.data ||
								previewQuery.data.length === 0
							}
						>
							<Show when={executeRename.isPending}>
								<IconLoader2 class="mr-2 h-4 w-4 animate-spin" />
							</Show>
							Rename Files
						</Button>
					</Show>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

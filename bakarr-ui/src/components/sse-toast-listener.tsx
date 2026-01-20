import { useQueryClient } from "@tanstack/solid-query";
import { onCleanup, onMount } from "solid-js";
import { toast } from "solid-sonner";

interface EventPayload {
	type: string;
	// biome-ignore lint/suspicious/noExplicitAny: Payload varies by event type
	payload?: any;
}

export function SseToastListener() {
	const queryClient = useQueryClient();
	let eventSource: EventSource | null = null;
	let retryTimeout: ReturnType<typeof setTimeout> | null = null;

	const connect = () => {
		if (eventSource) {
			eventSource.close();
		}

		eventSource = new EventSource("/api/events");

		eventSource.onopen = () => {
			console.log("SSE Connected");
		};

		eventSource.onmessage = (event) => {
			try {
				const data: EventPayload = JSON.parse(event.data);
				handleEvent(data);
			} catch (e) {
				console.error("Failed to parse SSE event", e);
			}
		};

		eventSource.onerror = (err) => {
			console.error("SSE Error", err);
			eventSource?.close();

			if (!retryTimeout) {
				retryTimeout = setTimeout(() => {
					retryTimeout = null;
					connect();
				}, 5000);
			}
		};
	};

	const handleEvent = (event: EventPayload) => {
		const { type, payload } = event;

		switch (type) {
			case "ScanStarted":
				toast.info("Library scan started");
				break;
			case "ScanFinished":
				toast.success("Library scan finished");
				break;
			case "DownloadStarted":
				toast.info(`Download started: ${payload.title}`);
				break;
			case "DownloadFinished":
				toast.success(`Download finished: ${payload.title}`);
				queryClient.invalidateQueries({ queryKey: ["anime"] });
				if (payload.anime_id) {
					queryClient.invalidateQueries({
						queryKey: ["anime", payload.anime_id],
					});
				}
				break;
			case "RefreshStarted":
				toast.info(`Refreshing metadata for ${payload.title}`);
				break;
			case "RefreshFinished":
				toast.success(`Metadata refreshed for ${payload.title}`);
				queryClient.invalidateQueries({ queryKey: ["anime"] });
				if (payload.anime_id) {
					queryClient.invalidateQueries({
						queryKey: ["anime", payload.anime_id],
					});
					queryClient.invalidateQueries({
						queryKey: ["anime", payload.anime_id, "episodes"],
					});
				}
				break;
			case "SearchMissingStarted":
				toast.info(`Searching missing episodes for ${payload.title}`);
				break;
			case "SearchMissingFinished":
				toast.success(
					`Search complete for ${payload.title}. Found ${payload.count} releases.`,
				);
				break;
			case "ScanFolderStarted":
				toast.info(`Scanning folder for ${payload.title}`);
				break;
			case "ScanFolderFinished":
				toast.success(
					`Folder scan complete for ${payload.title}. Found ${payload.found} files.`,
				);
				if (payload.anime_id) {
					queryClient.invalidateQueries({
						queryKey: ["anime", payload.anime_id, "episodes"],
					});
					queryClient.invalidateQueries({
						queryKey: ["anime", payload.anime_id],
					});
				}
				queryClient.invalidateQueries({ queryKey: ["anime"] });
				break;
			case "RenameStarted":
				toast.info(`Renaming files for ${payload.title}`);
				break;
			case "RenameFinished":
				toast.success(
					`Renaming complete for ${payload.title}. Renamed ${payload.count} files.`,
				);
				if (payload.anime_id) {
					queryClient.invalidateQueries({
						queryKey: ["anime", payload.anime_id, "episodes"],
					});
				}
				break;
			case "ImportStarted":
				toast.info(`Importing ${payload.count} files...`);
				break;
			case "ImportFinished":
				toast.success(
					`Import finished. Imported ${payload.imported}, Failed ${payload.failed}`,
				);
				queryClient.invalidateQueries({ queryKey: ["anime"] });
				break;
			case "LibraryScanStarted":
				toast.info("Library file scan started");
				break;
			case "LibraryScanFinished":
				toast.success(
					`Library file scan finished. Scanned ${payload.scanned}, Matched ${payload.matched}`,
				);
				break;
			case "RssCheckStarted":
				toast.info("RSS check started");
				break;
			case "RssCheckFinished":
				toast.success(
					`RSS check finished. Found ${payload.new_items} new items.`,
				);
				break;
			case "Error":
				toast.error(payload.message);
				break;
			case "Info":
				toast.info(payload.message);
				break;

			case "ScanProgress":
			case "LibraryScanProgress":
			case "RssCheckProgress":
			case "DownloadProgress":
				break;
			default:
				console.log("Unhandled SSE event:", type, payload);
		}
	};

	onMount(() => {
		connect();
	});

	onCleanup(() => {
		if (eventSource) {
			eventSource.close();
		}
		if (retryTimeout) {
			clearTimeout(retryTimeout);
		}
	});

	return null;
}

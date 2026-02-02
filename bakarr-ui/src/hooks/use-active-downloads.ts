import { createSignal, onCleanup, onMount } from "solid-js";
import type { DownloadStatus } from "~/lib/api";

interface NotificationEvent {
	type: string;
	// biome-ignore lint/suspicious/noExplicitAny: dynamic payload
	payload: any;
}

export function useActiveDownloads() {
	const [downloads, setDownloads] = createSignal<DownloadStatus[]>([]);

	onMount(() => {
		const eventSource = new EventSource("/api/events");

		eventSource.onopen = () => {
			// console.log("Connected to download stream");
		};

		eventSource.onmessage = (event) => {
			try {
				const data: NotificationEvent = JSON.parse(event.data);

				if (data.type === "DownloadProgress") {
					// The backend sends the full list of active downloads
					setDownloads(data.payload.downloads);
				}
			} catch (e) {
				console.error("Failed to parse event", e);
			}
		};

		eventSource.onerror = (_e) => {
			// console.error("EventSource error", e);
			eventSource.close();
		};

		onCleanup(() => {
			eventSource.close();
		});
	});

	return downloads;
}

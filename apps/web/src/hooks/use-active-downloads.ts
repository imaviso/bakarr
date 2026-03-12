import { createEffect, createSignal, onCleanup } from "solid-js";
import type { DownloadStatus } from "~/lib/api";
import { useAuth } from "~/lib/auth";

interface NotificationEvent {
	type: string;
	// biome-ignore lint/suspicious/noExplicitAny: dynamic payload
	payload: any;
}

export function useActiveDownloads() {
	const [downloads, setDownloads] = createSignal<DownloadStatus[]>([]);
	const { auth } = useAuth();
	let eventSource: EventSource | null = null;

	const disconnect = () => {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	};

	createEffect(() => {
		if (!auth().isAuthenticated) {
			disconnect();
			setDownloads([]);
			return;
		}

		disconnect();
		eventSource = new EventSource("/api/events");

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
			disconnect();
		};
	});

	onCleanup(() => {
		disconnect();
	});

	return downloads;
}

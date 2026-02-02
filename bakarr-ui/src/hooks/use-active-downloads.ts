import { createSignal, onCleanup, onMount } from "solid-js";
import type { DownloadStatus } from "~/lib/api";

interface NotificationEvent {
	type: string;
	// biome-ignore lint/suspicious/noExplicitAny: dynamic payload
	payload: any;
}

const AUTH_STORAGE_KEY = "bakarr_auth";

function getApiKeyFromStorage(): string | null {
	try {
		const stored = localStorage.getItem(AUTH_STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			return parsed.apiKey || null;
		}
	} catch {
		// Ignore parse errors
	}
	return null;
}

export function useActiveDownloads() {
	const [downloads, setDownloads] = createSignal<DownloadStatus[]>([]);

	onMount(() => {
		const apiKey = getApiKeyFromStorage();
		const url = apiKey
			? `/api/events?api_key=${encodeURIComponent(apiKey)}`
			: "/api/events";
		const eventSource = new EventSource(url);

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

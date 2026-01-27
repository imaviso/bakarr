import { createSignal } from "solid-js";

interface AuthState {
	username?: string;
	apiKey?: string;
	isAuthenticated: boolean;
}

const AUTH_STORAGE_KEY = "bakarr_auth";

function getStoredAuth(): AuthState {
	try {
		const stored = localStorage.getItem(AUTH_STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			return {
				username: parsed.username,
				apiKey: parsed.apiKey,
				isAuthenticated: Boolean(parsed.isAuthenticated),
			};
		}
	} catch {
		localStorage.removeItem(AUTH_STORAGE_KEY);
	}
	return { isAuthenticated: false };
}

const [auth, setAuth] = createSignal<AuthState>(getStoredAuth());

function saveAuth(state: AuthState) {
	if (state.isAuthenticated) {
		localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
	} else {
		localStorage.removeItem(AUTH_STORAGE_KEY);
	}
	setAuth(state);
}

export function useAuth() {
	const loginSuccess = (username: string, apiKey?: string) => {
		saveAuth({
			username,
			apiKey,
			isAuthenticated: true,
		});
	};

	const loginApiKey = (apiKey: string) => {
		saveAuth({
			apiKey,
			isAuthenticated: true,
		});
	};

	const logout = async () => {
		try {
			await fetch("/api/auth/logout", { method: "POST" });
		} catch (e) {
			console.error("Logout failed", e);
		}
		saveAuth({ isAuthenticated: false });

		window.location.href = "/login";
	};

	const getAuthHeaders = (): HeadersInit => {
		const state = auth();
		if (state.apiKey) {
			return { "X-Api-Key": state.apiKey };
		}
		return {};
	};

	return {
		auth,
		loginSuccess,
		loginApiKey,
		logout,
		getAuthHeaders,
	};
}

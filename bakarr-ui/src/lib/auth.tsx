import {
	type Accessor,
	createContext,
	createSignal,
	type JSX,
	useContext,
} from "solid-js";

export interface AuthState {
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

// Create the auth context
interface AuthContextValue {
	auth: Accessor<AuthState>;
	loginSuccess: (username: string, apiKey?: string) => void;
	loginApiKey: (apiKey: string) => void;
	logout: () => Promise<void>;
	getAuthHeaders: () => HeadersInit;
}

const AuthContext = createContext<AuthContextValue>();

export function AuthProvider(props: { children: JSX.Element }) {
	const [auth, setAuth] = createSignal<AuthState>(getStoredAuth());

	function saveAuth(state: AuthState) {
		if (state.isAuthenticated) {
			localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
		} else {
			localStorage.removeItem(AUTH_STORAGE_KEY);
		}
		setAuth(state);
	}

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

	const value: AuthContextValue = {
		auth,
		loginSuccess,
		loginApiKey,
		logout,
		getAuthHeaders,
	};

	return (
		<AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
	);
}

// Hook to use auth context
export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}

// Getter function that works outside of Solid components (e.g., in router loaders)
// This maintains the singleton pattern for non-component usage
const [globalAuth] = createSignal<AuthState>(getStoredAuth());
export function getAuthState(): AuthState {
	return globalAuth();
}

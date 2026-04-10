import { getAuthHeaders, logout } from "~/lib/auth";

export const API_BASE = "/api";

type ApiRequestOptions = RequestInit & {
  skipAutoLogoutOnUnauthorized?: boolean;
};

export async function fetchApiResponse(
  endpoint: string,
  options?: ApiRequestOptions,
  signal?: AbortSignal,
): Promise<Response> {
  const headers = new Headers(options?.headers);
  const authHeaders = new Headers(getAuthHeaders());
  for (const [key, value] of authHeaders.entries()) {
    headers.set(key, value);
  }

  if (!headers.has("Content-Type") && options?.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const requestInit: RequestInit = {
    ...options,
    headers,
    ...(signal === undefined ? {} : { signal }),
  };

  const res = await fetch(endpoint, requestInit);

  if (res.status === 401 && !options?.skipAutoLogoutOnUnauthorized) {
    void logout();
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `API error: ${res.status}`);
  }

  return res;
}

export async function fetchApi<T>(
  endpoint: string,
  options?: ApiRequestOptions,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetchApiResponse(endpoint, options, signal);

  // oxlint-disable-next-line typescript-eslint/no-unsafe-assignment
  const json: unknown = await res.json();
  if (json && typeof json === "object" && "data" in json && "success" in json) {
    if (!json.success) {
      const err = "error" in json ? json.error : undefined;
      throw new Error(typeof err === "string" && err.length > 0 ? err : "Unknown API error");
    }
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    return json.data as T;
  }

  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
  return json as T;
}

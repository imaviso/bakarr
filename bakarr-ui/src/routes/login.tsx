import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createSignal } from "solid-js";
import * as v from "valibot";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useAuth } from "~/lib/auth";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

const LoginSchema = v.object({
	username: v.pipe(v.string(), v.minLength(1, "Username is required")),
	password: v.pipe(v.string(), v.minLength(1, "Password is required")),
});

function LoginPage() {
	const [username, setUsername] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [error, setError] = createSignal<string | null>(null);
	const [isSubmitting, setIsSubmitting] = createSignal(false);
	const [validationErrors, setValidationErrors] = createSignal<{
		username?: string;
		password?: string;
	}>({});

	const { loginSuccess } = useAuth();
	const navigate = useNavigate();

	const handleSubmit = async (e: Event) => {
		e.preventDefault();
		setError(null);
		setValidationErrors({});

		const result = v.safeParse(LoginSchema, {
			username: username(),
			password: password(),
		});

		if (!result.success) {
			const errors: { username?: string; password?: string } = {};
			for (const issue of result.issues) {
				if (issue.path?.[0].key === "username") errors.username = issue.message;
				if (issue.path?.[0].key === "password") errors.password = issue.message;
			}
			setValidationErrors(errors);
			return;
		}

		setIsSubmitting(true);
		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					username: username(),
					password: password(),
				}),
			});

			if (res.ok) {
				const data = await res.json();
				// Extract API key from response (format: { data: { api_key: "..." } })
				const apiKey = data?.data?.api_key || data?.api_key;
				loginSuccess(username(), apiKey);
				navigate({ to: "/" });
			} else if (res.status === 401) {
				setError("Invalid username or password");
			} else {
				setError(`Server error: ${res.status}`);
			}
		} catch {
			setError("Failed to connect to server");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div class="flex items-center justify-center min-h-[100dvh] bg-background p-4">
			<Card class="w-full max-w-[350px]">
				<CardHeader class="text-center">
					<CardTitle class="text-xl">Bakarr</CardTitle>
					<CardDescription>Enter your credentials to continue</CardDescription>
				</CardHeader>
				<form onSubmit={handleSubmit}>
					<CardContent class="space-y-4">
						<div class="space-y-2">
							<Label for="username">Username</Label>
							<Input
								id="username"
								type="text"
								value={username()}
								onInput={(e) => setUsername(e.currentTarget.value)}
								placeholder="admin"
								autocomplete="username"
							/>
							{validationErrors().username && (
								<p class="text-xs text-destructive">
									{validationErrors().username}
								</p>
							)}
						</div>
						<div class="space-y-2">
							<Label for="password">Password</Label>
							<Input
								id="password"
								type="password"
								value={password()}
								onInput={(e) => setPassword(e.currentTarget.value)}
								autocomplete="current-password"
							/>
							{validationErrors().password && (
								<p class="text-xs text-destructive">
									{validationErrors().password}
								</p>
							)}
						</div>
						{error() && (
							<p class="text-sm text-destructive text-center" role="alert">
								{error()}
							</p>
						)}
					</CardContent>
					<CardFooter class="pt-4">
						<Button type="submit" class="w-full" disabled={isSubmitting()}>
							{isSubmitting() ? "Signing in..." : "Sign in"}
						</Button>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}

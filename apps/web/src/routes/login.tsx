import { createForm } from "@tanstack/solid-form";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";
import { toast } from "solid-sonner";
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
import { createApiKeyLoginMutation, createLoginMutation } from "~/lib/api";
import { useAuth } from "~/lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const LoginSchema = v.object({
  username: v.pipe(v.string(), v.minLength(1, "Username is required")),
  password: v.pipe(v.string(), v.minLength(1, "Password is required")),
});

type LoginFormData = v.InferOutput<typeof LoginSchema>;

function formatFieldErrors(errors: readonly unknown[]) {
  return errors
    .map((error) => {
      if (typeof error === "string") return error;
      if (typeof error === "object" && error && "message" in error) {
        return String(error.message);
      }
      return String(error);
    })
    .join(", ");
}

function LoginPage() {
  const { loginSuccess } = useAuth();
  const navigate = useNavigate();
  const loginMutation = createLoginMutation();
  const apiKeyLoginMutation = createApiKeyLoginMutation();
  const [apiKey, setApiKey] = createSignal("");

  const form = createForm(() => ({
    defaultValues: {
      username: "",
      password: "",
    } as LoginFormData,
    onSubmit: async ({ value }) => {
      try {
        const data = await loginMutation.mutateAsync(value);
        loginSuccess(value.username);
        if (data.must_change_password) {
          toast.info("Please change your password before continuing.");
          void navigate({ to: "/settings" });
          return;
        }
        void navigate({ to: "/" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Login failed";
        toast.error(message);
      }
    },
  }));

  return (
    <div class="flex items-center justify-center min-h-[100dvh] bg-background p-4">
      <Card class="w-full max-w-[400px] p-2 bg-card">
        <CardHeader class="text-center pb-6 mb-4">
          <CardTitle class="text-2xl font-semibold tracking-tight text-foreground">
            Bakarr
          </CardTitle>
          <CardDescription class="text-sm text-muted-foreground mt-1">
            Sign in to your account
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <CardContent class="space-y-4">
            <form.Field
              name="username"
              validators={{
                onChange: LoginSchema.entries.username,
              }}
            >
              {(field) => (
                <div class="space-y-2">
                  <Label for="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    value={field().state.value}
                    onInput={(e) => field().handleChange(e.currentTarget.value)}
                    onBlur={field().handleBlur}
                    placeholder="admin"
                    autocomplete="username"
                  />
                  <Show when={field().state.meta.errors.length > 0}>
                    <p class="text-xs text-destructive">
                      {formatFieldErrors(field().state.meta.errors)}
                    </p>
                  </Show>
                </div>
              )}
            </form.Field>
            <form.Field
              name="password"
              validators={{
                onChange: LoginSchema.entries.password,
              }}
            >
              {(field) => (
                <div class="space-y-2">
                  <Label for="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={field().state.value}
                    onInput={(e) => field().handleChange(e.currentTarget.value)}
                    onBlur={field().handleBlur}
                    autocomplete="current-password"
                  />
                  <Show when={field().state.meta.errors.length > 0}>
                    <p class="text-xs text-destructive">
                      {formatFieldErrors(field().state.meta.errors)}
                    </p>
                  </Show>
                </div>
              )}
            </form.Field>
          </CardContent>
          <CardFooter class="pt-4">
            <form.Subscribe
              selector={(state) => ({
                isSubmitting: state.isSubmitting,
                canSubmit: state.canSubmit,
              })}
            >
              {(state) => (
                <Button
                  type="submit"
                  class="w-full"
                  disabled={!state().canSubmit || loginMutation.isPending}
                >
                  {state().isSubmitting || loginMutation.isPending ? "Signing in..." : "Sign in"}
                </Button>
              )}
            </form.Subscribe>
          </CardFooter>
        </form>
        <div class="px-6 pb-6 pt-1 space-y-2">
          <Label for="api-key">Or sign in with API key</Label>
          <Input
            id="api-key"
            type="password"
            value={apiKey()}
            onInput={(e) => setApiKey(e.currentTarget.value)}
            placeholder="Paste API key"
            autocomplete="off"
          />
          <Button
            type="button"
            variant="secondary"
            class="w-full"
            disabled={!apiKey().trim() || apiKeyLoginMutation.isPending}
            onClick={async () => {
              try {
                const enteredApiKey = apiKey().trim();
                const data = await apiKeyLoginMutation.mutateAsync({
                  api_key: enteredApiKey,
                });
                loginSuccess(data.username, enteredApiKey);
                if (data.must_change_password) {
                  toast.info("Please change your password before continuing.");
                  void navigate({ to: "/settings" });
                  return;
                }
                void navigate({ to: "/" });
              } catch (err) {
                const message = err instanceof Error ? err.message : "API key login failed";
                toast.error(message);
              }
            }}
          >
            {apiKeyLoginMutation.isPending ? "Signing in..." : "Sign in with API key"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

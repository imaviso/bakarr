import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { toast } from "sonner";
import { Schema } from "effect";
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

const LoginSearchSchema = Schema.Struct({
  redirect: Schema.optionalWith(Schema.String, { default: () => "" }),
});

function sanitizeRedirect(input: string): string | undefined {
  if (!input) return undefined;
  // Only allow internal paths (same-origin relative or absolute paths)
  try {
    const url = new URL(input, window.location.origin);
    if (url.origin !== window.location.origin) return undefined;
    return url.pathname + url.search + url.hash;
  } catch {
    return undefined;
  }
}

export const Route = createFileRoute("/login")({
  validateSearch: (search) => Schema.decodeUnknownSync(LoginSearchSchema)(search),
  component: LoginPage,
});

const LoginSchema = Schema.Struct({
  username: Schema.String.pipe(Schema.minLength(1, { message: () => "Username is required" })),
  password: Schema.String.pipe(Schema.minLength(1, { message: () => "Password is required" })),
});

const ApiKeySchema = Schema.Struct({
  apiKey: Schema.String.pipe(Schema.minLength(1, { message: () => "API key is required" })),
});

type LoginFormData = Schema.Schema.Type<typeof LoginSchema>;
type ApiKeyFormData = Schema.Schema.Type<typeof ApiKeySchema>;

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
  const { syncAuthenticatedUser } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const loginMutation = createLoginMutation();
  const apiKeyLoginMutation = createApiKeyLoginMutation();

  const goToPostLogin = () => {
    const redirect = sanitizeRedirect(search.redirect);
    if (redirect) {
      void navigate({ to: redirect });
      return;
    }
    void navigate({ to: "/" });
  };

  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
    } as LoginFormData,
    onSubmit: async ({ value }) => {
      try {
        const data = await loginMutation.mutateAsync(value);
        syncAuthenticatedUser(data.username);
        if (data.must_change_password) {
          toast.info("Please change your password before continuing.");
          void navigate({ to: "/settings", search: { tab: "general" } });
          return;
        }
        goToPostLogin();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Login failed";
        toast.error(message);
      }
    },
  });

  const apiKeyForm = useForm({
    defaultValues: {
      apiKey: "",
    } as ApiKeyFormData,
    onSubmit: async ({ value }) => {
      try {
        const data = await apiKeyLoginMutation.mutateAsync({
          api_key: value.apiKey.trim(),
        });
        syncAuthenticatedUser(data.username);
        if (data.must_change_password) {
          toast.info("Please change your password before continuing.");
          void navigate({ to: "/settings", search: { tab: "general" } });
          return;
        }
        goToPostLogin();
      } catch (err) {
        const message = err instanceof Error ? err.message : "API key login failed";
        toast.error(message);
      }
    },
  });

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-background p-4">
      <Card className="w-full max-w-[400px] p-2 bg-card">
        <CardHeader className="text-center pb-6 mb-4">
          <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
            Bakarr
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            Sign in to your account
          </CardDescription>
        </CardHeader>
        <form action={() => form.handleSubmit()}>
          <CardContent className="space-y-4">
            <form.Field
              name="username"
              validators={{
                onChange: Schema.standardSchemaV1(LoginSchema.fields.username),
              }}
            >
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    value={field.state.value}
                    onInput={(e) => field.handleChange(e.currentTarget.value)}
                    onBlur={field.handleBlur}
                    placeholder="admin"
                    autoComplete="username"
                  />
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-xs text-destructive">
                      {formatFieldErrors(field.state.meta.errors)}
                    </p>
                  )}
                </div>
              )}
            </form.Field>
            <form.Field
              name="password"
              validators={{
                onChange: Schema.standardSchemaV1(LoginSchema.fields.password),
              }}
            >
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={field.state.value}
                    onInput={(e) => field.handleChange(e.currentTarget.value)}
                    onBlur={field.handleBlur}
                    autoComplete="current-password"
                  />
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-xs text-destructive">
                      {formatFieldErrors(field.state.meta.errors)}
                    </p>
                  )}
                </div>
              )}
            </form.Field>
          </CardContent>
          <CardFooter className="pt-4">
            <form.Subscribe
              selector={(state) => ({
                isSubmitting: state.isSubmitting,
                canSubmit: state.canSubmit,
              })}
            >
              {(state) => (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!state.canSubmit || loginMutation.isPending}
                >
                  {state.isSubmitting || loginMutation.isPending ? "Signing in..." : "Sign in"}
                </Button>
              )}
            </form.Subscribe>
          </CardFooter>
        </form>
        <form action={() => apiKeyForm.handleSubmit()}>
          <div className="px-6 pb-6 pt-1 space-y-2">
            <apiKeyForm.Field
              name="apiKey"
              validators={{
                onChange: Schema.standardSchemaV1(ApiKeySchema.fields.apiKey),
              }}
            >
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="api-key">Or sign in with API key</Label>
                  <Input
                    id="api-key"
                    type="password"
                    value={field.state.value}
                    onInput={(e) => field.handleChange(e.currentTarget.value)}
                    onBlur={field.handleBlur}
                    placeholder="Paste API key"
                    autoComplete="off"
                  />
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-xs text-destructive">
                      {formatFieldErrors(field.state.meta.errors)}
                    </p>
                  )}
                </div>
              )}
            </apiKeyForm.Field>
            <apiKeyForm.Subscribe
              selector={(state) => ({
                isSubmitting: state.isSubmitting,
                canSubmit: state.canSubmit,
              })}
            >
              {(state) => (
                <Button
                  type="submit"
                  variant="secondary"
                  className="w-full"
                  disabled={!state.canSubmit || apiKeyLoginMutation.isPending}
                >
                  {state.isSubmitting || apiKeyLoginMutation.isPending
                    ? "Signing in..."
                    : "Sign in with API key"}
                </Button>
              )}
            </apiKeyForm.Subscribe>
          </div>
        </form>
      </Card>
    </div>
  );
}

import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useId } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { Schema } from "effect";
import { Button } from "@/components/ui/button";
import { errorMessage, formatFieldErrors } from "@/api/effect/errors";
import { FieldError } from "@/components/shared/field-error";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useApiKeyLoginMutation, useLoginMutation } from "@/api/auth";
import { useAuth } from "@/app/auth";

const LoginSearchSchema = Schema.Struct({
  redirect: Schema.optionalWith(Schema.String, { default: () => "" }),
});

function sanitizeRedirect(input: string): string | undefined {
  if (!input) return undefined;

  if (!URL.canParse(input, window.location.origin)) {
    return undefined;
  }

  const url = new URL(input, window.location.origin);
  if (url.origin !== window.location.origin) return undefined;
  return url.pathname + url.search + url.hash;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search) => Schema.decodeUnknownSync(LoginSearchSchema)(search),
  component: LoginPage,
});

const LoginSchema = Schema.Struct({
  username: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Username is required" }),
    Schema.maxLength(128, { message: () => "Username must be 128 characters or less" }),
  ),
  password: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Password is required" }),
    Schema.maxLength(256, { message: () => "Password must be 256 characters or less" }),
  ),
});

const ApiKeySchema = Schema.Struct({
  apiKey: Schema.String.pipe(
    Schema.minLength(1, { message: () => "API key is required" }),
    Schema.maxLength(128, { message: () => "API key must be 128 characters or less" }),
    Schema.pattern(/^[a-fA-F0-9]+$/, { message: () => "API key must be hexadecimal" }),
  ),
});

function LoginPage() {
  const { syncAuthenticatedUser } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const loginMutation = useLoginMutation();
  const apiKeyLoginMutation = useApiKeyLoginMutation();

  const usernameErrorId = useId();
  const passwordErrorId = useId();
  const apiKeyErrorId = useId();

  const goToPostLogin = () => {
    const redirect = sanitizeRedirect(search.redirect);
    if (redirect) {
      void navigate({ to: redirect });
      return;
    }
    void navigate({ to: "/" });
  };

  const handleLoginSuccess = (data: { username: string; must_change_password: boolean }) => {
    syncAuthenticatedUser(data.username, data.must_change_password);
    if (data.must_change_password) {
      toast.info("Please change your password before continuing.");
      void navigate({ to: "/settings", search: { tab: "account" } });
      return;
    }
    goToPostLogin();
  };

  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
    validators: {
      onChange: Schema.standardSchemaV1(LoginSchema),
    },
    onSubmit: ({ value }) => {
      loginMutation.mutate(value, {
        onError: (err) => {
          toast.error(errorMessage(err, "Login failed"));
        },
        onSuccess: handleLoginSuccess,
      });
    },
  });

  const apiKeyForm = useForm({
    defaultValues: {
      apiKey: "",
    },
    validators: {
      onChange: Schema.standardSchemaV1(ApiKeySchema),
    },
    onSubmit: ({ value }) => {
      apiKeyLoginMutation.mutate(
        {
          api_key: value.apiKey.trim(),
        },
        {
          onError: (err) => {
            toast.error(errorMessage(err, "Login failed"));
          },
          onSuccess: handleLoginSuccess,
        },
      );
    },
  });

  const submitLoginForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void form.handleSubmit();
  };

  const submitApiKeyForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void apiKeyForm.handleSubmit();
  };

  return (
    <main className="h-dvh overflow-y-auto bg-background p-4">
      <div className="flex min-h-full items-center justify-center">
        <Card className="w-full max-w-[400px] p-2 bg-card">
          <CardHeader className="text-center pb-4 mb-2">
            <div
              aria-hidden="true"
              className="mx-auto mb-3 flex h-8 w-8 items-center justify-center bg-primary font-mono text-sm font-bold text-primary-foreground"
            >
              ▎
            </div>
            <h1 className="text-2xl font-medium tracking-tight text-foreground">Bakarr</h1>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              Sign in to your account
            </CardDescription>
          </CardHeader>
          <form onSubmit={submitLoginForm}>
            <CardContent className="space-y-4">
              <form.Field name="username">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      type="text"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.currentTarget.value)}
                      onBlur={field.handleBlur}
                      placeholder="admin"
                      autoComplete="username"
                      aria-describedby={
                        field.state.meta.errors.length > 0 ? usernameErrorId : undefined
                      }
                    />
                    {field.state.meta.errors.length > 0 && (
                      <FieldError
                        id={usernameErrorId}
                        error={formatFieldErrors(field.state.meta.errors)}
                      />
                    )}
                  </div>
                )}
              </form.Field>
              <form.Field name="password">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.currentTarget.value)}
                      onBlur={field.handleBlur}
                      autoComplete="current-password"
                      aria-describedby={
                        field.state.meta.errors.length > 0 ? passwordErrorId : undefined
                      }
                    />
                    {field.state.meta.errors.length > 0 && (
                      <FieldError
                        id={passwordErrorId}
                        error={formatFieldErrors(field.state.meta.errors)}
                      />
                    )}
                  </div>
                )}
              </form.Field>
            </CardContent>
            <div className="px-(--card-spacing) pt-4">
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
                    isDisabled={
                      !state.canSubmit || loginMutation.isPending || apiKeyLoginMutation.isPending
                    }
                  >
                    {state.isSubmitting || loginMutation.isPending ? "Signing in..." : "Sign in"}
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </form>
          <div className="relative mx-6" role="separator" aria-orientation="horizontal">
            <Separator className="bg-border" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              or
            </span>
          </div>
          <form onSubmit={submitApiKeyForm}>
            <div className="px-6 pb-6 pt-2 space-y-2">
              <apiKeyForm.Field name="apiKey">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor="api-key">API key</Label>
                    <Input
                      id="api-key"
                      type="password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.currentTarget.value)}
                      onBlur={field.handleBlur}
                      placeholder="Paste API key"
                      autoComplete="off"
                      aria-describedby={
                        field.state.meta.errors.length > 0 ? apiKeyErrorId : undefined
                      }
                    />
                    {field.state.meta.errors.length > 0 && (
                      <FieldError
                        id={apiKeyErrorId}
                        error={formatFieldErrors(field.state.meta.errors)}
                      />
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
                    isDisabled={
                      !state.canSubmit || loginMutation.isPending || apiKeyLoginMutation.isPending
                    }
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
    </main>
  );
}

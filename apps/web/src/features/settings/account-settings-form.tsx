import {
  CopyIcon,
  EyeIcon,
  EyeSlashIcon,
  KeyIcon,
  LockIcon,
  ArrowClockwiseIcon,
} from "@phosphor-icons/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import { Schema } from "effect";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { NotificationSettingsCard } from "~/features/settings/notification-settings-card";
import { createChangePasswordMutation, createRegenerateApiKeyMutation } from "~/api";
import { useAuth } from "~/app/auth";
import { copyToClipboard } from "~/infra/utils";

const ChangePasswordSchema = Schema.Struct({
  currentPassword: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Current password is required" }),
  ),
  newPassword: Schema.String.pipe(
    Schema.minLength(8, { message: () => "Password must be at least 8 characters" }),
  ),
  confirmPassword: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Please confirm your password" }),
  ),
});

type ChangePasswordFormData = Schema.Schema.Type<typeof ChangePasswordSchema>;

export function AccountSettingsForm() {
  const { auth } = useAuth();
  const changePassword = createChangePasswordMutation();
  const regenerateApiKey = createRegenerateApiKeyMutation();

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const currentApiKey = auth.apiKey?.trim() || "";

  const passwordForm = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    } as ChangePasswordFormData,
    validators: {
      onChange: Schema.standardSchemaV1(ChangePasswordSchema),
    },
    onSubmit: async ({ value, formApi }) => {
      if (value.newPassword !== value.confirmPassword) {
        formApi.setFieldMeta("confirmPassword", (prev) => ({
          ...prev,
          errors: [{ message: "Passwords do not match" }],
        }));
        return;
      }

      try {
        await changePassword.mutateAsync({
          current_password: value.currentPassword,
          new_password: value.newPassword,
        });
        formApi.reset();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to change password";
        formApi.setFieldMeta("currentPassword", (prev) => ({
          ...prev,
          errors: [{ message }],
        }));
      }
    },
  });

  const submitPasswordForm = async () => {
    await passwordForm.handleSubmit();
  };

  const handleRegenerateApiKey = async () => {
    try {
      await regenerateApiKey.mutateAsync();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to regenerate API key");
    }
  };

  const copyApiKey = async () => {
    const key = currentApiKey;
    if (!key) {
      toast.error("API keys are never stored client-side. Use the backend response directly.");
      return;
    }

    await copyToClipboard(key);
    toast.success("API key copied to clipboard");
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LockIcon className="h-4 w-4" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={submitPasswordForm} className="space-y-4 max-w-md">
            <passwordForm.Field name="currentPassword">
              {(field) => (
                <div className="space-y-1">
                  <Label htmlFor="current-password">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.currentTarget.value)}
                      type={showCurrentPassword ? "text" : "password"}
                      autoComplete="current-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                    >
                      {showCurrentPassword ? (
                        <EyeIcon className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <EyeSlashIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {field.state.meta.errors[0]?.message && (
                    <div className="text-[0.8rem] text-destructive">
                      {field.state.meta.errors[0]?.message}
                    </div>
                  )}
                </div>
              )}
            </passwordForm.Field>

            <passwordForm.Field name="newPassword">
              {(field) => (
                <div className="space-y-1">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.currentTarget.value)}
                      type={showNewPassword ? "text" : "password"}
                      autoComplete="new-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? (
                        <EyeIcon className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <EyeSlashIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {field.state.meta.errors[0]?.message && (
                    <div className="text-[0.8rem] text-destructive">
                      {field.state.meta.errors[0]?.message}
                    </div>
                  )}
                </div>
              )}
            </passwordForm.Field>

            <passwordForm.Field name="confirmPassword">
              {(field) => (
                <div className="space-y-1">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                    type="password"
                    autoComplete="new-password"
                  />
                  {field.state.meta.errors[0]?.message && (
                    <div className="text-[0.8rem] text-destructive">
                      {field.state.meta.errors[0]?.message}
                    </div>
                  )}
                </div>
              )}
            </passwordForm.Field>

            <passwordForm.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {(state) => (
                <Button type="submit" disabled={!state[0] || changePassword.isPending}>
                  {state[1] || changePassword.isPending ? "Changing..." : "Change Password"}
                </Button>
              )}
            </passwordForm.Subscribe>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyIcon className="h-4 w-4" />
            API Key
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            API keys are not persisted in the browser. Regenerate and store it safely when needed.
          </p>

          <div className="flex items-center gap-2 max-w-xl">
            <div className="flex-1 relative">
              <Input
                type={showApiKey ? "text" : "password"}
                value={currentApiKey}
                placeholder="API key is not stored in this client"
                readOnly
                className="pr-20 font-mono text-sm"
              />
              <div className="absolute right-0 top-0 h-full flex items-center gap-1 pr-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="relative after:absolute after:-inset-2 h-7 w-7"
                  onClick={() => setShowApiKey(!showApiKey)}
                  title={showApiKey ? "Hide API key" : "Show API key"}
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                >
                  {showApiKey ? (
                    <EyeIcon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <EyeSlashIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="relative after:absolute after:-inset-2 h-7 w-7"
                  onClick={copyApiKey}
                  disabled={!currentApiKey}
                  title="Copy API key"
                  aria-label="Copy API key"
                >
                  <CopyIcon className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Existing API keys are stored hashed server-side and cannot be retrieved. Regenerate to
            create a new one for external clients.
          </p>

          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="outline" disabled={regenerateApiKey.isPending} />}
            >
              <ArrowClockwiseIcon className="mr-2 h-4 w-4" />
              {regenerateApiKey.isPending ? "Regenerating..." : "Regenerate API Key"}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will invalidate your current API key. Any applications or services using the
                  old key will need to be updated with the new one.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRegenerateApiKey}>Regenerate</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <NotificationSettingsCard />
    </div>
  );
}

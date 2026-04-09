import {
  IconCopy,
  IconEye,
  IconEyeOff,
  IconKey,
  IconLock,
  IconRefresh,
} from "@tabler/icons-solidjs";
import { createForm } from "@tanstack/solid-form";
import { createSignal, Show } from "solid-js";
import { toast } from "solid-sonner";
import * as v from "valibot";
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
import {
  TextField,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { createChangePasswordMutation, createRegenerateApiKeyMutation } from "~/lib/api";
import { useAuth } from "~/lib/auth";

const ChangePasswordSchema = v.object({
  currentPassword: v.pipe(v.string(), v.minLength(1, "Current password is required")),
  newPassword: v.pipe(v.string(), v.minLength(8, "Password must be at least 8 characters")),
  confirmPassword: v.pipe(v.string(), v.minLength(1, "Please confirm your password")),
});

type ChangePasswordFormData = v.InferOutput<typeof ChangePasswordSchema>;

export function AccountSettingsForm() {
  const { auth, loginSuccess } = useAuth();
  const changePassword = createChangePasswordMutation();
  const regenerateApiKey = createRegenerateApiKeyMutation();

  const [showCurrentPassword, setShowCurrentPassword] = createSignal(false);
  const [showNewPassword, setShowNewPassword] = createSignal(false);
  const [showApiKey, setShowApiKey] = createSignal(false);
  const currentApiKey = () => auth().apiKey?.trim() || "";

  const passwordForm = createForm(() => ({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    } as ChangePasswordFormData,
    validators: {
      onChange: ChangePasswordSchema,
      onChangeListenTo: ["confirmPassword"],
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
        toast.success("Password changed successfully");
        formApi.reset();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to change password";
        formApi.setFieldMeta("currentPassword", (prev) => ({
          ...prev,
          errors: [{ message }],
        }));
      }
    },
  }));

  const handleRegenerateApiKey = async () => {
    try {
      const result = await regenerateApiKey.mutateAsync();
      const currentAuth = auth();
      if (currentAuth.isAuthenticated && result.api_key) {
        loginSuccess(currentAuth.username || "", result.api_key);
      }
      toast.success("API key regenerated successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to regenerate API key");
    }
  };

  const copyApiKey = async () => {
    const key = currentApiKey();
    if (!key) {
      toast.error("Regenerate your API key to reveal and copy it.");
      return;
    }

    await navigator.clipboard.writeText(key);
    toast.success("API key copied to clipboard");
  };

  return (
    <div class="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle class="text-base flex items-center gap-2">
            <IconLock class="h-4 w-4" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void passwordForm.handleSubmit();
            }}
            class="space-y-4 max-w-md"
          >
            <passwordForm.Field name="currentPassword">
              {(field) => (
                <TextField value={field().state.value} onChange={field().handleChange}>
                  <TextFieldLabel>Current Password</TextFieldLabel>
                  <div class="relative">
                    <TextFieldInput
                      type={showCurrentPassword() ? "text" : "password"}
                      autocomplete="current-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      class="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword())}
                      aria-label={showCurrentPassword() ? "Hide password" : "Show password"}
                    >
                      <Show
                        when={showCurrentPassword()}
                        fallback={<IconEyeOff class="h-4 w-4 text-muted-foreground" />}
                      >
                        <IconEye class="h-4 w-4 text-muted-foreground" />
                      </Show>
                    </Button>
                  </div>
                  <TextFieldErrorMessage>
                    {field().state.meta.errors[0]?.message}
                  </TextFieldErrorMessage>
                </TextField>
              )}
            </passwordForm.Field>

            <passwordForm.Field name="newPassword">
              {(field) => (
                <TextField value={field().state.value} onChange={field().handleChange}>
                  <TextFieldLabel>New Password</TextFieldLabel>
                  <div class="relative">
                    <TextFieldInput
                      type={showNewPassword() ? "text" : "password"}
                      autocomplete="new-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      class="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword())}
                      aria-label={showNewPassword() ? "Hide password" : "Show password"}
                    >
                      <Show
                        when={showNewPassword()}
                        fallback={<IconEyeOff class="h-4 w-4 text-muted-foreground" />}
                      >
                        <IconEye class="h-4 w-4 text-muted-foreground" />
                      </Show>
                    </Button>
                  </div>
                  <TextFieldErrorMessage>
                    {field().state.meta.errors[0]?.message}
                  </TextFieldErrorMessage>
                </TextField>
              )}
            </passwordForm.Field>

            <passwordForm.Field name="confirmPassword">
              {(field) => (
                <TextField value={field().state.value} onChange={field().handleChange}>
                  <TextFieldLabel>Confirm New Password</TextFieldLabel>
                  <TextFieldInput type="password" autocomplete="new-password" />
                  <TextFieldErrorMessage>
                    {field().state.meta.errors[0]?.message}
                  </TextFieldErrorMessage>
                </TextField>
              )}
            </passwordForm.Field>

            <passwordForm.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {(state) => (
                <Button type="submit" disabled={!state()[0] || changePassword.isPending}>
                  {state()[1] || changePassword.isPending ? "Changing..." : "Change Password"}
                </Button>
              )}
            </passwordForm.Subscribe>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-base flex items-center gap-2">
            <IconKey class="h-4 w-4" />
            API Key
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <p class="text-sm text-muted-foreground">
            Use this API key to authenticate external applications and streaming clients.
          </p>

          <div class="flex items-center gap-2 max-w-xl">
            <div class="flex-1 relative">
              <Input
                type={showApiKey() ? "text" : "password"}
                value={currentApiKey()}
                placeholder="Regenerate API key to reveal a new one"
                readOnly
                class="pr-20 font-mono text-sm"
              />
              <div class="absolute right-0 top-0 h-full flex items-center gap-1 pr-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="relative after:absolute after:-inset-2 h-7 w-7"
                  onClick={() => setShowApiKey(!showApiKey())}
                  title={showApiKey() ? "Hide API key" : "Show API key"}
                  aria-label={showApiKey() ? "Hide API key" : "Show API key"}
                >
                  <Show
                    when={showApiKey()}
                    fallback={<IconEyeOff class="h-4 w-4 text-muted-foreground" />}
                  >
                    <IconEye class="h-4 w-4 text-muted-foreground" />
                  </Show>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="relative after:absolute after:-inset-2 h-7 w-7"
                  onClick={copyApiKey}
                  disabled={!currentApiKey()}
                  title="Copy API key"
                  aria-label="Copy API key"
                >
                  <IconCopy class="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          </div>

          <p class="text-xs text-muted-foreground">
            Existing API keys are stored hashed and cannot be shown again. Regenerate to reveal a
            new key for streaming links and external clients.
          </p>

          <AlertDialog>
            <AlertDialogTrigger
              as={(triggerProps: { onClick: () => void }) => (
                <Button
                  variant="outline"
                  onClick={triggerProps.onClick}
                  disabled={regenerateApiKey.isPending}
                >
                  <IconRefresh class="mr-2 h-4 w-4" />
                  {regenerateApiKey.isPending ? "Regenerating..." : "Regenerate API Key"}
                </Button>
              )}
            />
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
    </div>
  );
}

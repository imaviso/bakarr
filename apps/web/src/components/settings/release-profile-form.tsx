import { IconPlus, IconTrash } from "@tabler/icons-solidjs";
import { createForm } from "@tanstack/solid-form";
import { Index, Show } from "solid-js";
import * as v from "valibot";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import {
  TextField,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import {
  createCreateReleaseProfileMutation,
  createUpdateReleaseProfileMutation,
  type ReleaseProfile,
} from "~/lib/api";

const ReleaseProfileSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1, "Name is required")),
  enabled: v.boolean(),
  is_global: v.boolean(),
  rules: v.array(
    v.object({
      term: v.pipe(v.string(), v.minLength(1, "Term is required")),
      rule_type: v.picklist(["preferred", "must", "must_not"]),
      score: v.number(),
    }),
  ),
});

export function ReleaseProfileForm(props: {
  onCancel: () => void;
  onSuccess: () => void;
  profile?: ReleaseProfile;
}) {
  const createProfile = createCreateReleaseProfileMutation();
  const updateProfile = createUpdateReleaseProfileMutation();
  const isEditing = () => !!props.profile;

  const form = createForm(() => ({
    defaultValues: {
      name: props.profile?.name || "",
      enabled: props.profile?.enabled ?? true,
      is_global: props.profile?.is_global ?? true,
      rules: props.profile?.rules || [],
    },
    validators: {
      onChange: ReleaseProfileSchema,
    },
    onSubmit: async ({ value }) => {
      if (isEditing() && props.profile) {
        await updateProfile.mutateAsync({
          id: props.profile.id,
          data: value,
        });
      } else {
        await createProfile.mutateAsync(value);
      }
      props.onSuccess();
    },
  }));

  return (
    <Card class="border-primary/20">
      <CardHeader class="pb-4">
        <CardTitle class="text-base">{isEditing() ? "Edit Profile" : "Create Profile"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
          class="space-y-4"
        >
          <div class="flex items-start gap-4">
            <form.Field name="name">
              {(field) => (
                <TextField
                  class="flex-1"
                  value={field().state.value}
                  onChange={field().handleChange}
                >
                  <TextFieldLabel>Profile Name</TextFieldLabel>
                  <TextFieldInput placeholder="e.g., Preferred Groups" />
                  <TextFieldErrorMessage>
                    {field().state.meta.errors[0]?.message}
                  </TextFieldErrorMessage>
                </TextField>
              )}
            </form.Field>

            <form.Field name="enabled">
              {(field) => (
                <div class="flex flex-col gap-3 pt-8">
                  <div class="flex items-center gap-2">
                    <Switch
                      id={field().name}
                      checked={field().state.value}
                      onChange={(checked) => field().handleChange(checked)}
                    />
                    <label
                      for={field().name}
                      class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Enabled
                    </label>
                  </div>
                </div>
              )}
            </form.Field>

            <form.Field name="is_global">
              {(field) => (
                <div class="flex flex-col gap-3 pt-8">
                  <div class="flex items-center gap-2">
                    <Switch
                      id={field().name}
                      checked={field().state.value}
                      onChange={(checked) => field().handleChange(checked)}
                    />
                    <label
                      for={field().name}
                      class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Global
                    </label>
                  </div>
                </div>
              )}
            </form.Field>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="space-y-1">
                <h4 class="text-sm font-medium">Rules</h4>
                <p class="text-xs text-muted-foreground">Define terms to prefer or require/block</p>
              </div>
              <form.Field name="rules" mode="array">
                {(field) => (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      field().pushValue({
                        term: "",
                        rule_type: "preferred",
                        score: 10,
                      })
                    }
                  >
                    <IconPlus class="mr-2 h-3.5 w-3.5" />
                    Add Rule
                  </Button>
                )}
              </form.Field>
            </div>

            <form.Field name="rules" mode="array">
              {(field) => (
                <div class="space-y-2">
                  <Index each={field().state.value}>
                    {(_, index) => (
                      <div class="flex gap-2 items-start">
                        <form.Field name={`rules[${index}].term`}>
                          {(termField) => (
                            <div class="flex-1">
                              <TextField
                                value={termField().state.value}
                                onChange={termField().handleChange}
                              >
                                <TextFieldInput placeholder="Term (e.g. SubsPlease)" />
                              </TextField>
                            </div>
                          )}
                        </form.Field>

                        <form.Field name={`rules[${index}].rule_type`}>
                          {(typeField) => (
                            <div class="w-[140px]">
                              <Select
                                value={typeField().state.value}
                                onChange={(value) => value && typeField().handleChange(value)}
                                options={["preferred", "must", "must_not"]}
                                itemComponent={(itemProps) => (
                                  <SelectItem item={itemProps.item}>
                                    {itemProps.item.rawValue === "preferred"
                                      ? "Preferred"
                                      : itemProps.item.rawValue === "must"
                                        ? "Must Contain"
                                        : "Must Not Contain"}
                                  </SelectItem>
                                )}
                              >
                                <SelectTrigger>
                                  <SelectValue<string>>
                                    {(state) =>
                                      state.selectedOption() === "preferred"
                                        ? "Preferred"
                                        : state.selectedOption() === "must"
                                          ? "Must Contain"
                                          : "Must Not Contain"
                                    }
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent />
                              </Select>
                            </div>
                          )}
                        </form.Field>

                        <form.Field name={`rules[${index}].score`}>
                          {(scoreField) => (
                            <div class="w-[100px]">
                              <TextField
                                value={scoreField().state.value.toString()}
                                onChange={(value) => scoreField().handleChange(Number(value))}
                                disabled={
                                  form.getFieldValue(`rules[${index}].rule_type`) !== "preferred"
                                }
                              >
                                <TextFieldInput type="number" placeholder="Score" />
                              </TextField>
                            </div>
                          )}
                        </form.Field>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          class="mt-0.5 text-muted-foreground hover:text-destructive"
                          onClick={() => field().removeValue(index)}
                          aria-label="Remove rule"
                        >
                          <IconTrash class="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </Index>

                  <Show when={field().state.value.length === 0}>
                    <div class="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg bg-muted/20">
                      No rules defined. Add a rule to start scoring releases.
                    </div>
                  </Show>
                </div>
              )}
            </form.Field>
          </div>

          <div class="flex gap-2 justify-end pt-4">
            <Button type="button" variant="ghost" onClick={props.onCancel}>
              Cancel
            </Button>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {(state) => (
                <Button
                  type="submit"
                  disabled={!state()[0] || createProfile.isPending || updateProfile.isPending}
                >
                  {state()[1] ? "Saving..." : isEditing() ? "Update" : "Create"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
import { useRef } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import {
  createCreateReleaseProfileMutation,
  createUpdateReleaseProfileMutation,
  type ReleaseProfile,
} from "~/lib/api";

const ReleaseProfileSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1, { message: () => "Name is required" })),
  enabled: Schema.Boolean,
  is_global: Schema.Boolean,
  rules: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        term: Schema.String.pipe(Schema.minLength(1, { message: () => "Term is required" })),
        rule_type: Schema.Literal("preferred", "must", "must_not"),
        score: Schema.Number,
      }),
    ),
  ),
});

let ruleRowId = 0;

function createRuleRowId() {
  ruleRowId += 1;
  return `release-rule-${ruleRowId}`;
}

export function ReleaseProfileForm(props: {
  onCancel: () => void;
  onSuccess: () => void;
  profile?: ReleaseProfile;
}) {
  const createProfile = createCreateReleaseProfileMutation();
  const updateProfile = createUpdateReleaseProfileMutation();
  const isEditing = !!props.profile;
  const ruleRowIdsRef = useRef((props.profile?.rules ?? []).map(createRuleRowId));

  const form = useForm({
    defaultValues: {
      name: props.profile?.name || "",
      enabled: props.profile?.enabled ?? true,
      is_global: props.profile?.is_global ?? true,
      rules: props.profile?.rules || [],
    },
    validators: {
      onChange: Schema.standardSchemaV1(ReleaseProfileSchema),
    },
    onSubmit: async ({ value }) => {
      if (isEditing && props.profile) {
        await updateProfile.mutateAsync({
          id: props.profile.id,
          data: value,
        });
      } else {
        await createProfile.mutateAsync(value);
      }
      props.onSuccess();
    },
  });

  const submitReleaseProfileForm = async () => {
    await form.handleSubmit();
  };

  const getRuleRowId = (index: number) => {
    const existing = ruleRowIdsRef.current[index];
    if (existing) {
      return existing;
    }

    const next = createRuleRowId();
    ruleRowIdsRef.current[index] = next;
    return next;
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">{isEditing ? "Edit Profile" : "Create Profile"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={submitReleaseProfileForm} className="space-y-4">
          <div className="flex items-start gap-4">
            <form.Field name="name">
              {(field) => (
                <div className="flex-1 space-y-1">
                  <Label htmlFor="release-profile-name">Profile Name</Label>
                  <Input
                    id="release-profile-name"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                    placeholder="e.g., Preferred Groups"
                  />
                  {field.state.meta.errors[0]?.message && (
                    <div className="text-[0.8rem] text-destructive">
                      {field.state.meta.errors[0]?.message}
                    </div>
                  )}
                </div>
              )}
            </form.Field>

            <form.Field name="enabled">
              {(field) => (
                <div className="flex flex-col gap-3 pt-8">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={field.name}
                      checked={field.state.value}
                      onCheckedChange={(checked) => field.handleChange(checked)}
                    />
                    <label
                      htmlFor={field.name}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Enabled
                    </label>
                  </div>
                </div>
              )}
            </form.Field>

            <form.Field name="is_global">
              {(field) => (
                <div className="flex flex-col gap-3 pt-8">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={field.name}
                      checked={field.state.value}
                      onCheckedChange={(checked) => field.handleChange(checked)}
                    />
                    <label
                      htmlFor={field.name}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Global
                    </label>
                  </div>
                </div>
              )}
            </form.Field>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Rules</h4>
                <p className="text-xs text-muted-foreground">
                  Define terms to prefer or require/block
                </p>
              </div>
              <form.Field name="rules" mode="array">
                {(field) => (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      ruleRowIdsRef.current.push(createRuleRowId());
                      field.pushValue({
                        term: "",
                        rule_type: "preferred",
                        score: 10,
                      });
                    }}
                  >
                    <PlusIcon className="mr-2 h-3.5 w-3.5" />
                    Add Rule
                  </Button>
                )}
              </form.Field>
            </div>

            <form.Field name="rules" mode="array">
              {(field) => (
                <div className="space-y-2">
                  {field.state.value.map((_, index) => (
                    <div key={getRuleRowId(index)} className="flex gap-2 items-start">
                      <form.Field name={`rules[${index}].term`}>
                        {(termField) => (
                          <div className="flex-1">
                            <Input
                              value={termField.state.value}
                              onChange={(event) =>
                                termField.handleChange(event.currentTarget.value)
                              }
                              placeholder="Term (e.g. SubsPlease)"
                            />
                          </div>
                        )}
                      </form.Field>

                      <form.Field name={`rules[${index}].rule_type`}>
                        {(typeField) => (
                          <div className="w-[140px]">
                            <Select
                              value={typeField.state.value}
                              onValueChange={(value) => {
                                if (value !== null) {
                                  typeField.handleChange(value);
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Rule type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="preferred">Preferred</SelectItem>
                                <SelectItem value="must">Must Contain</SelectItem>
                                <SelectItem value="must_not">Must Not Contain</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </form.Field>

                      <form.Field name={`rules[${index}].score`}>
                        {(scoreField) => (
                          <div className="w-[100px]">
                            <Input
                              type="number"
                              value={scoreField.state.value.toString()}
                              onChange={(event) =>
                                scoreField.handleChange(Number(event.currentTarget.value))
                              }
                              disabled={
                                form.getFieldValue(`rules[${index}].rule_type`) !== "preferred"
                              }
                              placeholder="Score"
                            />
                          </div>
                        )}
                      </form.Field>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mt-0.5 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          ruleRowIdsRef.current.splice(index, 1);
                          field.removeValue(index);
                        }}
                        aria-label="Remove rule"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  {field.state.value.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-none bg-muted">
                      No rules defined. Add a rule to start scoring releases.
                    </div>
                  )}
                </div>
              )}
            </form.Field>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button type="button" variant="ghost" onClick={props.onCancel}>
              Cancel
            </Button>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  disabled={!canSubmit || createProfile.isPending || updateProfile.isPending}
                >
                  {isSubmitting ? "Saving..." : isEditing ? "Update" : "Create"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

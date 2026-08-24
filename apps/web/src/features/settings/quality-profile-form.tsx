import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
import { SortableQualityList } from "@/features/settings/sortable-quality-list";
import { fieldErrorMessage } from "@/api/effect/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SizeInput } from "@/features/settings/form-controls";
import { FieldError } from "@/components/shared/field-error";
import {
  useCreateProfileMutation,
  useQualitiesQuery,
  useUpdateProfileMutation,
} from "@/api/profiles";
import type { QualityProfile } from "@/api/contracts";

const ProfileSchema = Schema.mutable(
  Schema.Struct({
    name: Schema.String.pipe(Schema.minLength(1, { message: () => "Name is required" })),
    cutoff: Schema.String.pipe(Schema.minLength(1, { message: () => "Cutoff is required" })),
    upgrade_allowed: Schema.Boolean,
    seadex_preferred: Schema.Boolean,
    allowed_qualities: Schema.mutable(Schema.Array(Schema.String)),
    min_size: Schema.UndefinedOr(Schema.String),
    max_size: Schema.UndefinedOr(Schema.String),
  }),
);

const SizeFieldSchema = Schema.UndefinedOr(
  Schema.String.pipe(
    Schema.pattern(/^[0-9]+(\.[0-9]+)?\s*(MB|GB)$/i, {
      message: () => "Must be format like '500 MB' or '2.5 GB'",
    }),
  ),
);

function validateSizeField({ value }: { value: unknown }): string | undefined {
  const result = Schema.decodeUnknownEither(SizeFieldSchema)(value);
  if (result._tag === "Right") return undefined;
  return "Must be format like '500 MB' or '2.5 GB'";
}

export function ProfileForm(props: {
  onCancel: () => void;
  onSuccess: () => void;
  profile?: QualityProfile;
}) {
  const createProfile = useCreateProfileMutation();
  const updateProfile = useUpdateProfileMutation();
  const qualitiesQuery = useQualitiesQuery();
  const isEditing = !!props.profile;

  const form = useForm({
    defaultValues: {
      name: props.profile?.name || "",
      cutoff: props.profile?.cutoff || "BluRay 1080p",
      upgrade_allowed: props.profile?.upgrade_allowed ?? true,
      seadex_preferred: props.profile?.seadex_preferred ?? true,
      allowed_qualities: props.profile?.allowed_qualities || ["BluRay 1080p", "WEB-DL 1080p"],
      min_size: props.profile?.min_size || undefined,
      max_size: props.profile?.max_size || undefined,
    },
    validators: {
      onChange: Schema.standardSchemaV1(ProfileSchema),
    },
    onSubmit: async ({ value }) => {
      if (isEditing && props.profile) {
        await updateProfile.mutateAsync({
          name: props.profile.name,
          profile: value,
        });
      } else {
        await createProfile.mutateAsync(value);
      }
      props.onSuccess();
    },
  });

  const submitQualityProfileForm = async () => {
    await form.handleSubmit();
  };

  const qualityNames = qualitiesQuery.data?.map((quality) => quality.name) ?? [];

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="text-base">{isEditing ? "Edit Profile" : "Create Profile"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={submitQualityProfileForm} className="space-y-4">
          <form.Field name="name">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="profile-name">Profile Name</Label>
                <Input
                  id="profile-name"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  disabled={isEditing}
                  placeholder="e.g., HD Quality"
                />
                <FieldError error={field.state.meta.errors[0]?.message} />
              </div>
            )}
          </form.Field>

          <form.Field name="cutoff">
            {(field) => (
              <div className="flex flex-col gap-1">
                <Label
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  htmlFor={field.name}
                >
                  Cutoff Quality
                </Label>
                <Select
                  {...(qualityNames.includes(field.state.value)
                    ? { selectedKey: field.state.value }
                    : {})}
                  onSelectionChange={(value) => {
                    if (value !== null) {
                      field.handleChange(String(value));
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {qualityNames.map((quality) => (
                      <SelectItem key={quality} id={quality} textValue={quality}>
                        {quality}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError error={field.state.meta.errors[0]?.message} />
              </div>
            )}
          </form.Field>

          <form.Field name="allowed_qualities">
            {(field) => (
              <SortableQualityList
                value={field.state.value}
                onChange={field.handleChange}
                availableQualities={qualityNames}
              />
            )}
          </form.Field>

          <div className="grid grid-cols-2 gap-4">
            <form.Field
              name="min_size"
              validators={{
                onChange: validateSizeField,
              }}
            >
              {(field) => (
                <SizeInput
                  label="Minimum Size"
                  value={field.state.value || ""}
                  onChange={(value) => field.handleChange(value)}
                  {...(field.state.meta.errors[0] === undefined
                    ? {}
                    : { error: fieldErrorMessage(field.state.meta.errors[0] ?? undefined) })}
                />
              )}
            </form.Field>

            <form.Field
              name="max_size"
              validators={{
                onChange: validateSizeField,
              }}
            >
              {(field) => (
                <SizeInput
                  label="Maximum Size"
                  value={field.state.value || ""}
                  onChange={(value) => field.handleChange(value)}
                  {...(field.state.meta.errors[0] === undefined
                    ? {}
                    : { error: fieldErrorMessage(field.state.meta.errors[0] ?? undefined) })}
                />
              )}
            </form.Field>
          </div>

          <div className="flex gap-6 pt-2">
            <form.Field name="upgrade_allowed">
              {(field) => (
                <div className="flex items-center gap-2">
                  <Switch
                    id={field.name}
                    isSelected={field.state.value}
                    onChange={(checked) => field.handleChange(checked)}
                  />
                  <Label
                    htmlFor={field.name}
                    className="flex cursor-pointer items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Allow Upgrades
                  </Label>
                </div>
              )}
            </form.Field>

            <form.Field name="seadex_preferred">
              {(field) => (
                <div className="flex items-center gap-2">
                  <Switch
                    id={field.name}
                    isSelected={field.state.value}
                    onChange={(checked) => field.handleChange(checked)}
                  />
                  <Label
                    htmlFor={field.name}
                    className="flex cursor-pointer items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Prefer SeaDex
                  </Label>
                </div>
              )}
            </form.Field>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onPress={props.onCancel}>
              Cancel
            </Button>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  isDisabled={!canSubmit || createProfile.isPending || updateProfile.isPending}
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

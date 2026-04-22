import { useForm } from "@tanstack/react-form";
import * as v from "valibot";
import { SortableQualityList } from "~/components/settings/sortable-quality-list";
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
import { SizeInput } from "~/components/settings/form-controls";
import {
  createCreateProfileMutation,
  createQualitiesQuery,
  createUpdateProfileMutation,
  type QualityProfile,
} from "~/lib/api";

const ProfileSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1, "Name is required")),
  cutoff: v.pipe(v.string(), v.minLength(1, "Cutoff is required")),
  upgrade_allowed: v.boolean(),
  seadex_preferred: v.boolean(),
  allowed_qualities: v.array(v.string()),
  min_size: v.union([v.string(), v.undefined()]),
  max_size: v.union([v.string(), v.undefined()]),
});

export function ProfileForm(props: {
  onCancel: () => void;
  onSuccess: () => void;
  profile?: QualityProfile;
}) {
  const createProfile = createCreateProfileMutation();
  const updateProfile = createUpdateProfileMutation();
  const qualitiesQuery = createQualitiesQuery();
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
      onChange: ProfileSchema,
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
      <CardHeader className="pb-4">
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
                {field.state.meta.errors[0]?.message && (
                  <div className="text-[0.8rem] text-destructive">
                    {field.state.meta.errors[0]?.message}
                  </div>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="cutoff">
            {(field) => (
              <div className="flex flex-col gap-1">
                <label
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  htmlFor={field.name}
                >
                  Cutoff Quality
                </label>
                <Select
                  value={qualityNames.includes(field.state.value) ? field.state.value : undefined}
                  onValueChange={(value) => {
                    if (value !== null) {
                      field.handleChange(value);
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select cutoff..." />
                  </SelectTrigger>
                  <SelectContent>
                    {qualityNames.map((quality) => (
                      <SelectItem key={quality} value={quality}>
                        {quality}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field.state.meta.errors.length > 0 && (
                  <div className="text-[0.8rem] text-destructive">
                    {field.state.meta.errors[0]?.message}
                  </div>
                )}
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
                onChange: v.optional(
                  v.pipe(
                    v.string(),
                    v.regex(
                      /^[0-9]+(\.[0-9]+)?\s*(MB|GB)$/i,
                      "Must be format like '500 MB' or '2.5 GB'",
                    ),
                  ),
                ),
              }}
            >
              {(field) => (
                <SizeInput
                  label="Minimum Size"
                  value={field.state.value || ""}
                  onChange={(value) => field.handleChange(value)}
                  {...(field.state.meta.errors[0]?.message === undefined
                    ? {}
                    : { error: field.state.meta.errors[0]?.message })}
                />
              )}
            </form.Field>

            <form.Field
              name="max_size"
              validators={{
                onChange: v.optional(
                  v.pipe(
                    v.string(),
                    v.regex(
                      /^[0-9]+(\.[0-9]+)?\s*(MB|GB)$/i,
                      "Must be format like '500 MB' or '2.5 GB'",
                    ),
                  ),
                ),
              }}
            >
              {(field) => (
                <SizeInput
                  label="Maximum Size"
                  value={field.state.value || ""}
                  onChange={(value) => field.handleChange(value)}
                  {...(field.state.meta.errors[0]?.message === undefined
                    ? {}
                    : { error: field.state.meta.errors[0]?.message })}
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
                    checked={field.state.value}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                  />
                  <label
                    htmlFor={field.name}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                  >
                    Allow Upgrades
                  </label>
                </div>
              )}
            </form.Field>

            <form.Field name="seadex_preferred">
              {(field) => (
                <div className="flex items-center gap-2">
                  <Switch
                    id={field.name}
                    checked={field.state.value}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                  />
                  <label
                    htmlFor={field.name}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                  >
                    Prefer SeaDex
                  </label>
                </div>
              )}
            </form.Field>
          </div>

          <div className="flex gap-2 justify-end pt-2">
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

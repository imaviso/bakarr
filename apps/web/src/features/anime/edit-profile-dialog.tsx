import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Label } from "~/components/ui/label";
import type { QualityProfile, ReleaseProfile } from "~/api/contracts";

const EditProfileSchema = Schema.Struct({
  profile: Schema.String,
  releaseProfileIds: Schema.mutable(Schema.Array(Schema.Number)),
});

type EditProfileFormData = Schema.Schema.Type<typeof EditProfileSchema>;

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProfile: string;
  currentReleaseProfileIds: number[];
  animeId: number;
  profiles: readonly QualityProfile[];
  releaseProfiles: readonly ReleaseProfile[];
  updateProfile: (input: { id: number; profileName: string }) => Promise<unknown>;
  isUpdatingProfile: boolean;
  updateReleaseProfiles: (input: { id: number; releaseProfileIds: number[] }) => Promise<unknown>;
  isUpdatingReleaseProfiles: boolean;
}

export function EditProfileDialog(props: EditProfileDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <EditProfileDialogContent {...props} />}
    </Dialog>
  );
}

function EditProfileDialogContent(props: EditProfileDialogProps) {
  const form = useForm({
    defaultValues: {
      profile: props.currentProfile,
      releaseProfileIds: props.currentReleaseProfileIds,
    } as EditProfileFormData,
    onSubmit: async ({ value }) => {
      const operations: Promise<unknown>[] = [];

      if (value.profile !== props.currentProfile) {
        operations.push(
          props.updateProfile({
            id: props.animeId,
            profileName: value.profile,
          }),
        );
      }

      const currentIds = props.currentReleaseProfileIds.toSorted((a, b) => a - b);
      const newIds = value.releaseProfileIds.toSorted((a, b) => a - b);
      const releaseProfilesChanged =
        currentIds.length !== newIds.length || currentIds.some((id, i) => id !== newIds[i]);

      if (releaseProfilesChanged) {
        operations.push(
          props.updateReleaseProfiles({
            id: props.animeId,
            releaseProfileIds: value.releaseProfileIds,
          }),
        );
      }

      await Promise.all(operations);
      props.onOpenChange(false);
    },
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit Profiles</DialogTitle>
        <DialogDescription>
          Change the quality and release profiles for this anime.
        </DialogDescription>
      </DialogHeader>
      <form action={() => void form.handleSubmit()} className="space-y-6">
        <form.Field name="profile">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="profile-select">Quality Profile</Label>
              <Select
                value={field.state.value}
                onValueChange={(value) => {
                  if (value !== null) {
                    field.handleChange(value);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select profile..." />
                </SelectTrigger>
                <SelectContent>
                  {props.profiles.map((profile) => (
                    <SelectItem key={profile.name} value={profile.name}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        <div className="space-y-2">
          <div className="text-sm font-medium leading-none">Release Profiles (Optional)</div>
          <form.Field name="releaseProfileIds">
            {(field) => (
              <div className="border rounded-none p-3 max-h-[150px] overflow-y-auto space-y-2">
                {props.releaseProfiles.length > 0 ? (
                  <>
                    {props.releaseProfiles.map((releaseProfile) => (
                      <div key={releaseProfile.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`rp-edit-${releaseProfile.id}`}
                          checked={field.state.value.includes(releaseProfile.id)}
                          onCheckedChange={(checked) => {
                            const currentIds = field.state.value;
                            if (checked) {
                              field.handleChange([...currentIds, releaseProfile.id]);
                            } else {
                              field.handleChange(
                                currentIds.filter((id) => id !== releaseProfile.id),
                              );
                            }
                          }}
                        />
                        <label
                          htmlFor={`rp-edit-${releaseProfile.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1 flex items-center justify-between"
                        >
                          <span>{releaseProfile.name}</span>
                          <div className="flex gap-2">
                            {releaseProfile.is_global && (
                              <Badge variant="outline" className="text-xs h-4 px-1">
                                Global
                              </Badge>
                            )}
                            {!releaseProfile.enabled && (
                              <Badge
                                variant="outline"
                                className="text-xs h-4 px-1 text-muted-foreground"
                              >
                                Disabled
                              </Badge>
                            )}
                          </div>
                        </label>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-2">
                    No release profiles available
                  </div>
                )}
              </div>
            )}
          </form.Field>
          <p className="text-xs text-muted-foreground">
            Global profiles are applied automatically. Select specific profiles to apply them to
            this series.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              form.state.isSubmitting || props.isUpdatingProfile || props.isUpdatingReleaseProfiles
            }
          >
            {form.state.isSubmitting || props.isUpdatingProfile || props.isUpdatingReleaseProfiles
              ? "Saving..."
              : "Save Changes"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

import { createForm } from "@tanstack/solid-form";
import { createSignal, For, Show } from "solid-js";
import * as v from "valibot";
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
import type { QualityProfile, ReleaseProfile } from "~/lib/api";

const EditProfileSchema = v.object({
  profile: v.string(),
  releaseProfileIds: v.array(v.number()),
});

type EditProfileFormData = v.InferOutput<typeof EditProfileSchema>;

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProfile: string;
  currentReleaseProfileIds: number[];
  animeId: number;
  profiles: QualityProfile[];
  releaseProfiles: ReleaseProfile[];
  updateProfile: (input: { id: number; profileName: string }) => Promise<unknown>;
  isUpdatingProfile: boolean;
  updateReleaseProfiles: (input: { id: number; releaseProfileIds: number[] }) => Promise<unknown>;
  isUpdatingReleaseProfiles: boolean;
}

export function EditProfileDialog(props: EditProfileDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <Show when={props.open}>
        <EditProfileDialogContent {...props} />
      </Show>
    </Dialog>
  );
}

function EditProfileDialogContent(props: EditProfileDialogProps) {
  const form = createForm(() => ({
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

      const currentIds = props.currentReleaseProfileIds.slice().toSorted((a, b) => a - b);
      const newIds = value.releaseProfileIds.slice().toSorted((a, b) => a - b);
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
  }));

  const [isSubmitting, setIsSubmitting] = createSignal(false);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit Profiles</DialogTitle>
        <DialogDescription>
          Change the quality and release profiles for this anime.
        </DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsSubmitting(true);
          void form.handleSubmit().finally(() => {
            setIsSubmitting(false);
          });
        }}
        class="space-y-6"
      >
        <form.Field name="profile">
          {(field) => (
            <div class="space-y-2">
              <label class="text-sm font-medium leading-none" for="profile-select">
                Quality Profile
              </label>
              <Select
                value={field().state.value}
                onChange={(value) => value && field().handleChange(value)}
                options={props.profiles.map((profile) => profile.name)}
                placeholder="Select profile..."
                itemComponent={(selectProps) => (
                  <SelectItem item={selectProps.item}>{selectProps.item.rawValue}</SelectItem>
                )}
              >
                <SelectTrigger class="w-full">
                  <SelectValue<string>>{(state) => state.selectedOption()}</SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>
          )}
        </form.Field>

        <div class="space-y-2">
          <div class="text-sm font-medium leading-none">Release Profiles (Optional)</div>
          <form.Field name="releaseProfileIds">
            {(field) => (
              <div class="border rounded-md p-3 max-h-[150px] overflow-y-auto space-y-2">
                <Show
                  when={props.releaseProfiles.length > 0}
                  fallback={
                    <div class="text-sm text-muted-foreground text-center py-2">
                      No release profiles available
                    </div>
                  }
                >
                  <For each={props.releaseProfiles}>
                    {(releaseProfile) => (
                      <div class="flex items-center space-x-2">
                        <Checkbox
                          id={`rp-edit-${releaseProfile.id}`}
                          checked={field().state.value.includes(releaseProfile.id)}
                          onChange={(checked: boolean) => {
                            const currentIds = field().state.value;
                            if (checked) {
                              field().handleChange([...currentIds, releaseProfile.id]);
                            } else {
                              field().handleChange(
                                currentIds.filter((id) => id !== releaseProfile.id),
                              );
                            }
                          }}
                        />
                        <label
                          for={`rp-edit-${releaseProfile.id}`}
                          class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1 flex items-center justify-between"
                        >
                          <span>{releaseProfile.name}</span>
                          <div class="flex gap-2">
                            <Show when={releaseProfile.is_global}>
                              <Badge variant="outline" class="text-xs h-4 px-1">
                                Global
                              </Badge>
                            </Show>
                            <Show when={!releaseProfile.enabled}>
                              <Badge
                                variant="outline"
                                class="text-xs h-4 px-1 text-muted-foreground"
                              >
                                Disabled
                              </Badge>
                            </Show>
                          </div>
                        </label>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            )}
          </form.Field>
          <p class="text-xs text-muted-foreground">
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
            disabled={isSubmitting() || props.isUpdatingProfile || props.isUpdatingReleaseProfiles}
          >
            {isSubmitting() || props.isUpdatingProfile || props.isUpdatingReleaseProfiles
              ? "Saving..."
              : "Save Changes"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

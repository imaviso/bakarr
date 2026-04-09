import { IconFolder, IconLoader2 } from "@tabler/icons-solidjs";
import { createForm } from "@tanstack/solid-form";
import { createMemo, For, Show } from "solid-js";
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
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";
import {
  type AnimeSearchResult,
  createAddAnimeMutation,
  createProfilesQuery,
  createReleaseProfilesQuery,
  createSystemConfigQuery,
} from "~/lib/api";

const AddAnimeSchema = v.object({
  root_folder: v.pipe(v.string(), v.minLength(1, "Root folder is required")),
  profile_name: v.pipe(v.string(), v.minLength(1, "Profile is required")),
  monitor: v.boolean(),
  search_now: v.boolean(),
  release_profile_ids: v.array(v.number()),
});

interface AddAnimeDialogProps {
  anime: AnimeSearchResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddAnimeDialog(props: AddAnimeDialogProps) {
  const profilesQuery = createProfilesQuery();
  const releaseProfilesQuery = createReleaseProfilesQuery();
  const configQuery = createSystemConfigQuery();
  const addAnimeMutation = createAddAnimeMutation();

  const defaultValues = createMemo(() => ({
    root_folder: configQuery.data?.library.library_path ?? "",
    profile_name: profilesQuery.data?.[0]?.name ?? "",
    monitor: true,
    search_now: true,
    release_profile_ids: [] as number[],
  }));

  const form = createForm(() => ({
    defaultValues: defaultValues(),
    validators: {
      onChange: AddAnimeSchema,
    },
    onSubmit: async ({ value }) => {
      await addAnimeMutation.mutateAsync({
        id: props.anime.id,
        profile_name: value.profile_name,
        root_folder: value.root_folder,
        monitor_and_search: value.search_now,
        monitored: value.monitor,
        release_profile_ids: value.release_profile_ids,
      });
      props.onSuccess();
    },
  }));

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add to Library</DialogTitle>
          <DialogDescription>
            Configure settings for{" "}
            <span class="font-medium text-foreground">{props.anime.title.romaji}</span>
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
          class="space-y-6 py-4"
        >
          <form.Field name="root_folder">
            {(field) => (
              <TextField value={field().state.value} onChange={field().handleChange}>
                <TextFieldLabel>Root Folder Path</TextFieldLabel>
                <div class="relative">
                  <IconFolder class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <TextFieldInput class="pl-9" placeholder="/path/to/anime" />
                </div>
                <Show when={field().state.meta.errors.length > 0}>
                  <p class="text-[0.8rem] text-destructive mt-1">
                    {field().state.meta.errors[0]?.message}
                  </p>
                </Show>
              </TextField>
            )}
          </form.Field>

          <form.Field name="profile_name">
            {(field) => (
              <div class="space-y-2">
                <label class="text-sm font-medium leading-none" for={field().name}>
                  Quality Profile
                </label>
                <Select
                  name={field().name}
                  value={
                    profilesQuery.data?.map((profile) => profile.name).includes(field().state.value)
                      ? field().state.value
                      : null
                  }
                  onChange={(value) => value && field().handleChange(value)}
                  options={profilesQuery.data?.map((profile) => profile.name) || []}
                  placeholder="Select profile..."
                  itemComponent={(itemProps) => (
                    <SelectItem item={itemProps.item}>{itemProps.item.rawValue}</SelectItem>
                  )}
                >
                  <SelectTrigger>
                    <SelectValue<string>>{(state) => state.selectedOption()}</SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
                <Show when={field().state.meta.errors.length > 0}>
                  <p class="text-[0.8rem] text-destructive">
                    {field().state.meta.errors[0]?.message}
                  </p>
                </Show>
              </div>
            )}
          </form.Field>

          <form.Field name="release_profile_ids" mode="array">
            {(field) => (
              <div class="space-y-2">
                <div class="text-sm font-medium leading-none">Release Profiles (Optional)</div>
                <div class="border rounded-md p-3 max-h-[150px] overflow-y-auto space-y-2">
                  <Show
                    when={releaseProfilesQuery.data && releaseProfilesQuery.data.length > 0}
                    fallback={
                      <div class="text-sm text-muted-foreground text-center py-2">
                        No release profiles available
                      </div>
                    }
                  >
                    <For each={releaseProfilesQuery.data}>
                      {(profile) => (
                        <div class="flex items-center space-x-2">
                          <Checkbox
                            id={`rp-${profile.id}`}
                            checked={field().state.value.includes(profile.id)}
                            onChange={(checked) => {
                              if (checked) {
                                field().pushValue(profile.id);
                              } else {
                                const idx = field().state.value.indexOf(profile.id);
                                if (idx !== -1) field().removeValue(idx);
                              }
                            }}
                          />
                          <label
                            for={`rp-${profile.id}`}
                            class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1 flex items-center justify-between"
                          >
                            <span>{profile.name}</span>
                            <div class="flex gap-2">
                              <Show when={profile.is_global}>
                                <Badge variant="outline" class="text-xs h-4 px-1">
                                  Global
                                </Badge>
                              </Show>
                              <Show when={!profile.enabled}>
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
                <p class="text-xs text-muted-foreground">
                  Global profiles are applied automatically unless disabled. Select specific
                  profiles to apply them to this series.
                </p>
              </div>
            )}
          </form.Field>

          <div class="flex flex-col gap-4">
            <form.Field name="monitor">
              {(field) => (
                <div class="items-top flex space-x-2">
                  <Checkbox
                    id="monitor"
                    checked={field().state.value}
                    onChange={field().handleChange}
                  />
                  <div class="grid gap-1.5 leading-none">
                    <label
                      for="monitor"
                      class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Monitor
                    </label>
                    <p class="text-xs text-muted-foreground">
                      Track this show for new episodes (RSS).
                    </p>
                  </div>
                </div>
              )}
            </form.Field>

            <form.Field name="search_now">
              {(field) => (
                <div class="items-top flex space-x-2">
                  <Checkbox
                    id="search_now"
                    checked={field().state.value}
                    onChange={field().handleChange}
                  />
                  <div class="grid gap-1.5 leading-none">
                    <label
                      for="search_now"
                      class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Start Search
                    </label>
                    <p class="text-xs text-muted-foreground">
                      Immediately search for missing episodes.
                    </p>
                  </div>
                </div>
              )}
            </form.Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {(state) => (
                <Button type="submit" disabled={!state()[0] || addAnimeMutation.isPending}>
                  <Show
                    when={!addAnimeMutation.isPending}
                    fallback={
                      <>
                        <IconLoader2 class="mr-2 h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    }
                  >
                    Add Anime
                  </Show>
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

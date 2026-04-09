import { IconAdjustments, IconEdit, IconPlus, IconTrash } from "@tabler/icons-solidjs";
import { createSignal, For, Show } from "solid-js";
import { ProfileForm } from "~/components/settings/quality-profile-form";
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
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { createDeleteProfileMutation, createProfilesQuery, type QualityProfile } from "~/lib/api";

interface QualityProfileCardProps {
  onDelete: (name: string) => void;
  onEdit: (profile: QualityProfile) => void;
  profile: QualityProfile;
}

function QualityProfileCard(props: QualityProfileCardProps) {
  return (
    <Card class="group transition-colors duration-200 hover:border-primary/50">
      <CardHeader class="pb-3">
        <div class="flex justify-between items-start">
          <div class="space-y-1">
            <CardTitle class="text-base flex items-center gap-2">
              {props.profile.name}
              <Show when={props.profile.seadex_preferred}>
                <Badge
                  variant="secondary"
                  class="text-xs h-5 px-1.5 font-normal text-muted-foreground"
                >
                  SeaDex
                </Badge>
              </Show>
            </CardTitle>
            <div class="text-xs text-muted-foreground">
              Cutoff: <span class="font-medium text-foreground">{props.profile.cutoff}</span>
            </div>
            <Show when={props.profile.min_size || props.profile.max_size}>
              <div class="text-xs text-muted-foreground flex gap-2">
                <Show when={props.profile.min_size}>
                  <span>Min: {props.profile.min_size}</span>
                </Show>
                <Show when={props.profile.max_size}>
                  <span>Max: {props.profile.max_size}</span>
                </Show>
              </div>
            </Show>
          </div>

          <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              class="relative after:absolute after:-inset-2 h-8 w-8"
              onClick={() => props.onEdit(props.profile)}
              aria-label="Edit profile"
            >
              <IconEdit class="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                as={Button}
                variant="ghost"
                size="icon"
                class="relative after:absolute after:-inset-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label="Delete profile"
              >
                <IconTrash class="h-4 w-4" />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete profile "{props.profile.name}"? This action
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => props.onDelete(props.profile.name)}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>

      <CardContent class="pt-0">
        <div class="flex flex-wrap gap-1.5">
          <For each={props.profile.allowed_qualities}>
            {(quality) => (
              <Badge
                variant="outline"
                class="text-xs font-normal border-transparent bg-secondary/50 text-secondary-foreground hover:bg-secondary"
              >
                {quality}
              </Badge>
            )}
          </For>
        </div>

        <div class="flex gap-4 mt-4 text-sm items-center text-muted-foreground">
          <span class="flex items-center gap-2">
            <Switch checked={props.profile.upgrade_allowed} disabled class="pointer-events-none" />
            <span class={props.profile.upgrade_allowed ? "text-foreground" : ""}>Upgrades</span>
          </span>
          <span class="flex items-center gap-2">
            <Switch checked={props.profile.seadex_preferred} disabled class="pointer-events-none" />
            <span class={props.profile.seadex_preferred ? "text-foreground" : ""}>SeaDex</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function QualityProfilesTab() {
  const [editingProfile, setEditingProfile] = createSignal<QualityProfile | null>(null);
  const [isCreating, setIsCreating] = createSignal(false);

  const profilesQuery = createProfilesQuery();
  const deleteProfile = createDeleteProfileMutation();

  return (
    <Show
      when={!isCreating() && !editingProfile()}
      fallback={
        <div class="mb-6">
          <Show when={isCreating()}>
            <ProfileForm
              onCancel={() => setIsCreating(false)}
              onSuccess={() => setIsCreating(false)}
            />
          </Show>
          <Show when={editingProfile()}>
            <ProfileForm
              profile={editingProfile()!}
              onCancel={() => setEditingProfile(null)}
              onSuccess={() => setEditingProfile(null)}
            />
          </Show>
        </div>
      }
    >
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-lg font-medium">Quality Profiles</h2>
          <p class="text-sm text-muted-foreground">
            Configure quality profiles for automatic downloads
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} disabled={isCreating()} size="sm">
          <IconPlus class="mr-2 h-4 w-4" />
          Add Profile
        </Button>
      </div>

      <Show when={profilesQuery.isLoading}>
        <div class="space-y-4">
          <For each={[1, 2]}>{() => <Skeleton class="h-32 rounded-lg" />}</For>
        </div>
      </Show>

      <Show when={!profilesQuery.isLoading && profilesQuery.data?.length === 0}>
        <Card class="p-12 text-center border-dashed bg-transparent">
          <div class="flex flex-col items-center gap-4">
            <IconAdjustments class="h-12 w-12 text-muted-foreground/50" />
            <div>
              <h3 class="font-medium">No quality profiles</h3>
              <p class="text-sm text-muted-foreground mt-1">
                Create a profile to define download quality settings
              </p>
            </div>
            <Button onClick={() => setIsCreating(true)}>
              <IconPlus class="mr-2 h-4 w-4" />
              Create Profile
            </Button>
          </div>
        </Card>
      </Show>

      <Show when={profilesQuery.data && profilesQuery.data.length > 0}>
        <div class="grid gap-4">
          <For each={profilesQuery.data}>
            {(profile) => (
              <QualityProfileCard
                profile={profile}
                onDelete={(name) => deleteProfile.mutate(name)}
                onEdit={setEditingProfile}
              />
            )}
          </For>
        </div>
      </Show>
    </Show>
  );
}

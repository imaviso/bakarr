import { IconEdit, IconListCheck, IconPlus, IconTrash } from "@tabler/icons-solidjs";
import { createSignal, For, Show } from "solid-js";
import { ReleaseProfileForm } from "~/components/settings/release-profile-form";
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
import {
  createDeleteReleaseProfileMutation,
  createReleaseProfilesQuery,
  type ReleaseProfile,
} from "~/lib/api";

interface ReleaseProfileCardProps {
  onDelete: (id: number) => void;
  onEdit: (profile: ReleaseProfile) => void;
  profile: ReleaseProfile;
}

function ReleaseProfileCard(props: ReleaseProfileCardProps) {
  return (
    <Card class="group transition-colors duration-200 hover:border-primary/50">
      <CardHeader class="pb-3">
        <div class="flex justify-between items-start">
          <div class="space-y-1">
            <CardTitle class="text-base flex items-center gap-2">
              {props.profile.name}
              <div class="flex items-center gap-1.5">
                <Show
                  when={props.profile.enabled}
                  fallback={
                    <Badge variant="outline" class="text-xs h-5 px-1.5 text-muted-foreground">
                      Disabled
                    </Badge>
                  }
                >
                  <Badge class="text-xs h-5 px-1.5 bg-success/10 text-success border-success/20 font-medium">
                    Enabled
                  </Badge>
                </Show>
                <Show when={props.profile.is_global}>
                  <Badge variant="secondary" class="text-xs h-5 px-1.5 font-normal">
                    Global
                  </Badge>
                </Show>
              </div>
            </CardTitle>
            <div class="text-xs text-muted-foreground">{props.profile.rules.length} Rules</div>
          </div>

          <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              class="relative after:absolute after:-inset-2 h-8 w-8"
              onClick={() => props.onEdit(props.profile)}
              aria-label="Edit release profile"
            >
              <IconEdit class="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                as={Button}
                variant="ghost"
                size="icon"
                class="relative after:absolute after:-inset-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label="Delete release profile"
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
                    onClick={() => props.onDelete(props.profile.id)}
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
        <div class="flex flex-wrap gap-2">
          <For each={props.profile.rules.slice(0, 5)}>
            {(rule) => (
              <Badge
                variant={rule.rule_type === "must_not" ? "error" : "secondary"}
                class="text-xs font-normal"
              >
                <Show
                  when={rule.rule_type === "preferred"}
                  fallback={rule.rule_type === "must" ? "Must: " : "Block: "}
                >
                  {rule.score > 0 ? "+" : ""}
                  {rule.score}{" "}
                </Show>
                {rule.term}
              </Badge>
            )}
          </For>
          <Show when={props.profile.rules.length > 5}>
            <Badge variant="outline" class="text-xs">
              +{props.profile.rules.length - 5} more
            </Badge>
          </Show>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReleaseProfilesTab() {
  const [editingProfile, setEditingProfile] = createSignal<ReleaseProfile | null>(null);
  const [isCreating, setIsCreating] = createSignal(false);

  const releaseProfilesQuery = createReleaseProfilesQuery();
  const deleteReleaseProfile = createDeleteReleaseProfileMutation();

  return (
    <Show
      when={!isCreating() && !editingProfile()}
      fallback={
        <div class="mb-6">
          <Show when={isCreating()}>
            <ReleaseProfileForm
              onCancel={() => setIsCreating(false)}
              onSuccess={() => setIsCreating(false)}
            />
          </Show>
          <Show when={editingProfile()}>
            <ReleaseProfileForm
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
          <h2 class="text-lg font-medium">Release Profiles</h2>
          <p class="text-sm text-muted-foreground">
            Global scoring and filtering rules for releases (Groups, Tags)
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} disabled={isCreating()} size="sm">
          <IconPlus class="mr-2 h-4 w-4" />
          Add Profile
        </Button>
      </div>

      <Show when={releaseProfilesQuery.isLoading}>
        <div class="space-y-4">
          <For each={[1, 2]}>{() => <Skeleton class="h-32 rounded-lg" />}</For>
        </div>
      </Show>

      <Show when={!releaseProfilesQuery.isLoading && releaseProfilesQuery.data?.length === 0}>
        <Card class="p-12 text-center border-dashed bg-transparent">
          <div class="flex flex-col items-center gap-4">
            <IconListCheck class="h-12 w-12 text-muted-foreground/50" />
            <div>
              <h3 class="font-medium">No release profiles</h3>
              <p class="text-sm text-muted-foreground mt-1">
                Create a profile to prefer certain groups or filter releases
              </p>
            </div>
            <Button onClick={() => setIsCreating(true)}>
              <IconPlus class="mr-2 h-4 w-4" />
              Create Profile
            </Button>
          </div>
        </Card>
      </Show>

      <Show when={releaseProfilesQuery.data && releaseProfilesQuery.data.length > 0}>
        <div class="grid gap-4">
          <For each={releaseProfilesQuery.data}>
            {(profile) => (
              <ReleaseProfileCard
                profile={profile}
                onDelete={(id) => deleteReleaseProfile.mutate(id)}
                onEdit={setEditingProfile}
              />
            )}
          </For>
        </div>
      </Show>
    </Show>
  );
}

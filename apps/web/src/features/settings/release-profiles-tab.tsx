import { PencilSimpleIcon, ListChecksIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState } from "~/components/shared/empty-state";
import { ReleaseProfileForm } from "~/features/settings/release-profile-form";
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
import {
  createDeleteReleaseProfileMutation,
  releaseProfilesQueryOptions,
  type ReleaseProfile,
} from "~/api";

interface ReleaseProfileCardProps {
  onDelete: (id: number) => void;
  onEdit: (profile: ReleaseProfile) => void;
  profile: ReleaseProfile;
}

function ReleaseProfileCard(props: ReleaseProfileCardProps) {
  return (
    <Card className="group transition-colors duration-200 hover:border-primary/50">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              {props.profile.name}
              <div className="flex items-center gap-1.5">
                {props.profile.enabled ? (
                  <Badge className="text-xs h-5 px-1.5 bg-success/10 text-success border-success/20 font-medium">
                    Enabled
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs h-5 px-1.5 text-muted-foreground">
                    Disabled
                  </Badge>
                )}
                {props.profile.is_global && (
                  <Badge variant="secondary" className="text-xs h-5 px-1.5 font-normal">
                    Global
                  </Badge>
                )}
              </div>
            </CardTitle>
            <div className="text-xs text-muted-foreground">{props.profile.rules.length} Rules</div>
          </div>

          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="relative after:absolute after:-inset-2 h-8 w-8"
              onClick={() => props.onEdit(props.profile)}
              aria-label="Edit release profile"
            >
              <PencilSimpleIcon className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button variant="ghost" size="icon" />}
                className="relative after:absolute after:-inset-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label="Delete release profile"
              >
                <TrashIcon className="h-4 w-4" />
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
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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

      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2">
          {props.profile.rules.slice(0, 5).map((rule) => (
            <Badge
              key={`${rule.rule_type}-${rule.term}-${rule.score}`}
              variant={rule.rule_type === "must_not" ? "destructive" : "secondary"}
              className="text-xs font-normal"
            >
              {rule.rule_type === "preferred" ? (
                <>
                  {rule.score > 0 ? "+" : ""}
                  {rule.score}{" "}
                </>
              ) : rule.rule_type === "must" ? (
                "Must: "
              ) : (
                "Block: "
              )}
              {rule.term}
            </Badge>
          ))}
          {props.profile.rules.length > 5 && (
            <Badge variant="outline" className="text-xs">
              +{props.profile.rules.length - 5} more
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ReleaseProfilesTab() {
  const [editingProfile, setEditingProfile] = useState<ReleaseProfile | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { data: releaseProfiles } = useSuspenseQuery(releaseProfilesQueryOptions());
  const deleteReleaseProfile = createDeleteReleaseProfileMutation();

  return (
    <>
      {isCreating || editingProfile ? (
        <div className="mb-6">
          {isCreating && (
            <ReleaseProfileForm
              onCancel={() => setIsCreating(false)}
              onSuccess={() => setIsCreating(false)}
            />
          )}
          {editingProfile && (
            <ReleaseProfileForm
              profile={editingProfile}
              onCancel={() => setEditingProfile(null)}
              onSuccess={() => setEditingProfile(null)}
            />
          )}
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-medium">Release Profiles</h2>
              <p className="text-sm text-muted-foreground">
                Global scoring and filtering rules for releases (Groups, Tags)
              </p>
            </div>
            <Button onClick={() => setIsCreating(true)} disabled={isCreating} size="sm">
              <PlusIcon className="mr-2 h-4 w-4" />
              Add Profile
            </Button>
          </div>

          {releaseProfiles.length === 0 && (
            <EmptyState
              icon={<ListChecksIcon className="h-12 w-12" />}
              title="No release profiles"
              description="Create a profile to prefer certain groups or filter releases"
              className="bg-transparent border-dashed"
            >
              <Button onClick={() => setIsCreating(true)}>
                <PlusIcon className="mr-2 h-4 w-4" />
                Create Profile
              </Button>
            </EmptyState>
          )}

          {releaseProfiles.length > 0 && (
            <div className="grid gap-4">
              {releaseProfiles.map((profile) => (
                <ReleaseProfileCard
                  key={profile.id}
                  profile={profile}
                  onDelete={(id) => deleteReleaseProfile.mutate(id)}
                  onEdit={setEditingProfile}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

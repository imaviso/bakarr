import {
  SlidersHorizontalIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState } from "~/components/shared/empty-state";
import { ProfileForm } from "~/features/settings/quality-profile-form";
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
import { Switch } from "~/components/ui/switch";
import { useDeleteProfileMutation, profilesQueryOptions } from "~/api/profiles";
import type { QualityProfile } from "~/api/contracts";

interface QualityProfileCardProps {
  onDelete: (name: string) => void;
  onEdit: (profile: QualityProfile) => void;
  profile: QualityProfile;
}

function QualityProfileCard(props: QualityProfileCardProps) {
  return (
    <Card className="group transition-colors duration-200 hover:border-primary/50">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              {props.profile.name}
              {props.profile.seadex_preferred && (
                <Badge
                  variant="secondary"
                  className="text-xs h-5 px-1.5 font-normal text-muted-foreground"
                >
                  SeaDex
                </Badge>
              )}
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              Cutoff: <span className="font-medium text-foreground">{props.profile.cutoff}</span>
            </div>
            {props.profile.min_size || props.profile.max_size ? (
              <div className="text-xs text-muted-foreground flex gap-2">
                {props.profile.min_size && <span>Min: {props.profile.min_size}</span>}
                {props.profile.max_size && <span>Max: {props.profile.max_size}</span>}
              </div>
            ) : null}
          </div>

          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="relative after:absolute after:-inset-2 h-8 w-8"
              onClick={() => props.onEdit(props.profile)}
              aria-label="Edit profile"
            >
              <PencilSimpleIcon className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button variant="ghost" size="icon" />}
                className="relative after:absolute after:-inset-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label="Delete profile"
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

      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-1.5">
          {props.profile.allowed_qualities.map((quality) => (
            <Badge
              key={quality}
              variant="outline"
              className="text-xs font-normal border-transparent bg-secondary/50 text-secondary-foreground hover:bg-secondary"
            >
              {quality}
            </Badge>
          ))}
        </div>

        <div className="flex gap-4 mt-4 text-sm items-center text-muted-foreground">
          <span className="flex items-center gap-2">
            <Switch
              checked={props.profile.upgrade_allowed}
              disabled
              className="pointer-events-none"
            />
            <span className={props.profile.upgrade_allowed ? "text-foreground" : ""}>Upgrades</span>
          </span>
          <span className="flex items-center gap-2">
            <Switch
              checked={props.profile.seadex_preferred}
              disabled
              className="pointer-events-none"
            />
            <span className={props.profile.seadex_preferred ? "text-foreground" : ""}>SeaDex</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function QualityProfilesTab() {
  const [editingProfile, setEditingProfile] = useState<QualityProfile | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { data: profiles } = useSuspenseQuery(profilesQueryOptions());
  const deleteProfile = useDeleteProfileMutation();

  return (
    <>
      {isCreating || editingProfile ? (
        <div className="mb-6">
          {isCreating && (
            <ProfileForm
              onCancel={() => setIsCreating(false)}
              onSuccess={() => setIsCreating(false)}
            />
          )}
          {editingProfile && (
            <ProfileForm
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
              <h2 className="text-lg font-medium">Quality Profiles</h2>
              <p className="text-sm text-muted-foreground">
                Configure quality profiles for automatic downloads
              </p>
            </div>
            <Button onClick={() => setIsCreating(true)} disabled={isCreating} size="sm">
              <PlusIcon className="mr-2 h-4 w-4" />
              Add Profile
            </Button>
          </div>

          {profiles.length === 0 && (
            <EmptyState
              icon={<SlidersHorizontalIcon className="h-12 w-12" />}
              title="No quality profiles"
              description="Create a profile to define download quality settings"
              className="bg-transparent border-dashed"
            >
              <Button onClick={() => setIsCreating(true)}>
                <PlusIcon className="mr-2 h-4 w-4" />
                Create Profile
              </Button>
            </EmptyState>
          )}

          {profiles.length > 0 && (
            <div className="grid gap-4">
              {profiles.map((profile) => (
                <QualityProfileCard
                  key={profile.name}
                  profile={profile}
                  onDelete={(name) => deleteProfile.mutate(name)}
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

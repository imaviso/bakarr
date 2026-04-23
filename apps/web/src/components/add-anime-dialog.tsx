import {
  CalendarIcon,
  CheckIcon,
  TelevisionIcon,
  FolderIcon,
  PlusIcon,
  SpinnerIcon,
} from "@phosphor-icons/react";
import { useForm } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import * as v from "valibot";
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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  type AnimeSearchResult,
  createAddAnimeMutation,
  profilesQueryOptions,
  releaseProfilesQueryOptions,
  systemConfigQueryOptions,
  type QualityProfile,
  type ReleaseProfile,
} from "~/lib/api";
import {
  animeDiscoverySubtitle,
  animeDisplayTitle,
  animeSearchSubtitle,
} from "~/lib/anime-metadata";
import { formatMatchConfidence } from "~/lib/scanned-file";
import { cn } from "~/lib/utils";

const AddAnimeSchema = v.object({
  root_folder: v.pipe(v.string(), v.minLength(1, "Root folder is required")),
  profile_name: v.pipe(v.string(), v.minLength(1, "Profile is required")),
  monitor: v.boolean(),
  search_now: v.boolean(),
  release_profile_ids: v.array(v.number()),
});

export interface AddAnimeDialogProps {
  anime: AnimeSearchResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddAnimeDialog(props: AddAnimeDialogProps) {
  const { data: profiles } = useSuspenseQuery(profilesQueryOptions());
  const { data: releaseProfiles } = useSuspenseQuery(releaseProfilesQueryOptions());
  const { data: config } = useSuspenseQuery(systemConfigQueryOptions());

  const metadataChips = [
    props.anime.format,
    props.anime.episode_count ? `${props.anime.episode_count} eps` : undefined,
    animeSearchSubtitle(props.anime),
    formatMatchConfidence(props.anime.match_confidence),
  ].filter((chip): chip is string => Boolean(chip));

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {props.anime.cover_image ? (
              <img
                src={props.anime.cover_image}
                alt={props.anime.title.romaji}
                className="w-12 h-16 object-cover rounded-none"
              />
            ) : (
              <div className="w-12 h-16 bg-muted rounded-none flex items-center justify-center">
                <TelevisionIcon className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="truncate">{props.anime.title.romaji}</div>
              {props.anime.title.english && (
                <div className="text-sm text-muted-foreground font-normal truncate">
                  {props.anime.title.english}
                </div>
              )}
              {metadataChips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {metadataChips.map((chip) => (
                    <div
                      key={chip}
                      className="inline-flex items-center gap-1 rounded-none border px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {(chip.includes("/") || /^\d{4}$/.test(chip)) && (
                        <CalendarIcon className="h-3 w-3" />
                      )}
                      <span>{chip}</span>
                    </div>
                  ))}
                </div>
              )}
              {props.anime.genres && props.anime.genres.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {props.anime.genres.slice(0, 3).map((genre) => (
                    <div
                      key={genre}
                      className="inline-flex items-center rounded-none border px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {genre}
                    </div>
                  ))}
                </div>
              )}
              {props.anime.synonyms && props.anime.synonyms.length > 0 && (
                <div className="mt-2 text-[11px] text-muted-foreground line-clamp-2">
                  Also known as {props.anime.synonyms.slice(0, 3).join(" • ")}
                </div>
              )}
              {props.anime.related_anime && props.anime.related_anime.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {props.anime.related_anime.slice(0, 2).map((related) => (
                    <div
                      key={discoveryPreviewKey(related, "related")}
                      className="inline-flex items-center rounded-none border px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {[
                        animeDisplayTitle(related),
                        ...animeDiscoverySubtitle({
                          format: related.format,
                          relation_type: related.relation_type,
                          season: related.season,
                          season_year: related.season_year,
                          start_year: related.start_year,
                          status: related.status,
                        }),
                      ]
                        .filter(Boolean)
                        .join(" - ")}
                    </div>
                  ))}
                </div>
              )}
              {props.anime.recommended_anime && props.anime.recommended_anime.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {props.anime.recommended_anime.slice(0, 2).map((recommended) => (
                    <div
                      key={discoveryPreviewKey(recommended, "recommended")}
                      className="inline-flex items-center rounded-none border px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {[
                        animeDisplayTitle(recommended),
                        ...animeDiscoverySubtitle({
                          format: recommended.format,
                          relation_type: recommended.relation_type,
                          season: recommended.season,
                          season_year: recommended.season_year,
                          start_year: recommended.start_year,
                          status: recommended.status,
                        }),
                      ]
                        .filter(Boolean)
                        .join(" - ")}
                    </div>
                  ))}
                </div>
              )}
              {props.anime.match_reason && (
                <div className="mt-2 text-[11px] text-muted-foreground line-clamp-2">
                  {props.anime.match_reason}
                </div>
              )}
            </div>
          </DialogTitle>
          <DialogDescription>
            {props.anime.description?.trim()
              ? props.anime.description
              : "Configure how this anime should be added to your library."}
          </DialogDescription>
        </DialogHeader>

        <AddAnimeForm
          anime={props.anime}
          rootFolder={config.library.library_path}
          defaultProfile={profiles[0]?.name || ""}
          releaseProfiles={releaseProfiles}
          profiles={profiles}
          onSuccess={() => {
            props.onSuccess?.();
            props.onOpenChange(false);
          }}
          onCancel={() => props.onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// 3. Extracted Form Component to isolate state
// The form now initializes synchronously with guaranteed data props
interface AddAnimeFormProps {
  anime: AnimeSearchResult;
  rootFolder: string;
  defaultProfile: string;
  releaseProfiles: ReleaseProfile[];
  profiles: QualityProfile[];
  onSuccess: () => void;
  onCancel: () => void;
}

function AddAnimeForm(props: AddAnimeFormProps) {
  const addAnimeMutation = createAddAnimeMutation();

  const form = useForm({
    // No effects needed. Data is passed as stable props.
    defaultValues: {
      root_folder: props.rootFolder,
      profile_name: props.defaultProfile,
      monitor: true,
      search_now: true,
      release_profile_ids: [] as number[],
    },
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
  });

  const submitAddAnimeForm = async () => {
    await form.handleSubmit();
  };

  return (
    <form action={submitAddAnimeForm} className="space-y-5 py-4">
      <form.Field name="root_folder">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="add-anime-root-folder" className="flex items-center gap-2">
              <FolderIcon className="h-4 w-4" />
              Root Folder
            </Label>
            <Input
              id="add-anime-root-folder"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.currentTarget.value)}
              placeholder="/path/to/library"
            />
          </div>
        )}
      </form.Field>

      <form.Field name="profile_name">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="quality-profile-select">Quality Profile</Label>
            <Select
              value={field.state.value}
              onValueChange={(value) => {
                if (value !== null) {
                  field.handleChange(value);
                }
              }}
            >
              <SelectTrigger id="quality-profile-select">
                <SelectValue placeholder="Select profile" />
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

      {props.releaseProfiles.length > 0 && (
        <form.Field name="release_profile_ids" mode="array">
          {(field) => (
            <div className="space-y-2" id="release-profiles-field">
              <Label htmlFor="release-profiles-field">Release Profiles</Label>
              <div className="flex flex-wrap gap-2">
                {props.releaseProfiles.map((profile) => {
                  const isSelected = field.state.value.includes(profile.id);
                  const checkboxId = `release-profile-${profile.id}`;
                  return (
                    <label
                      key={profile.id}
                      htmlFor={checkboxId}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-none border cursor-pointer transition-colors",
                        isSelected ? "bg-primary/10 border-primary/30" : "hover:bg-accent",
                      )}
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            field.pushValue(profile.id);
                          } else {
                            field.removeValue(field.state.value.indexOf(profile.id));
                          }
                        }}
                      />
                      <span className="text-sm">{profile.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </form.Field>
      )}

      <div className="flex items-center gap-6">
        <form.Field name="monitor">
          {(field) => (
            <label htmlFor="monitor-checkbox" className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                id="monitor-checkbox"
                checked={field.state.value}
                onCheckedChange={field.handleChange}
              />
              <span className="text-sm">Monitor for new episodes</span>
            </label>
          )}
        </form.Field>

        <form.Field name="search_now">
          {(field) => (
            <label htmlFor="search-now-checkbox" className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                id="search-now-checkbox"
                checked={field.state.value}
                onCheckedChange={field.handleChange}
              />
              <span className="text-sm">Search for episodes now</span>
            </label>
          )}
        </form.Field>
      </div>

      {props.anime.already_in_library && (
        <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/30 rounded-none text-warning">
          <CheckIcon className="h-4 w-4" />
          <span className="text-sm">This anime is already in your library</span>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
          {([canSubmit]) => (
            <Button
              type="submit"
              disabled={!canSubmit || addAnimeMutation.isPending || props.anime.already_in_library}
            >
              {!addAnimeMutation.isPending ? (
                <>
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Add to Library
                </>
              ) : (
                <>
                  <SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              )}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}

function discoveryPreviewKey(
  entry: NonNullable<AnimeSearchResult["related_anime"]>[number],
  prefix: "related" | "recommended",
) {
  return [
    prefix,
    entry.id,
    animeDisplayTitle(entry),
    entry.relation_type,
    entry.season,
    entry.season_year,
    entry.start_year,
    entry.status,
  ]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .join(":");
}

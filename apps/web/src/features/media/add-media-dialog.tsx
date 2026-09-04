import {
  RiAddLine,
  RiCalendarLine,
  RiCheckLine,
  RiFolderLine,
  RiLoader4Line,
  RiTvLine,
} from "@remixicon/react";
import { useForm } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Schema } from "effect";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import {
  ContentDialog,
  ContentDialogBody,
  ContentDialogHeader,
} from "@/components/shared/content-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { MediaKind, MediaSearchResult, QualityProfile, ReleaseProfile } from "@/api/contracts";
import { formatFieldErrors } from "@/api/effect/errors";
import { useAddMediaMutation } from "@/api/media-mutations";
import { profilesQueryOptions, releaseProfilesQueryOptions } from "@/api/profiles";
import { systemConfigQueryOptions } from "@/api/system-config";
import {
  animeDiscoverySubtitle,
  animeDisplayTitle,
  animeSearchSubtitle,
} from "@/domain/media/metadata";
import { cleanSynopsis } from "@/domain/media/metadata";
import { mediaKindLabel, mediaUnitLabel, mediaUnitShortLabel } from "@/domain/media-unit";
import { formatMatchConfidence } from "@/domain/scanned-file";
import { cn } from "@/infra/utils";
import { FieldError } from "@/components/shared/field-error";

const AddAnimeSchema = Schema.Struct({
  root_folder: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1, { message: "Root folder is required" })),
  ),
  profile_name: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1, { message: "Profile is required" })),
  ),
  monitor: Schema.Boolean,
  search_now: Schema.Boolean,
  release_profile_ids: Schema.mutable(Schema.Array(Schema.Number)),
});

type AddAnimeFormValues = Schema.Schema.Type<typeof AddAnimeSchema>;

export interface AddAnimeDialogProps {
  media: MediaSearchResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddAnimeDialog(props: AddAnimeDialogProps) {
  const { data: profiles } = useSuspenseQuery(profilesQueryOptions());
  const { data: releaseProfiles } = useSuspenseQuery(releaseProfilesQueryOptions());
  const { data: config } = useSuspenseQuery(systemConfigQueryOptions());

  const metadataChips = [
    props.media.format,
    props.media.unit_count || props.media.volume_count
      ? mediaUnitShortLabel(
          props.media.media_kind === "anime" ? "episode" : "volume",
          props.media.media_kind === "anime"
            ? (props.media.unit_count ?? 0)
            : (props.media.volume_count ?? props.media.unit_count ?? 0),
        )
      : undefined,
    animeSearchSubtitle(props.media),
    formatMatchConfidence(props.media.match_confidence),
  ].filter((chip): chip is string => Boolean(chip));

  return (
    <ContentDialog size="lg" isOpen={props.open} onOpenChange={props.onOpenChange}>
      <ContentDialogHeader>
        <DialogTitle className="flex items-center gap-3">
          {props.media.cover_image ? (
            <img
              src={props.media.cover_image ?? undefined}
              alt={props.media.title.romaji ?? undefined}
              className="w-12 h-16 object-cover rounded-none"
            />
          ) : (
            <div className="w-12 h-16 bg-muted rounded-none flex items-center justify-center">
              <RiTvLine className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="truncate">{props.media.title.romaji}</div>
            {props.media.title.english && (
              <div className="text-sm text-muted-foreground font-normal truncate">
                {props.media.title.english}
              </div>
            )}
            {metadataChips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {metadataChips.map((chip) => (
                  <Badge
                    key={chip}
                    variant="outline"
                    className="inline-flex items-center gap-1 rounded-none font-normal text-muted-foreground max-w-full"
                  >
                    {(chip.includes("/") || /^\d{4}$/.test(chip)) && (
                      <RiCalendarLine className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate">{chip}</span>
                  </Badge>
                ))}
              </div>
            )}
            {props.media.genres && props.media.genres.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {props.media.genres.slice(0, 3).map((genre) => (
                  <Badge
                    key={genre}
                    variant="outline"
                    className="rounded-none font-normal text-muted-foreground max-w-full"
                  >
                    <span className="truncate min-w-0">{genre}</span>
                  </Badge>
                ))}
              </div>
            )}
            {props.media.synonyms && props.media.synonyms.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground line-clamp-2">
                Also known as {props.media.synonyms.slice(0, 3).join(" • ")}
              </div>
            )}
            {props.media.related_media && props.media.related_media.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {props.media.related_media.slice(0, 2).map((related) => (
                  <Badge
                    key={discoveryPreviewKey(related, "related")}
                    variant="outline"
                    className="rounded-none font-normal text-muted-foreground max-w-full"
                  >
                    <span className="truncate min-w-0">
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
                    </span>
                  </Badge>
                ))}
              </div>
            )}
            {props.media.recommended_media && props.media.recommended_media.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {props.media.recommended_media.slice(0, 2).map((recommended) => (
                  <Badge
                    key={discoveryPreviewKey(recommended, "recommended")}
                    variant="outline"
                    className="rounded-none font-normal text-muted-foreground max-w-full"
                  >
                    <span className="truncate min-w-0">
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
                    </span>
                  </Badge>
                ))}
              </div>
            )}
            {props.media.match_reason && (
              <div className="mt-2 text-xs text-muted-foreground line-clamp-2">
                {props.media.match_reason}
              </div>
            )}
          </div>
        </DialogTitle>
        <DialogDescription className="whitespace-pre-line line-clamp-4 mt-2">
          {props.media.description?.trim()
            ? cleanSynopsis(props.media.description)
            : `Configure how this ${mediaKindLabel(props.media.media_kind)} should be added to your library.`}
        </DialogDescription>
      </ContentDialogHeader>

      <ContentDialogBody className="p-4">
        <AddAnimeForm
          media={props.media}
          rootFolder={libraryPathForMediaKind(config.library, props.media.media_kind)}
          defaultProfile={profiles[0]?.name || ""}
          releaseProfiles={releaseProfiles}
          profiles={profiles}
          onSuccess={() => {
            props.onSuccess?.();
            props.onOpenChange(false);
          }}
          onCancel={() => props.onOpenChange(false)}
        />
      </ContentDialogBody>
    </ContentDialog>
  );
}

function libraryPathForMediaKind(
  library: { anime_path: string; manga_path: string; light_novel_path: string },
  mediaKind: MediaKind | null | undefined,
) {
  if (mediaKind === "manga") {
    return library.manga_path;
  }

  if (mediaKind === "light_novel") {
    return library.light_novel_path;
  }

  return library.anime_path;
}

// 3. Extracted Form Component to isolate state
// The form now initializes synchronously with guaranteed data props
interface AddAnimeFormProps {
  media: MediaSearchResult;
  rootFolder: string;
  defaultProfile: string;
  releaseProfiles: readonly ReleaseProfile[];
  profiles: readonly QualityProfile[];
  onSuccess: () => void;
  onCancel: () => void;
}

function AddAnimeForm(props: AddAnimeFormProps) {
  const addAnimeMutation = useAddMediaMutation();
  const unitKind = props.media.media_kind === "anime" ? "episode" : "volume";
  const unitLabelPlural = mediaUnitLabel(unitKind, 2).toLowerCase();
  const mediaLabel = mediaKindLabel(props.media.media_kind);
  const defaultValues: AddAnimeFormValues = {
    root_folder: props.rootFolder,
    profile_name: props.defaultProfile,
    monitor: true,
    search_now: true,
    release_profile_ids: [],
  };

  const form = useForm({
    // No effects needed. Data is passed as stable props.
    defaultValues,
    validators: {
      onChange: Schema.toStandardSchemaV1(AddAnimeSchema),
    },
    onSubmit: async ({ value }) => {
      await addAnimeMutation.mutateAsync({
        id: props.media.id,
        ...(props.media.media_kind == null ? {} : { media_kind: props.media.media_kind }),
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
              <RiFolderLine className="h-4 w-4" />
              Root Folder
            </Label>
            <Input
              id="add-anime-root-folder"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.currentTarget.value)}
              placeholder="/path/to/library"
            />
            <FieldError error={formatFieldErrors(field.state.meta.errors)} />
          </div>
        )}
      </form.Field>

      <form.Field name="profile_name">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="quality-profile-select">Quality Profile</Label>
            <Select
              selectedKey={field.state.value}
              onSelectionChange={(value) => {
                if (value !== null) {
                  field.handleChange(String(value));
                }
              }}
            >
              <SelectTrigger id="quality-profile-select" onBlur={field.handleBlur}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {props.profiles.map((profile) => (
                    <SelectItem key={profile.name} id={profile.name} textValue={profile.name}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldError error={formatFieldErrors(field.state.meta.errors)} />
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
                  return (
                    <Checkbox
                      key={profile.id}
                      isSelected={isSelected}
                      onChange={(checked) => {
                        if (checked) {
                          field.pushValue(profile.id);
                        } else {
                          field.removeValue(field.state.value.indexOf(profile.id));
                        }
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-none border px-3 py-2 text-sm transition-colors",
                        isSelected ? "border-primary/30 bg-primary/10" : "hover:bg-accent",
                      )}
                    >
                      {profile.name}
                    </Checkbox>
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
            <Checkbox
              isSelected={field.state.value}
              onChange={field.handleChange}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              Monitor for new {unitLabelPlural}
            </Checkbox>
          )}
        </form.Field>

        <form.Field name="search_now">
          {(field) => (
            <Checkbox
              isSelected={field.state.value}
              onChange={field.handleChange}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              Search for {unitLabelPlural} now
            </Checkbox>
          )}
        </form.Field>
      </div>

      {props.media.already_in_library && (
        <Alert variant="destructive">
          <RiCheckLine className="h-4 w-4" />
          <AlertDescription>This {mediaLabel} is already in your library</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onPress={props.onCancel}>
          Cancel
        </Button>
        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
          {([canSubmit]) => (
            <Button
              type="submit"
              isDisabled={Boolean(
                !canSubmit || addAnimeMutation.isPending || props.media.already_in_library,
              )}
            >
              {!addAnimeMutation.isPending ? (
                <>
                  <RiAddLine className="mr-2 h-4 w-4" />
                  Add to Library
                </>
              ) : (
                <>
                  <RiLoader4Line className="mr-2 h-4 w-4 animate-spin" />
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
  entry: NonNullable<MediaSearchResult["related_media"]>[number],
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

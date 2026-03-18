import {
  IconClock,
  IconLink,
  IconPlus,
  IconRss,
  IconToggleLeft,
  IconToggleRight,
  IconTrash,
} from "@tabler/icons-solidjs";
import { createForm } from "@tanstack/solid-form";
import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import * as v from "valibot";
import { GeneralError } from "~/components/general-error";
import { PageHeader } from "~/components/page-header";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  TextField,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import {
  animeListQueryOptions,
  createAddRssFeedMutation,
  createAnimeListQuery,
  createDeleteRssFeedMutation,
  createRssFeedsQuery,
  createToggleRssFeedMutation,
  type RssFeed,
  rssFeedsQueryOptions,
} from "~/lib/api";

export const Route = createFileRoute("/_layout/rss")({
  validateSearch: (search) => v.parse(v.object({}), search),
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(rssFeedsQueryOptions()),
      queryClient.ensureQueryData(animeListQueryOptions()),
    ]);
  },
  component: RssPage,
  errorComponent: GeneralError,
});

function RssPage() {
  const [isAdding, setIsAdding] = createSignal(false);
  const feedsQuery = createRssFeedsQuery();
  const deleteFeed = createDeleteRssFeedMutation();
  const toggleFeed = createToggleRssFeedMutation();

  return (
    <div class="space-y-6">
      <PageHeader
        title="RSS Feeds"
        subtitle="Manage RSS feeds for automatic episode detection"
      >
        <Button
          size="sm"
          onClick={() => setIsAdding(true)}
          disabled={isAdding()}
        >
          <IconPlus class="h-4 w-4" />
          Add Feed
        </Button>
      </PageHeader>

      <Show when={isAdding()}>
        <AddFeedForm
          onCancel={() => setIsAdding(false)}
          onSuccess={() => setIsAdding(false)}
        />
      </Show>

      <Show when={feedsQuery.isLoading}>
        <div class="space-y-4">
          <For each={[1, 2, 3]}>
            {() => <Skeleton class="h-20" />}
          </For>
        </div>
      </Show>

      <Show when={!feedsQuery.isLoading && feedsQuery.data?.length === 0}>
        <Card class="p-12 text-center border-dashed">
          <div class="flex flex-col items-center gap-4">
            <IconRss class="h-12 w-12 text-muted-foreground/50" />
            <div>
              <h3 class="font-medium">No RSS feeds</h3>
              <p class="text-sm text-muted-foreground mt-1">
                Add RSS feeds to automatically detect new episodes
              </p>
            </div>
            <Button onClick={() => setIsAdding(true)}>
              <IconPlus class="h-4 w-4" />
              Add Feed
            </Button>
          </div>
        </Card>
      </Show>

      <Show when={feedsQuery.data && feedsQuery.data.length > 0}>
        <div class="space-y-3">
          <For each={feedsQuery.data}>
            {(feed) => (
              <FeedCard
                feed={feed}
                onToggle={(enabled) =>
                  toggleFeed.mutate({ id: feed.id, enabled })}
                onDelete={() => deleteFeed.mutate(feed.id)}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function FeedCard(props: {
  feed: RssFeed;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <Card class="transition-all duration-150 hover:shadow-sm">
      <CardContent class="flex items-center gap-4 p-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => props.onToggle(!props.feed.enabled)}
          aria-label={props.feed.enabled ? "Disable feed" : "Enable feed"}
        >
          <Show
            when={props.feed.enabled}
            fallback={<IconToggleLeft class="h-6 w-6 text-muted-foreground" />}
          >
            <IconToggleRight class="h-6 w-6 text-success" />
          </Show>
        </Button>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <p class="font-medium truncate">
              {props.feed.name || "Unnamed Feed"}
            </p>
            <Badge
              variant={props.feed.enabled ? "default" : "secondary"}
              class="capitalize text-xs"
            >
              {props.feed.enabled ? "Active" : "Paused"}
            </Badge>
          </div>
          <div class="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <span class="flex items-center gap-1 truncate max-w-md">
              <IconLink class="h-3.5 w-3.5 shrink-0" />
              <span class="truncate">{props.feed.url}</span>
            </span>
            <Show when={props.feed.last_checked}>
              <span class="flex items-center gap-1 shrink-0">
                <IconClock class="h-3.5 w-3.5" />
                {new Date(props.feed.last_checked!).toLocaleString()}
              </span>
            </Show>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger
            as={Button}
            size="icon"
            variant="ghost"
            class="relative after:absolute after:-inset-2 w-8 h-8 text-muted-foreground hover:text-destructive"
            aria-label="Delete feed"
          >
            <IconTrash class="h-4 w-4" />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete RSS Feed</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "
                {props.feed.name || "this feed"}
                "? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={props.onDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

const AddFeedSchema = v.object({
  anime_id: v.pipe(v.number(), v.minValue(1, "Select an anime")),
  url: v.pipe(v.string(), v.url("Enter a valid URL")),
  name: v.string(),
});

function AddFeedForm(props: { onCancel: () => void; onSuccess: () => void }) {
  const animeListQuery = createAnimeListQuery();
  const addFeed = createAddRssFeedMutation();

  const form = createForm(() => ({
    defaultValues: {
      anime_id: 0,
      url: "",
      name: "",
    },
    validators: {
      onChange: AddFeedSchema,
    },
    onSubmit: async ({ value }) => {
      await addFeed.mutateAsync({
        anime_id: value.anime_id,
        url: value.url,
        name: value.name || undefined,
      });
      props.onSuccess();
    },
  }));

  return (
    <Card class="border-primary/20">
      <CardHeader class="pb-4">
        <CardTitle class="text-base">Add RSS Feed</CardTitle>
        <CardDescription>
          Add a Nyaa or other RSS feed for episode detection
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          class="space-y-4"
        >
          <form.Field name="anime_id">
            {(field) => (
              <div class="space-y-1">
                <label
                  class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  for={field().name}
                >
                  Anime
                </label>
                <Select
                  name={field().name}
                  value={animeListQuery.data
                    ?.map((a) => ({
                      value: a.id,
                      label: a.title.english || a.title.romaji,
                    }))
                    .find((o) => o.value === field().state.value) || null}
                  onChange={(val) => val && field().handleChange(val.value)}
                  options={animeListQuery.data?.map((a) => ({
                    value: a.id,
                    label: a.title.english || a.title.romaji,
                  })) || []}
                  itemComponent={(props) => (
                    <SelectItem item={props.item}>
                      {(props.item.rawValue as { label: string }).label}
                    </SelectItem>
                  )}
                  optionValue="value"
                  optionTextValue="label"
                  placeholder="Select anime..."
                >
                  <SelectTrigger aria-label="Anime" class="w-full">
                    <SelectValue<{ label: string }>>
                      {(state) => state.selectedOption().label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
                <Show when={field().state.meta.errors.length > 0}>
                  <div class="text-[0.8rem] text-destructive">
                    {field().state.meta.errors[0]?.message}
                  </div>
                </Show>
              </div>
            )}
          </form.Field>

          <form.Field name="url">
            {(field) => (
              <TextField
                value={field().state.value}
                onChange={field().handleChange}
                validationState={field().state.meta.errors.length > 0
                  ? "invalid"
                  : "valid"}
              >
                <TextFieldLabel>RSS URL</TextFieldLabel>
                <TextFieldInput placeholder="https://nyaa.si/?page=rss&..." />
                <TextFieldErrorMessage>
                  {field().state.meta.errors[0]?.message}
                </TextFieldErrorMessage>
              </TextField>
            )}
          </form.Field>

          <form.Field name="name">
            {(field) => (
              <TextField
                value={field().state.value}
                onChange={field().handleChange}
              >
                <TextFieldLabel>Name (optional)</TextFieldLabel>
                <TextFieldInput placeholder="e.g., SubsPlease 1080p" />
              </TextField>
            )}
          </form.Field>

          <div class="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={props.onCancel}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {(state) => (
                <Button
                  type="submit"
                  disabled={!state()[0] || addFeed.isPending}
                >
                  {state()[1] || addFeed.isPending ? "Adding..." : "Add Feed"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

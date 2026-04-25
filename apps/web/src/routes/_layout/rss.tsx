import {
  ClockIcon,
  LinkIcon,
  PlusIcon,
  RssIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Schema } from "effect";
import { EmptyState } from "~/components/shared/empty-state";
import { GeneralError } from "~/components/shared/general-error";
import { PageHeader } from "~/app/layout/page-header";
import { formatDateTime } from "~/domain/date-time";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  animeListQueryOptions,
  createAddRssFeedMutation,
  createDeleteRssFeedMutation,
  createToggleRssFeedMutation,
  type RssFeed,
  rssFeedsQueryOptions,
} from "~/api";
import { usePageTitle } from "~/domain/page-title";

export const Route = createFileRoute("/_layout/rss")({
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
  usePageTitle("RSS Feeds");
  const [isAdding, setIsAdding] = useState(false);
  const feeds = useSuspenseQuery(rssFeedsQueryOptions()).data;
  const deleteFeed = createDeleteRssFeedMutation();
  const toggleFeed = createToggleRssFeedMutation();

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-6">
      <PageHeader title="RSS Feeds">
        <Button size="sm" onClick={() => setIsAdding(true)} disabled={isAdding}>
          <PlusIcon className="h-4 w-4" />
          Add Feed
        </Button>
      </PageHeader>

      {isAdding && (
        <AddFeedForm onCancel={() => setIsAdding(false)} onSuccess={() => setIsAdding(false)} />
      )}

      {feeds.length === 0 ? (
        <EmptyState
          icon={<RssIcon className="h-12 w-12" />}
          title="No RSS feeds"
          description="Add RSS feeds to automatically detect new episodes"
          className="border-dashed"
        >
          <Button onClick={() => setIsAdding(true)}>
            <PlusIcon className="h-4 w-4" />
            Add Feed
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {feeds.map((feed) => (
            <FeedCard
              key={feed.id}
              feed={feed}
              onToggle={(enabled) => toggleFeed.mutate({ id: feed.id, enabled })}
              onDelete={() => deleteFeed.mutate(feed.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedCard(props: {
  feed: RssFeed;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <Card className="transition-colors duration-150 hover:bg-muted/50">
      <CardContent className="flex items-center gap-4 p-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => props.onToggle(!props.feed.enabled)}
          aria-label={props.feed.enabled ? "Disable feed" : "Enable feed"}
        >
          {props.feed.enabled ? (
            <ToggleRightIcon className="h-6 w-6 text-success" />
          ) : (
            <ToggleLeftIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{props.feed.name || "Unnamed Feed"}</p>
            <Badge
              variant={props.feed.enabled ? "default" : "secondary"}
              className="capitalize text-xs"
            >
              {props.feed.enabled ? "Active" : "Paused"}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1 truncate max-w-md">
              <LinkIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{props.feed.url}</span>
            </span>
            {props.feed.last_checked && (
              <span className="flex items-center gap-1 shrink-0">
                <ClockIcon className="h-3.5 w-3.5" />
                {formatDateTime(props.feed.last_checked)}
              </span>
            )}
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button size="icon" variant="ghost" />}
            className="relative after:absolute after:-inset-2 w-8 h-8 text-muted-foreground hover:text-destructive"
            aria-label="Delete feed"
          >
            <TrashIcon className="h-4 w-4" />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete RSS Feed</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{props.feed.name || "this feed"}
                &quot;? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={props.onDelete}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

const AddFeedSchema = Schema.Struct({
  anime_id: Schema.Number.pipe(Schema.greaterThan(0, { message: () => "Select an anime" })),
  url: Schema.String.pipe(Schema.pattern(/^https?:\/\/.+/, { message: () => "Enter a valid URL" })),
  name: Schema.String,
});

function AddFeedForm(props: { onCancel: () => void; onSuccess: () => void }) {
  const { data: animeList } = useSuspenseQuery(animeListQueryOptions());
  const addFeed = createAddRssFeedMutation();

  const form = useForm({
    defaultValues: {
      anime_id: 0,
      url: "",
      name: "",
    },
    validators: {
      onChange: Schema.standardSchemaV1(AddFeedSchema),
    },
    onSubmit: async ({ value }) => {
      await addFeed.mutateAsync({
        anime_id: value.anime_id,
        url: value.url,
        name: value.name || undefined,
      });
      props.onSuccess();
    },
  });

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Add RSS Feed</CardTitle>
        <CardDescription>Add a Nyaa or other RSS feed for episode detection</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={() => form.handleSubmit()} className="space-y-4">
          <form.Field name="anime_id">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor={field.name}>Anime</Label>
                <Select
                  value={field.state.value > 0 ? String(field.state.value) : undefined}
                  onValueChange={(value) => field.handleChange(Number(value))}
                >
                  <SelectTrigger id={field.name} aria-label="Anime" className="w-full">
                    <SelectValue placeholder="Select anime..." />
                  </SelectTrigger>
                  <SelectContent>
                    {animeList.map((anime) => (
                      <SelectItem key={anime.id} value={String(anime.id)}>
                        {anime.title.english || anime.title.romaji}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field.state.meta.errors.length > 0 && (
                  <div className="text-[0.8rem] text-destructive">
                    {field.state.meta.errors[0]?.message}
                  </div>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="url">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="rss-url">RSS URL</Label>
                <Input
                  id="rss-url"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  placeholder="https://nyaa.si/?page=rss&..."
                />
                {field.state.meta.errors[0]?.message && (
                  <div className="text-[0.8rem] text-destructive">
                    {field.state.meta.errors[0]?.message}
                  </div>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="name">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor="rss-name">Name (optional)</Label>
                <Input
                  id="rss-name"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  placeholder="e.g., SubsPlease 1080p"
                />
              </div>
            )}
          </form.Field>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={props.onCancel}>
              Cancel
            </Button>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {(state) => (
                <Button type="submit" disabled={!state[0] || addFeed.isPending}>
                  {state[1] || addFeed.isPending ? "Adding..." : "Add Feed"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

import { RiAddLine, RiRssLine } from "@remixicon/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralError } from "@/components/shared/general-error";
import { PageHeader } from "@/app/layout/page-header";
import { PageShell } from "@/app/layout/page-shell";
import { Button } from "@/components/ui/button";
import { FeedCard } from "@/features/rss/feed-card";
import { AddFeedForm } from "@/features/rss/add-feed-form";
import {
  useDeleteRssFeedMutation,
  useToggleRssFeedMutation,
  rssFeedsQueryOptions,
} from "@/api/system-rss-calendar";
import { mediaListQueryOptions } from "@/api/media";
import { usePageTitle } from "@/app/page-title";

export const Route = createFileRoute("/_layout/rss")({
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(rssFeedsQueryOptions()),
      queryClient.ensureQueryData(mediaListQueryOptions()),
    ]);
  },
  component: RssPage,
  errorComponent: GeneralError,
});

function RssPage() {
  usePageTitle("RSS Feeds");
  const [isAdding, setIsAdding] = useState(false);
  const feeds = useSuspenseQuery(rssFeedsQueryOptions()).data;
  const deleteFeed = useDeleteRssFeedMutation();
  const toggleFeed = useToggleRssFeedMutation();

  return (
    <PageShell>
      <PageHeader title="RSS Feeds">
        <Button size="sm" onPress={() => setIsAdding(true)} isDisabled={isAdding}>
          <RiAddLine className="h-4 w-4" />
          Add Feed
        </Button>
      </PageHeader>

      {isAdding && (
        <AddFeedForm onCancel={() => setIsAdding(false)} onSuccess={() => setIsAdding(false)} />
      )}

      {feeds.length === 0 ? (
        <EmptyState
          icon={<RiRssLine className="h-12 w-12" />}
          title="No RSS feeds"
          description="Add RSS feeds to automatically detect new episodes"
          className="border-dashed"
        >
          <Button onPress={() => setIsAdding(true)}>
            <RiAddLine className="h-4 w-4" />
            Add Feed
          </Button>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
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
    </PageShell>
  );
}

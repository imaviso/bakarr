import { useForm } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Schema } from "effect";
import { brandMediaId } from "@bakarr/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/shared/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mediaListQueryOptions } from "@/api/media";
import { useAddRssFeedMutation } from "@/api/system-rss-calendar";

const AddFeedSchema = Schema.Struct({
  media_id: Schema.Number.pipe(Schema.greaterThan(0, { message: () => "Select an anime" })),
  url: Schema.String.pipe(Schema.pattern(/^https?:\/\/.+/, { message: () => "Enter a valid URL" })),
  name: Schema.String,
});

export function AddFeedForm(props: { onCancel: () => void; onSuccess: () => void }) {
  const { data: animeList } = useSuspenseQuery(mediaListQueryOptions());
  const addFeed = useAddRssFeedMutation();

  const form = useForm({
    defaultValues: {
      media_id: 0,
      url: "",
      name: "",
    },
    validators: {
      onChange: Schema.standardSchemaV1(AddFeedSchema),
    },
    onSubmit: async ({ value }) => {
      await addFeed.mutateAsync({
        media_id: brandMediaId(value.media_id),
        url: value.url,
        name: value.name || undefined,
      });
      props.onSuccess();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add RSS Feed</CardTitle>
        <CardDescription>Add a Nyaa or other RSS feed for episode detection</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={() => form.handleSubmit()} className="space-y-4">
          <form.Field name="media_id">
            {(field) => (
              <div className="space-y-1">
                <Label htmlFor={field.name}>Media</Label>
                <Select
                  {...(field.state.value > 0 ? { selectedKey: String(field.state.value) } : {})}
                  onSelectionChange={(value) => field.handleChange(Number(value))}
                >
                  <SelectTrigger id={field.name} aria-label="Media" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {animeList.map((media) => (
                      <SelectItem key={media.id} id={String(media.id)} textValue={String(media.id)}>
                        {media.title.english || media.title.romaji}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError error={field.state.meta.errors[0]?.message} />
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
                <FieldError error={field.state.meta.errors[0]?.message} />
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
            <Button type="button" variant="ghost" onPress={props.onCancel}>
              Cancel
            </Button>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {(state) => (
                <Button type="submit" isDisabled={!state[0] || addFeed.isPending}>
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

import { IconPencil } from "@tabler/icons-solidjs";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

interface AnimeDetailsMetaProps {
  totalEpisodes: number;
  downloadedEpisodes: number;
  missingEpisodes: number;
  profileName: string;
  rootFolder: string;
  addedAt: string;
  onEditProfile: () => void;
  onEditPath: () => void;
}

export function AnimeDetailsMeta(props: AnimeDetailsMetaProps) {
  return (
    <>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent class="p-4 text-center">
            <p class="text-2xl font-bold">{props.totalEpisodes}</p>
            <p class="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4 text-center">
            <p class="text-2xl font-bold text-success">{props.downloadedEpisodes}</p>
            <p class="text-xs text-muted-foreground">Downloaded</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4 text-center">
            <p class="text-2xl font-bold text-warning">{props.missingEpisodes}</p>
            <p class="text-xs text-muted-foreground">Missing</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4 text-center flex flex-col items-center justify-center h-full">
            <Button
              variant="ghost"
              onClick={props.onEditProfile}
              class="h-auto py-1.5 px-3 text-base font-bold gap-2 hover:bg-muted max-w-full"
            >
              <span class="truncate">{props.profileName}</span>
              <IconPencil class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </Button>
            <p class="text-xs text-muted-foreground mt-1">Profile</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt class="text-muted-foreground">Root Folder</dt>
              <dd class="font-mono text-xs mt-1 truncate flex items-center justify-between gap-2 group">
                <span class="truncate" title={props.rootFolder}>
                  {props.rootFolder}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={props.onEditPath}
                  aria-label="Edit path"
                >
                  <IconPencil class="h-3 w-3" />
                </Button>
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Added</dt>
              <dd class="mt-1">{new Date(props.addedAt).toLocaleDateString()}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </>
  );
}

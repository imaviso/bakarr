import { PencilSimpleIcon } from "@phosphor-icons/react";
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{props.totalEpisodes}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-success">{props.downloadedEpisodes}</p>
            <p className="text-xs text-muted-foreground">Downloaded</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-warning">{props.missingEpisodes}</p>
            <p className="text-xs text-muted-foreground">Missing</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center flex flex-col items-center justify-center h-full">
            <Button
              variant="ghost"
              onClick={props.onEditProfile}
              className="h-auto py-1.5 px-3 text-base font-bold gap-2 hover:bg-muted max-w-full"
            >
              <span className="truncate">{props.profileName}</span>
              <PencilSimpleIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </Button>
            <p className="text-xs text-muted-foreground mt-1">Profile</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Root Folder</dt>
              <dd className="font-mono text-xs mt-1 truncate flex items-center justify-between gap-2 group">
                <span className="truncate" title={props.rootFolder}>
                  {props.rootFolder}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={props.onEditPath}
                  aria-label="Edit path"
                >
                  <PencilSimpleIcon className="h-3 w-3" />
                </Button>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Added</dt>
              <dd className="mt-1">{new Date(props.addedAt).toLocaleDateString()}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </>
  );
}

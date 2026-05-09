import { PencilSimpleIcon } from "@phosphor-icons/react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { formatDate } from "~/domain/date-time";

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

function StatItem(props: { label: string; value: number | string; tone?: "success" | "warning" }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className={`text-xl font-medium tabular-nums ${
          props.tone === "success"
            ? "text-success"
            : props.tone === "warning"
              ? "text-warning"
              : "text-foreground"
        }`}
      >
        {props.value}
      </span>
      <span className="text-xs text-muted-foreground">{props.label}</span>
    </div>
  );
}

export function AnimeDetailsMeta(props: AnimeDetailsMetaProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border pb-4">
        <StatItem label="Total" value={props.totalEpisodes} />
        <StatItem label="Downloaded" value={props.downloadedEpisodes} tone="success" />
        <StatItem label="Missing" value={props.missingEpisodes} tone="warning" />
        <Separator orientation="vertical" className="h-6 hidden sm:block" />
        <Button
          variant="ghost"
          onClick={props.onEditProfile}
          className="h-auto py-1 px-2 text-base font-bold gap-2 hover:bg-muted"
        >
          <span className="truncate">{props.profileName}</span>
          <PencilSimpleIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground font-normal">Profile</span>
        </Button>
      </div>

      <Card>
        <CardHeader>
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
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={props.onEditPath}
                  aria-label="Edit path"
                >
                  <PencilSimpleIcon className="h-3.5 w-3.5" />
                </Button>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Added</dt>
              <dd className="mt-1">{formatDate(props.addedAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </>
  );
}

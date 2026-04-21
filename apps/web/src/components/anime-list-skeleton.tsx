import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

export function AnimeListSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((card) => (
        <Card key={card} className="overflow-hidden">
          <Skeleton className="aspect-[2/3] w-full" />
          <div className="p-3 flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <div className="flex items-center justify-between gap-2 mt-auto">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-1.5 w-1.5 rounded-none" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

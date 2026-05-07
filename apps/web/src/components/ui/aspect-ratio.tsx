import { cn } from "@/infra/utils";

type CSSVariables = React.CSSProperties & Record<`--${string}`, string | number | undefined>;

function AspectRatio({
  ratio,
  className,
  ...props
}: React.ComponentProps<"div"> & { ratio: number }) {
  const style: CSSVariables = { "--ratio": ratio };

  return (
    <div
      data-slot="aspect-ratio"
      style={style}
      className={cn("relative aspect-(--ratio)", className)}
      {...props}
    />
  );
}

export { AspectRatio };

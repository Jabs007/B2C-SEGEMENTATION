import { useQuery } from "@tanstack/react-query";
import { trpc } from "@renderer/lib/trpc";
import { SegmentBar } from "./SegmentBar";

interface Props {
  className?: string;
}

export function SegmentDistribution({ className }: Props) {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["segments.distribution"],
    queryFn: () => trpc.segments.distribution.query(),
    refetchInterval: 30_000,
  });

  const total = data.reduce((s, r) => s + r.count, 0);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading segments…</p>;
  if (error) return <p className="text-sm text-destructive">Failed to load distribution</p>;
  if (total === 0) return <p className="text-sm text-muted-foreground">No data yet</p>;

  return (
    <div className={className}>
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Customer Segments</h3>
      <div className="space-y-2">
        {data.map((row) => (
          <SegmentBar
            key={row.segment}
            label={row.segment}
            count={row.count}
            total={total}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3">Total: {total.toLocaleString()} customers</p>
    </div>
  );
}

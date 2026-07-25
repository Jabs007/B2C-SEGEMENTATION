import { SEGMENT_CONFIG, type SegmentName } from "@shared/segments";

interface Props {
  label: SegmentName;
  count: number;
  total: number;
}

export function SegmentBar({ label, count, total }: Props) {
  const cfg = SEGMENT_CONFIG[label];
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm w-5 text-center">{cfg.icon}</span>
      <span className="text-sm font-medium w-20 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: cfg.color }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-10 text-right">{count}</span>
    </div>
  );
}

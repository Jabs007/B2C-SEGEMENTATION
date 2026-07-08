import { SEGMENT_CONFIG, type SegmentName } from "@shared/segments";

interface Props {
  segment: SegmentName;
  confidence: number;
}

export const SegmentBadge = ({ segment, confidence }: Props) => {
  const cfg = SEGMENT_CONFIG[segment];
  const pct = Math.round(confidence * 100);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border"
      style={{
        backgroundColor: cfg.bgColor,
        borderColor: cfg.borderColor,
        color: cfg.color,
      }}
      title={`${segment} · ${pct}% confidence`}
    >
      <span className="text-sm leading-none">{cfg.icon}</span>
      <span>{segment}</span>
      <span className="opacity-75">{pct}%</span>
    </span>
  );
};

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip
} from "recharts";
import { SEGMENT_CONFIG, SEGMENT_ORDER, type SegmentName } from "../../../shared/segments";

function normalizeValue(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return Math.round(((value - min) / (max - min)) * 100);
}

function SegmentRadar({ segment, allSegments }: { segment: any; allSegments: any[] }) {
  const name = segment.segmentName as SegmentName;
  const config = SEGMENT_CONFIG[name];

  // Normalize metrics across all segments for radar chart
  const metrics = [
    { key: 'recency', label: 'Recency', invert: true },
    { key: 'frequency', label: 'Frequency', invert: false },
    { key: 'monetary', label: 'Monetary', invert: false },
    { key: 'aov', label: 'AOV', invert: false },
    { key: 'count', label: 'Size', invert: false },
  ];

  const radarData = metrics.map(m => {
    const values = allSegments.map(s => Number(s[m.key]) || 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    let normalized = normalizeValue(Number(segment[m.key]) || 0, min, max);
    if (m.invert) normalized = 100 - normalized;
    return { subject: m.label, value: normalized, fullMark: 100 };
  });

  return (
    <Card
      className="glass-card border transition-all duration-200 hover:scale-[1.01]"
      style={{ borderColor: config.borderColor }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{config.icon}</span>
            <CardTitle className="text-lg font-bold" style={{ color: config.color }}>
              {name}
            </CardTitle>
          </div>
          <Badge
            variant="outline"
            className="text-xs"
            style={{ color: config.color, borderColor: config.borderColor }}
          >
            {segment.count?.toLocaleString()} customers
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Radar Chart */}
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
                tick={{ fill: '#64748b', fontSize: 9 }}
                tickCount={4}
              />
              <Radar
                name={name}
                dataKey="value"
                stroke={config.color}
                fill={config.color}
                fillOpacity={0.15}
                strokeWidth={2}
              />
              <Tooltip
                formatter={(value: any) => [`${value}/100`, 'Score']}
                contentStyle={{
                  backgroundColor: '#1e1e2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Avg Recency', value: `${segment.avgRecency ?? 0}d`, hint: 'Days since last purchase' },
            { label: 'Avg Frequency', value: `${segment.avgFrequency ?? 0}x`, hint: 'Purchases per customer' },
            { label: 'Avg Monetary', value: `KES ${(segment.avgMonetary ?? 0).toLocaleString()}`, hint: 'Mean total spend' },
            { label: 'Revenue Share', value: `${segment.revenueShare ?? 0}%`, hint: 'Of total revenue' },
          ].map(m => (
            <div
              key={m.label}
              className="rounded-lg p-3"
              style={{ backgroundColor: config.bgColor }}
            >
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="text-sm font-bold text-foreground mt-0.5">{m.value}</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">{m.hint}</p>
            </div>
          ))}
        </div>

        {/* Description */}
        <div className="rounded-lg p-3 border border-border/30 bg-muted/20">
          <p className="text-xs text-muted-foreground leading-relaxed mb-2">{config.description}</p>
          <div className="border-t border-border/30 pt-2 mt-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Strategy</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{config.strategy}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SegmentProfiles() {
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();

  const orderedSegments = stats?.segments
    ? SEGMENT_ORDER
        .map(name => stats.segments.find((s: any) => s.segmentName === name))
        .filter(Boolean)
    : [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Segment Profiles</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Detailed RFM radar charts and business-friendly profiles for each customer segment
        </p>
      </div>

      {/* Summary Bar */}
      {!isLoading && stats && (
        <Card className="glass-card border-border/40">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-6">
              {orderedSegments.map((s: any) => {
                const config = SEGMENT_CONFIG[s.segmentName as SegmentName];
                return (
                  <div key={s.segmentName} className="flex items-center gap-2">
                    <span className="text-sm">{config.icon}</span>
                    <span className="text-sm font-medium" style={{ color: config.color }}>{s.segmentName}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.count.toLocaleString()} ({s.percentage}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Segment Cards */}
{!isLoading && stats && stats.totalCustomers===0 ? (
          <Card className="glass-card border-dashed border-border/40">
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">No data yet — upload your CSVs to get started.</p>
              <Link href="/upload">
                <Button className="mt-2">Go to Data Upload</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i} className="glass-card border-border/40">
                    <CardContent className="p-6">
                      <Skeleton className="h-6 w-32 mb-4" />
                      <Skeleton className="h-48 w-full mb-4" />
                      <div className="grid grid-cols-2 gap-3">
                        {Array.from({ length: 4 }).map((_, j) => (
                          <Skeleton key={j} className="h-16 w-full rounded-lg" />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              : orderedSegments.map((s: any) => (
                  <SegmentRadar key={s.segmentName} segment={s} allSegments={orderedSegments} />
                ))}
          </div>
        )}
    </div>
  );
}

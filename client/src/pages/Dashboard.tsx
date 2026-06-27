import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, TrendingUp, ShoppingCart, Activity, ArrowUpRight } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { SEGMENT_CONFIG, SEGMENT_ORDER, type SegmentName } from "../../../shared/segments";
import { Link } from "wouter";

function KpiCard({ title, value, subtitle, icon: Icon, trend }: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  trend?: string;
}) {
  return (
    <Card className="glass-card glow-indigo border-border/40">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 ml-3">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
        {trend && (
          <div className="flex items-center gap-1 mt-3 text-xs text-emerald-400">
            <ArrowUpRight className="w-3 h-3" />
            <span>{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SegmentCard({ segment }: { segment: any }) {
  const name = segment.segmentName as SegmentName;
  const config = SEGMENT_CONFIG[name];
  if (!config) return null;

  return (
    <Link href="/segments">
      <Card
        className="glass-card cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:border-opacity-60"
        style={{ borderColor: config.borderColor }}
      >
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">{config.icon}</span>
              <span className="font-semibold text-foreground">{name}</span>
            </div>
            <Badge
              variant="outline"
              className="text-xs"
              style={{ color: config.color, borderColor: config.borderColor }}
            >
              {segment.percentage}%
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Customers</p>
              <p className="text-lg font-bold text-foreground">{segment.count.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Revenue Share</p>
              <p className="text-lg font-bold" style={{ color: config.color }}>{segment.revenueShare}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Recency</p>
              <p className="text-sm font-medium text-foreground">{segment.avgRecency}d</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Monetary</p>
              <p className="text-sm font-medium text-foreground">KES {segment.avgMonetary.toLocaleString()}</p>
            </div>
          </div>

          <div className="mt-4 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${segment.percentage}%`, backgroundColor: config.color }}
            />
          </div>

          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{config.description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

const CUSTOM_TOOLTIP = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0];
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-sm">
        <p className="font-medium text-foreground">{d.name}</p>
        <p className="text-muted-foreground">{d.value.toLocaleString()} customers</p>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();

  const orderedSegments = stats?.segments
    ? SEGMENT_ORDER
        .map(name => stats.segments.find((s: any) => s.segmentName === name))
        .filter(Boolean)
    : [];

  const pieData = orderedSegments.map((s: any) => ({
    name: s.segmentName,
    value: s.count,
    color: SEGMENT_CONFIG[s.segmentName as SegmentName]?.color ?? '#888',
  }));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Segment Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            B2C customer segmentation dashboard — K-Means model
          </p>
        </div>
        {stats?.lastPipelineRun && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Last run: {new Date(stats.lastPipelineRun.startedAt).toLocaleDateString()}
          </Badge>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="glass-card">
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-32 mb-1" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <KpiCard
              title="Total Customers"
              value={stats?.totalCustomers.toLocaleString() ?? '—'}
              subtitle="Across all segments"
              icon={Users}
              trend="Active customer base"
            />
            <KpiCard
              title="Total Revenue"
              value={`KES ${((stats?.totalRevenue ?? 0) / 1000).toFixed(0)}K`}
              subtitle="Sum of all monetary values"
              icon={TrendingUp}
            />
            <KpiCard
              title="Avg Order Value"
              value={`KES ${stats?.avgOrderValue.toLocaleString() ?? '—'}`}
              subtitle="Mean across all customers"
              icon={ShoppingCart}
            />
            <KpiCard
              title="Active Segments"
              value="4"
              subtitle="Champions · Loyal · At Risk · Regulars"
              icon={Activity}
            />
          </>
        )}
      </div>

      {/* Segment Cards + Pie Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="glass-card">
                  <CardContent className="p-6">
                    <Skeleton className="h-5 w-32 mb-4" />
                    <div className="grid grid-cols-2 gap-3">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <div key={j}>
                          <Skeleton className="h-3 w-16 mb-1" />
                          <Skeleton className="h-6 w-20" />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            : orderedSegments.map((s: any) => (
                <SegmentCard key={s.segmentName} segment={s} />
              ))}
        </div>
        )}
        {/* Pie Chart */}
        <Card className="glass-card border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Customer Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Skeleton className="w-40 h-40 rounded-full" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip content={<CUSTOM_TOOLTIP />} />
                  <Legend
                    formatter={(value) => (
                      <span className="text-xs text-muted-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { href: '/predict', label: 'Predict Segment', desc: 'Score a new customer', icon: '🎯' },
          { href: '/explorer', label: 'Explore Customers', desc: 'Browse all 7,551 records', icon: '🔍' },
          { href: '/pipeline', label: 'Run Pipeline', desc: 'Trigger re-segmentation', icon: '⚙️' },
        ].map(item => (
          <Link key={item.href} href={item.href}>
            <Card className="glass-card border-border/40 cursor-pointer hover:border-primary/30 transition-all duration-200 hover:scale-[1.01]">
              <CardContent className="p-4 flex items-center gap-3">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <p className="font-medium text-foreground text-sm">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground ml-auto" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

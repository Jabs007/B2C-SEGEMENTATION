import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Filter, Download, Users } from "lucide-react";
import { toast } from "sonner";

type Segment = 'Champions' | 'Loyal' | 'At Risk' | 'Regulars';

const SEGMENT_CONFIG: Record<Segment, { color: string; bg: string }> = { Champions: { color: 'text-amber-300', bg: 'bg-amber-400/10' }, Loyal: { color: 'text-emerald-300', bg: 'bg-emerald-400/10' }, 'At Risk': { color: 'text-red-300', bg: 'bg-red-400/10' }, Regulars: { color: 'text-sky-300', bg: 'bg-sky-400/10' } };

function SegmentLabel({ name, withArrow = false }: { name: string; withArrow?: boolean }) {
  const cfg = SEGMENT_CONFIG[name as Segment];
  if (!cfg) return <span className="text-xs text-muted-foreground">{name}</span>;
  return <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium " + cfg.bg + " " + cfg.color}>{name}{withArrow && <ArrowRight className="w-3 h-3" />}</span>;
}

function Heatmap({ matrix }: { matrix: Record<string, Record<string, number>> }) {
  const fromSegs = Object.keys(matrix);
  const toSegs = fromSegs.length ? Object.keys(matrix[fromSegs[0]]) : [];
  const max = Math.max(1, ...fromSegs.flatMap(f => toSegs.map(t => matrix[f]?.[t] ?? 0)));
  return (
    <Card className="glass-card border-border/40">
      <CardHeader><CardTitle className="text-base">Migration Matrix</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr><th className="py-2 px-3 text-left text-muted-foreground font-medium">From \ To</th>{toSegs.map(t => <th key={t} className="py-2 px-3 text-center text-muted-foreground font-medium">{t}</th>)}</tr></thead>
            <tbody>{fromSegs.map(f => <tr key={f}><td className="py-2 px-3 font-medium text-foreground">{f}</td>{toSegs.map(t => { const v = matrix[f]?.[t] ?? 0; const intensity = Math.round((v / max) * 100); return <td key={t} className="py-2 px-3"><div className="rounded-md py-2 text-center font-mono" style={{ backgroundColor: "rgba(99,102,241," + (intensity / 100) + ")", color: intensity > 40 ? '#fff' : '#94a3b8' }}>{v}</div></td>; })}</tr>)}</tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SegmentMigrations() {
  const [filterTo, setFilterTo] = useState<string>('all');
const { data: recent = [], isLoading: recentLoading } = trpc.migrations.getRecent.useQuery({ limit: 50 });
const { data: matrix = {} } = trpc.migrations.getMatrix.useQuery();
  const filtered = filterTo === 'all' ? recent : recent.filter((r: any) => r.toSegment === filterTo);

  const handleExport = () => {
    const rows = filtered.map((r: any) => [r.customerId, r.fromSegment ?? '', r.toSegment, new Date(r.migrationDate).toISOString()]);
    const csv = [['customerId', 'fromSegment', 'toSegment', 'migrationDate'], ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'segment-migrations.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Segment Migrations</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Track customer movement between segments over time</p>
        </div>
        <Button size="sm" variant="outline" className="border-white/10" onClick={handleExport} disabled={!filtered.length}><Download className="w-3.5 h-3.5 mr-1.5" />Export CSV</Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Heatmap matrix={matrix} />
        <Card className="glass-card border-border/40">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Filter className="w-4 h-4 text-primary" />Filter Migrations</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Show customers who moved TO</Label>
              <Select value={filterTo} onValueChange={setFilterTo}><SelectTrigger className="bg-white/[0.03] border-white/10"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All segments</SelectItem><SelectItem value="Champions">Champions</SelectItem><SelectItem value="Loyal">Loyal</SelectItem><SelectItem value="At Risk">At Risk</SelectItem><SelectItem value="Regulars">Regulars</SelectItem></SelectContent></Select>
            </div>
            <Separator className="bg-white/5" />
            <div className="space-y-1"><p className="text-xs text-muted-foreground">Recent migrations</p>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {recentLoading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                  : filtered.length === 0 ? <p className="text-xs text-muted-foreground py-4 text-center">No migrations recorded yet. Run the pipeline multiple times to track segment changes.</p>
                  : filtered.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-2 min-w-0"><Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="font-mono text-xs truncate">{r.customerId}</span></div>
                      <div className="flex items-center gap-1.5"><SegmentLabel name={r.fromSegment ?? '—'} /><ArrowRight className="w-3 h-3 text-muted-foreground" /><SegmentLabel name={r.toSegment} /></div>
                      <span className="text-[10px] text-muted-foreground ml-2 shrink-0">{new Date(r.migrationDate).toLocaleDateString()}</span>
                    </div>
                  ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

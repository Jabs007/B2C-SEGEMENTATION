import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Download } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { SEGMENT_CONFIG, SEGMENT_ORDER, type SegmentName } from "../../../shared/segments";

const PAGE_SIZE = 20;

type SortDir = 'asc' | 'desc';

export default function Explorer() {
  const [page, setPage] = useState(1);
  const [segment, setSegment] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('monetary');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data, isLoading } = trpc.customers.list.useQuery({
    page, pageSize: PAGE_SIZE,
    segment: segment === 'all' ? undefined : segment,
    search: search || undefined,
    sortBy, sortDir,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  const handleSearch = () => { setSearch(searchInput); setPage(1); };
  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
    setPage(1);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 text-muted-foreground" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-primary" />
      : <ArrowDown className="w-3 h-3 text-primary" />;
  };

  const columns = [
    { key: 'customerId', label: 'Customer ID', sortable: false },
    { key: 'segmentName', label: 'Segment', sortable: false },
    { key: 'recency', label: 'Recency (d)', sortable: true },
    { key: 'frequency', label: 'Frequency', sortable: true },
    { key: 'monetary', label: 'Monetary (KES)', sortable: true },
    { key: 'aov', label: 'AOV (KES)', sortable: true },
    { key: 'categoryBreadth', label: 'Categories', sortable: true },
    { key: 'latePaymentRate', label: 'Late Pay %', sortable: true },
    { key: 'region', label: 'Region', sortable: false },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Segment Explorer</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Browse, filter, and sort all {data?.total.toLocaleString() ?? '7,551'} customers with their RFM scores and segment assignments
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-white/10"
          onClick={() => {
            if (!data?.data?.length) return toast.error("No data to export");
            const headers = Object.keys(data.data[0]);
            const csv = [headers.join(","), ...data.data.map((r: any) => headers.map(h => r[h] ?? "").join(","))].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "customers.csv";
            a.click();
            URL.revokeObjectURL(url);
            toast.success("Exported " + data.data.length + " rows");
          }}
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card className="glass-card border-border/40">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Search */}
            <div className="flex gap-2 flex-1 min-w-[200px]">
              <Input
                placeholder="Search by Customer ID..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="bg-muted/50 border-border/60 text-foreground"
              />
              <Button variant="outline" size="icon" onClick={handleSearch}>
                <Search className="w-4 h-4" />
              </Button>
            </div>

            {/* Segment filter */}
            <Select value={segment} onValueChange={setSegment}>
              <SelectTrigger className="w-48 bg-muted/50 border-border/60 text-foreground">
                <SelectValue placeholder="All segments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All segments</SelectItem>
                {SEGMENT_ORDER.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="glass-card border-border/40 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground uppercase tracking-wider">
                  {columns.map(col => (
                    <th key={col.key} className={`py-3 px-4 font-medium ${col.sortable ? 'cursor-pointer hover:text-foreground transition-colors' : ''}`} onClick={() => col.sortable && handleSort(col.key)}>
                      <div className="flex items-center gap-1">
                        {col.label}
                        {col.sortable && <SortIcon col={col.key} />}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <tr key={i} className="border-b border-border/30">
                      {columns.map(col => (
                        <td key={col.key} className="py-3 px-4"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : data?.data?.length === 0 ? (
                  <tr><td colSpan={columns.length} className="py-8 text-center text-xs text-muted-foreground">No customers found matching your filters.</td></tr>
                ) : (
                  data?.data?.map((row: any) => {
                    const seg = row.segmentName as SegmentName;
                    const config = SEGMENT_CONFIG[seg];
                    return (
                      <tr key={row.id} className="border-b border-border/30 hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-4">
                          <Link href={`/explorer?id=${row.customerId}`} className="font-mono text-xs text-primary hover:underline">
                            {row.customerId}
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          {config ? (
                            <Badge style={{ backgroundColor: config.bgColor, color: config.textColor, borderColor: config.borderColor }} className="text-[10px]">
                              {seg}
                            </Badge>
                          ) : (
                            <span className="text-xs">{seg}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">{row.recency}</td>
                        <td className="py-3 px-4 font-mono text-xs">{row.frequency}</td>
                        <td className="py-3 px-4 font-mono text-xs">{row.monetary}</td>
                        <td className="py-3 px-4 font-mono text-xs">{row.aov}</td>
                        <td className="py-3 px-4 text-xs">{row.categoryBreadth}</td>
                        <td className="py-3 px-4">
                          <span className={`text-xs ${(row.latePaymentRate ?? 0) > 0.3 ? 'text-red-400' : 'text-muted-foreground'}`}>
                            {((row.latePaymentRate ?? 0) * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{row.region}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {data?.total.toLocaleString() ?? '0'} total customers
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage(p => p - 1)}
            className="border-white/10"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage(p => p + 1)}
            className="border-white/10"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

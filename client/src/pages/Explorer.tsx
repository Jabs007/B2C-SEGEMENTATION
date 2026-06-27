import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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
    page,
    pageSize: PAGE_SIZE,
    segment: segment === 'all' ? undefined : segment,
    search: search || undefined,
    sortBy,
    sortDir,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
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
      <div>
        <h1 className="text-2xl font-bold text-foreground">Segment Explorer</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Browse, filter, and sort all {data?.total.toLocaleString() ?? '7,551'} customers with their RFM scores and segment assignments
        </p>
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

            {/* Segment Filter */}
            <Select value={segment} onValueChange={v => { setSegment(v); setPage(1); }}>
              <SelectTrigger className="w-44 bg-muted/50 border-border/60">
                <SelectValue placeholder="All Segments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Segments</SelectItem>
                {SEGMENT_ORDER.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Results count */}
            {data && (
              <span className="text-xs text-muted-foreground ml-auto">
                {data.total.toLocaleString()} results
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="glass-card border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap ${col.sortable ? 'cursor-pointer hover:text-foreground select-none' : ''}`}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.label}
                      {col.sortable && <SortIcon col={col.key} />}
</div>{!isLoading && (!data || data.total===0) && (
  <div className="p-6 text-center text-sm text-muted-foreground">
    No customers found. Upload data and run the pipeline.
    <Link href="/upload">
      <Button className="mt-2">Go to Data Upload</Button>
    </Link>
  </div>
)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <tr key={i} className="border-b border-border/20">
                      {columns.map(col => (
                        <td key={col.key} className="px-4 py-3">
                          <Skeleton className="h-4 w-16" />
                        </td>
                      ))}
                    </tr>
                  ))
                : data?.data.map((customer: any) => {
                    const config = SEGMENT_CONFIG[customer.segmentName as SegmentName];
                    return (
                      <tr
                        key={customer.customerId}
                        className="border-b border-border/20 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {customer.customerId}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className="text-xs whitespace-nowrap"
                            style={{ color: config?.color, borderColor: config?.borderColor }}
                          >
                            {config?.icon} {customer.segmentName}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-foreground tabular-nums">
                          {customer.recency ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-foreground tabular-nums">
                          {customer.frequency ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-foreground tabular-nums">
                          {customer.monetary != null ? customer.monetary.toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-foreground tabular-nums">
                          {customer.aov != null ? customer.aov.toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-foreground tabular-nums">
                          {customer.categoryBreadth ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-foreground tabular-nums">
                          {customer.latePaymentRate != null
                            ? `${(customer.latePaymentRate * 100).toFixed(0)}%`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {customer.region ?? 'Unknown'}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/30 bg-muted/10">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isLoading}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

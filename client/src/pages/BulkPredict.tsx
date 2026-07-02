import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload,
  Download,
  Sparkles,
  FileSpreadsheet,
  Wand2,
  ArrowLeft,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { SEGMENT_CONFIG, type SegmentName } from "../../../shared/segments";

interface BulkRow {
  rowIndex: number;
  recency: number;
  frequency: number;
  monetary: number;
  aov: number;
  tenure: number;
  predictedSegment: "Champions" | "Loyal" | "At Risk" | "Regulars" | "Unknown";
  confidence: number;
  distanceToCentroid: number;
  error: string | null;
}

function SegmentBadge({ segment }: { segment: BulkRow["predictedSegment"] }) {
  const config = SEGMENT_CONFIG[segment as SegmentName];
  if (!config || segment === "Unknown")
    return (
      <Badge variant="outline" className="border-white/10 text-muted-foreground">
        Unknown
      </Badge>
    );
  return (
    <Badge
      style={{
        backgroundColor: config.bgColor,
        color: config.textColor,
        borderColor: config.borderColor,
      }}
    >
      {segment}
    </Badge>
  );
}

function ResultsTable({
  rows,
  onClear,
}: {
  rows: BulkRow[];
  onClear: () => void;
}) {
  if (!rows.length) return null;
  return (
    <Card className="glass-card border-border/40 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base font-semibold text-foreground">
            Results
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {rows.length} rows processed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-white/10"
            onClick={() => {
              const headers = [
                "rowIndex",
                "recency",
                "frequency",
                "monetary",
                "aov",
                "tenure",
                "predictedSegment",
                "confidence",
                "distanceToCentroid",
              ];
              const csv = [headers.join(",")];
              for (const r of rows)
                csv.push(
                  [
                    r.rowIndex,
                    r.recency,
                    r.frequency,
                    r.monetary,
                    r.aov,
                    r.tenure,
                    r.predictedSegment,
                    r.confidence,
                    r.distanceToCentroid,
                  ].join(",")
                );
              const blob = new Blob([csv.join("\n")], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "bulk-predictions.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="py-3 px-4 font-medium">#</th>
                <th className="py-3 px-4 font-medium">Recency</th>
                <th className="py-3 px-4 font-medium">Frequency</th>
                <th className="py-3 px-4 font-medium">Monetary</th>
                <th className="py-3 px-4 font-medium">AOV</th>
                <th className="py-3 px-4 font-medium">Tenure</th>
                <th className="py-3 px-4 font-medium">Segment</th>
                <th className="py-3 px-4 font-medium">Confidence</th>
                <th className="py-3 px-4 font-medium">Distance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.rowIndex}
                  className="border-b border-border/30 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-2.5 px-4 text-xs text-muted-foreground font-mono">
                    {r.rowIndex + 1}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-xs">{r.recency}</td>
                  <td className="py-2.5 px-4 font-mono text-xs">{r.frequency}</td>
                  <td className="py-2.5 px-4 font-mono text-xs">{r.monetary}</td>
                  <td className="py-2.5 px-4 font-mono text-xs">{r.aov}</td>
                  <td className="py-2.5 px-4 font-mono text-xs">{r.tenure}</td>
                  <td className="py-2.5 px-4">
                    <SegmentBadge segment={r.predictedSegment} />
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="text-xs font-mono">
                      {(r.confidence * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="text-xs font-mono text-muted-foreground">
                      {r.distanceToCentroid}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BulkPredict() {
  const [, setLocation] = useLocation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [results, setResults] = useState<BulkRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const parseCsv = useCallback((file: File): Promise<BulkRow[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.trim().split(/\r?\n/);
          if (lines.length < 2)
            return reject(new Error("CSV file appears empty"));
          const headers = lines[0]
            .split(",")
            .map((h) => h.trim().replace(/['"]/g, "").toLowerCase());
          const required = [
            "recency",
            "frequency",
            "monetary",
            "aov",
            "tenure",
          ];
          for (const req of required) {
            if (!headers.includes(req))
              return reject(new Error("Missing required column: " + req));
          }
          const rows: any[] = [];
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(",").map((c) => parseFloat(c.trim()));
            if (cols.some(isNaN)) continue;
            const row: any = { rowIndex: i - 1 };
            headers.forEach((h, idx) => {
              if (required.includes(h)) row[h] = cols[idx];
            });
            rows.push(row);
          }
          resolve(rows as BulkRow[]);
        } catch (e: any) {
          reject(e);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }, []);

  const handleSubmit = async () => {
    if (!selectedFile) return toast.error("Please select a CSV file");
    setIsLoading(true);
    setProgress(10);
    setResults([]);
    try {
      setProgress(30);
      const rows = await parseCsv(selectedFile);
      setProgress(50);
      const batchId =
        "batch_" +
        Date.now() +
        "_" +
        Math.random().toString(36).slice(2, 8);
      const parsedRows = rows.map((r) => ({
        rowIndex: r.rowIndex,
        recency: Number(r.recency),
        frequency: Number(r.frequency),
        monetary: Number(r.monetary),
        aov: Number(r.aov),
        tenure: Number(r.tenure),
      }));
      setProgress(70);
      const res = (await trpc.bulkPredict.mutate({
        results: parsedRows,
        batchId,
      })) as any;
      setProgress(90);
      if (res.success) setResults(res.results as BulkRow[]);
      else toast.error("Batch processing completed with errors");
      setProgress(100);
      toast.success("Processed " + res.successCount + " rows successfully");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to process CSV");
      setProgress(0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && !file.name.endsWith(".csv"))
      return toast.error("Please select a CSV file");
    setSelectedFile(file);
    setResults([]);
    setProgress(0);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/predict")}
          className="hover:bg-white/5"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Bulk Prediction
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Score entire datasets via CSV upload
          </p>
        </div>
      </div>

      {!results.length && (
        <Card className="glass-card border-border/60">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
              Upload CSV
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Upload a CSV with{" "}
              <span className="font-mono text-foreground">
                recency, frequency, monetary, aov, tenure
              </span>{" "}
              columns.
            </p>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">CSV File</Label>
              <label className="flex items-center justify-center gap-3 p-6 border-2 border-dashed border-white/10 rounded-xl hover:border-white/20 transition-colors cursor-pointer bg-white/[0.01]">
                <Upload className="w-5 h-5 text-muted-foreground" />
                <div className="text-sm text-muted-foreground text-center">
                  <span className="text-foreground font-medium">
                    {selectedFile?.name ?? "Click or drag to upload"}
                  </span>
                  <p className="text-xs mt-0.5">.csv files, max 10,000 rows</p>
                </div>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => {
                  const sample =
                    "recency,frequency,monetary,aov,tenure\n30,5,5000,1000,180\n60,3,2000,667,90\n";
                  const blob = new Blob([sample], { type: "text/csv" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "bulk-predict-template.csv";
                  a.click();
                  URL.revokeObjectURL(a.href);
                  toast.success("Template downloaded");
                }}
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                Download CSV Template
              </Button>
              <Button
                disabled={!selectedFile || isLoading}
                onClick={handleSubmit}
                className="bg-primary hover:bg-primary/90"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing... (
                    <span className="font-mono">{progress}%</span>)
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Run Bulk Prediction
                  </>
                )}
              </Button>
            </div>
            {isLoading && (
              <div className="space-y-1.5 pt-1">
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/80 transition-all rounded-full"
                    style={{ width: progress + "%" }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Processing rows...
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <ResultsTable
          rows={results}
          onClear={() => {
            setResults([]);
            setSelectedFile(null);
            setProgress(0);
          }}
        />
      )}
    </div>
  );
}

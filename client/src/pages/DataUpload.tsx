import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, CheckCircle2, AlertCircle, X, Database } from "lucide-react";
import { toast } from "sonner";

interface FileState {
  file: File | null;
  status: "idle" | "ready" | "uploading" | "success" | "error";
  rows?: number;
  error?: string;
}

function FileDropZone({
  label,
  description,
  accept,
  fileState,
  onFile,
  onClear,
}: {
  label: string;
  description: string;
  accept: string;
  fileState: FileState;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  const statusIcon = {
    idle: null,
    ready: <FileText className="w-4 h-4 text-primary" />,
    uploading: null,
    success: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    error: <AlertCircle className="w-4 h-4 text-red-400" />,
  }[fileState.status];

  return (
    <div
      className={`relative rounded-xl border-2 border-dashed p-6 transition-all duration-200 cursor-pointer
        ${dragging ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/40 hover:bg-muted/20"}
        ${fileState.status === "success" ? "border-emerald-400/40 bg-emerald-400/5" : ""}
        ${fileState.status === "error" ? "border-red-400/40 bg-red-400/5" : ""}
      `}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !fileState.file && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />

      {fileState.file ? (
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {statusIcon}
            <div>
              <p className="text-sm font-medium text-foreground">{fileState.file.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(fileState.file.size / 1024).toFixed(1)} KB
                {fileState.rows && ` · ${fileState.rows.toLocaleString()} rows detected`}
              </p>
              {fileState.error && <p className="text-xs text-red-400 mt-1">{fileState.error}</p>}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onClear(); }}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center">
          <Upload className="w-8 h-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
          <p className="text-xs text-muted-foreground/60 mt-2">Drag & drop or click to browse</p>
          <Badge variant="outline" className="mt-2 text-xs text-muted-foreground">CSV</Badge>
        </div>
      )}
    </div>
  );
}

export default function DataUpload() {
  const [invoices, setInvoices] = useState<FileState>({ file: null, status: "idle" });
  const [contacts, setContacts] = useState<FileState>({ file: null, status: "idle" });
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pipelineLog, setPipelineLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (setter: typeof setInvoices) => (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = text.split("\n").filter((l) => l.trim()).length - 1;
      setter({ file, status: "ready", rows });
    };
    reader.readAsText(file.slice(0, 50000));
  };

  const handleProcess = async () => {
    if (!invoices.file || !contacts.file) {
      toast.error("Please upload both files before processing");
      return;
    }

    setProcessing(true);
    setProgress(0);
    setPipelineLog([]);
    setDone(false);
    setError(null);

    const formData = new FormData();
    formData.append("invoices", invoices.file);
    formData.append("contacts", contacts.file);

    try {
      setPipelineLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Uploading CSVs...`]);
      setProgress(5);

      const response = await fetch("/api/upload/run-pipeline", {
        method: "POST",
        body: formData,
      });

      setProgress(50);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Pipeline failed");
      }

      setProgress(80);

      const result = await response.json();
      setProgress(100);

      setPipelineLog((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ${result.message || "Pipeline complete"}`,
        `[${new Date().toLocaleTimeString()}] Segments: ${JSON.stringify(result.segments)}`,
      ]);

      setInvoices((prev) => ({ ...prev, status: "success" }));
      setContacts((prev) => ({ ...prev, status: "success" }));
      setDone(true);
      toast.success(result.message || "Pipeline complete!");
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPipelineLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Error: ${msg}`]);
      toast.error(`Pipeline failed: ${msg}`);
    } finally {
      setProcessing(false);
    }
  };

  const canProcess = invoices.file && contacts.file && !processing;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Reset DB Button */}
      <Card className="glass-card border-border/40">
        <CardContent className="p-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Reset all data (development only)</p>
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              if (!window.confirm('Are you sure you want to delete all customer data?')) return;
              try {
                const res = await fetch('/api/admin/truncate', { method: 'POST' });
                const json = await res.json();
                if (res.ok) {
                  toast.success(json.message || 'Database truncated');
                  // Reset UI state
                  setInvoices({ file: null, status: "idle" });
                  setContacts({ file: null, status: "idle" });
                  setProcessing(false);
                  setProgress(0);
                  setDone(false);
                  setPipelineLog([]);
                } else {
                  toast.error(json.error || 'Failed to truncate');
                }
              } catch (e: any) {
                toast.error(e.message || 'Error resetting DB');
              }
            }}
            className="bg-red-600 hover:bg-red-700"
          >
            Reset DB
          </Button>
        </CardContent>
      </Card>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Data Upload</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Ingest new CSV files, run the cleaning pipeline, and update segment labels
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="glass-card border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              Invoice Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FileDropZone
              label="Upload Invoices CSV"
              description="invoice_id, customer_id, date, total, product_category, payment_status, channel"
              accept=".csv"
              fileState={invoices}
              onFile={handleFile(setInvoices)}
              onClear={() => setInvoices({ file: null, status: "idle" })}
            />
          </CardContent>
        </Card>

        <Card className="glass-card border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              Contacts Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FileDropZone
              label="Upload Contacts CSV"
              description="contact_id, contact_name, created_time, region, acquisition_channel, loyalty_tier"
              accept=".csv"
              fileState={contacts}
              onFile={handleFile(setContacts)}
              onClear={() => setContacts({ file: null, status: "idle" })}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-border/40">
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
            <div>
              <p className="font-medium text-foreground">Run Data Pipeline</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cleans data, engineers features, applies K-Means model, and updates segment labels
              </p>
            </div>
            <Button onClick={handleProcess} disabled={!canProcess} className="bg-primary hover:bg-primary/90">
              {processing ? (
                <>
                  <span className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                  Processing...
                </>
              ) : done ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400" />
                  Complete
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Process & Re-segment
                </>
              )}
            </Button>
          </div>

          {processing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Processing...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="glass-card border-red-400/40 bg-red-400/5">
          <CardContent className="p-4">
            <p className="text-sm text-red-400 font-medium">Pipeline Error</p>
            <p className="text-xs text-red-400/80 mt-1">{error}</p>
          </CardContent>
        </Card>
      )}

      {pipelineLog.length > 0 && (
        <Card className="glass-card border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              Pipeline Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-black/40 border border-border/30 p-4 font-mono text-xs max-h-48 overflow-y-auto space-y-1">
              {pipelineLog.map((line, i) => (
                <div key={i} className={`leading-5 ${i === pipelineLog.length - 1 && done ? "text-emerald-400" : "text-emerald-400/70"}`}>
                  {line}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="glass-card border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Expected CSV Schema</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-medium text-foreground mb-2">Invoices CSV</p>
              <div className="space-y-1 text-muted-foreground font-mono">
                {["invoice_id", "customer_id", "date (DD/MM/YYYY)", "total (KES)", "product_category", "payment_status", "channel"].map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="font-medium text-foreground mb-2">Contacts CSV</p>
              <div className="space-y-1 text-muted semver-foreground font-mono">
                {["contact_id", "contact_name", "created_time", "region", "acquisition_channel", "loyalty_tier"].map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 flex-shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

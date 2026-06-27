import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download, BookOpen, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const REPORT_URL = '/manus-storage/B2C_Customer_Segmentation_Project_Report_0ffb3edf.md';
const ZIP_URL = '/manus-storage/B2C_Customer_Segmentation_Project_0478e48d.zip';

// Simple markdown to HTML renderer
function renderMarkdown(md: string): string {
  return md
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr />')
    // Unordered list items
    .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
    // Ordered list items
    .replace(/^\s*\d+\. (.+)$/gm, '<li>$1</li>')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Tables (basic)
    .replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.split('|').filter(c => c.trim() && !c.match(/^[-\s]+$/));
      if (cells.length === 0) return '';
      return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
    })
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    // Line breaks
    .replace(/\n/g, '<br />');
}

export default function ReportViewer() {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(REPORT_URL)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load report (${res.status})`);
        return res.text();
      })
      .then(text => {
        setMarkdown(text);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleGenerateReport = async () => {
    toast.info('Generating report...', { duration: 2000 });
    try {
      const res = await fetch('/api/report/generate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Generation failed');
      const updated = await fetch(REPORT_URL);
      const text = await updated.text();
      setMarkdown(text);
      toast.success('Report generated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Report generation failed');
    }
  };

  const handleDownloadReport = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'B2C_Customer_Segmentation_Report.md';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report downloaded!');
  };

  const handleDownloadZip = () => {
    toast.info('Preparing ZIP export...', { duration: 1500 });
    const a = document.createElement('a');
    a.href = ZIP_URL;
    a.download = 'B2C_Customer_Segmentation_Project.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('ZIP download started!');
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Project Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Full B2C Customer Segmentation methodology report with findings and recommendations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadReport}
            disabled={!markdown}
            className="text-xs"
          >
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Download .md
          </Button>
 <Button
  variant="outline"
  size="sm"
  onClick={handleGenerateReport}
  className="text-xs"
>
  Generate Report
</Button>
<Button
  size="sm"
  onClick={handleDownloadZip}
  className="bg-primary hover:bg-primary/90 text-xs"
>
  <Download className="w-3.5 h-3.5 mr-1.5" />
  Export ZIP
</Button>
        </div>
      </div>

      {/* Report Meta */}
      <Card className="glass-card border-border/40">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">B2C Customer Segmentation Project Report</span>
            </div>
            <div className="flex flex-wrap gap-2 ml-auto">
              {['Phase 1–8', 'K-Means', 'RFM Analysis', 'PCA + UMAP', 'KES Currency'].map(tag => (
                <Badge key={tag} variant="outline" className="text-xs text-muted-foreground">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Content */}
      <Card className="glass-card border-border/40">
        <CardHeader className="pb-3 border-b border-border/30">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              Report Content
            </CardTitle>
            <a
              href={REPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Open raw
            </a>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className={`h-4 ${i % 3 === 0 ? 'w-1/2' : i % 5 === 0 ? 'w-3/4' : 'w-full'}`} />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Could not load report: {error}</p>
              <p className="text-xs text-muted-foreground mt-1">The report file may not be available yet.</p>
            </div>
          ) : (
            <div
              className="markdown-report prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(markdown ?? '')}</p>` }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

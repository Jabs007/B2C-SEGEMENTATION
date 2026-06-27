import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Clock, RotateCcw } from "lucide-react";
import { SEGMENT_CONFIG, type SegmentName } from "../../../shared/segments";
import { toast } from "sonner";

interface PredictionResult {
  segment: SegmentName;
  confidence: number;
  description: string;
}

const FIELD_CONFIG = [
  {
    key: 'recency',
    label: 'Recency',
    description: 'Days since last purchase',
    placeholder: 'e.g. 30',
    hint: 'Lower is better — more recent customers score higher',
  },
  {
    key: 'frequency',
    label: 'Frequency',
    description: 'Number of purchases',
    placeholder: 'e.g. 3',
    hint: 'Total number of transactions in the analysis window',
  },
  {
    key: 'monetary',
    label: 'Monetary Value',
    description: 'Total spend (KES)',
    placeholder: 'e.g. 5000',
    hint: 'Total amount spent across all transactions',
  },
  {
    key: 'aov',
    label: 'Average Order Value',
    description: 'Mean transaction size (KES)',
    placeholder: 'e.g. 1667',
    hint: 'Monetary ÷ Frequency',
  },
  {
    key: 'tenure',
    label: 'Tenure',
    description: 'Days since registration',
    placeholder: 'e.g. 365',
    hint: 'How long this customer has been in the system',
  },
];

export default function Predict() {
  const [form, setForm] = useState({
    recency: '',
    frequency: '',
    monetary: '',
    aov: '',
    tenure: '',
  });
  const [result, setResult] = useState<PredictionResult | null>(null);

  const predictMutation = trpc.predictions.predict.useMutation({
    onSuccess: (data) => {
      setResult(data as PredictionResult);
      toast.success(`Predicted: ${data.segment}`);
    },
    onError: (err) => {
      toast.error(`Prediction failed: ${err.message}`);
    },
  });

  const { data: recentPredictions } = trpc.predictions.recent.useQuery();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const values = {
      recency: parseFloat(form.recency),
      frequency: parseFloat(form.frequency),
      monetary: parseFloat(form.monetary),
      aov: parseFloat(form.aov),
      tenure: parseFloat(form.tenure),
    };
    if (Object.values(values).some(v => isNaN(v) || v < 0)) {
      toast.error('Please fill in all fields with valid non-negative numbers');
      return;
    }
    predictMutation.mutate(values);
  };

  const handleReset = () => {
    setForm({ recency: '', frequency: '', monetary: '', aov: '', tenure: '' });
    setResult(null);
  };

  const config = result ? SEGMENT_CONFIG[result.segment] : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Customer Prediction</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Input customer RFM attributes to predict their segment using the trained K-Means model
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <Card className="glass-card border-border/40 lg:col-span-3">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Customer Attributes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {FIELD_CONFIG.map(field => (
                <div key={field.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={field.key} className="text-sm font-medium text-foreground">
                      {field.label}
                      <span className="text-muted-foreground font-normal ml-1">— {field.description}</span>
                    </Label>
                  </div>
                  <Input
                    id={field.key}
                    type="number"
                    min="0"
                    step="any"
                    placeholder={field.placeholder}
                    value={form[field.key as keyof typeof form]}
                    onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="bg-muted/50 border-border/60 focus:border-primary/50 text-foreground"
                  />
                  <p className="text-xs text-muted-foreground">{field.hint}</p>
                </div>
              ))}

              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={predictMutation.isPending}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  {predictMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Predicting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Predict Segment
                    </>
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={handleReset}>
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Result + Recent */}
        <div className="lg:col-span-2 space-y-4">
          {/* Prediction Result */}
          {result && config ? (
            <Card
              className="glass-card border-2 transition-all duration-300"
              style={{ borderColor: config.borderColor }}
            >
              <CardContent className="p-6">
                <div className="text-center mb-4">
                  <span className="text-5xl">{config.icon}</span>
                  <h2
                    className="text-2xl font-bold mt-2"
                    style={{ color: config.color }}
                  >
                    {result.segment}
                  </h2>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <Badge
                      variant="outline"
                      style={{ color: config.color, borderColor: config.borderColor }}
                    >
                      {Math.round(result.confidence * 100)}% confidence
                    </Badge>
                  </div>
                </div>

                <div
                  className="rounded-lg p-4 text-sm leading-relaxed"
                  style={{ backgroundColor: config.bgColor }}
                >
                  <p className="text-foreground mb-3">{result.description}</p>
                  <div className="border-t border-border/30 pt-3 mt-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Recommended Strategy</p>
                    <p className="text-xs text-muted-foreground">{config.strategy}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="glass-card border-border/40 border-dashed">
              <CardContent className="p-6 flex flex-col items-center justify-center text-center min-h-[200px]">
                <Sparkles className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Fill in the form and click</p>
                <p className="text-sm font-medium text-foreground">"Predict Segment"</p>
                <p className="text-xs text-muted-foreground mt-1">to see the result here</p>
              </CardContent>
            </Card>
          )}

          {/* Recent Predictions */}
          {recentPredictions && recentPredictions.length > 0 && (
            <Card className="glass-card border-border/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Recent Predictions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentPredictions.slice(0, 5).map((p: any) => {
                  const pConfig = SEGMENT_CONFIG[p.predictedSegment as SegmentName];
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
                    >
                      <div className="text-xs text-muted-foreground">
                        R:{p.recency}d · F:{p.frequency} · M:KES{p.monetary.toLocaleString()}
                      </div>
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{ color: pConfig?.color, borderColor: pConfig?.borderColor }}
                      >
                        {p.predictedSegment}
                      </Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

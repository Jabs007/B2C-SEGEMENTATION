import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, Scatter, ScatterChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Area, AreaChart, Line, ComposedChart, Legend, Tooltip, } from "recharts";
import { SEGMENT_CONFIG, SEGMENT_ORDER, type SegmentName } from "@shared/segments";

const CLUSTER_COLORS_MAP: Record<number, string> = { 0: '#6366f1', 1: '#22d3ee', 2: '#f472b6', 3: '#fbbf24' };

function getClusterColor(cluster: number): string {
  return CLUSTER_COLORS_MAP[cluster] ?? '#888888';
}

export { getClusterColor };

const FEATURE_LABELS: Record<string, string> = {
  recency: 'Recency (days)',
  frequency: 'Frequency',
  monetary: 'Monetary (KES)',
  aov: 'Avg Order Value (KES)',
  tenure: 'Tenure (months)',
  spendTrend: 'Spend Trend',
  interPurchaseInterval: 'Inter-Purchase Interval',
  spendConcentration: 'Spend Concentration',
  categoryBreadth: 'Category Breadth',
  channelConsistency: 'Channel Consistency',
  latePaymentRate: 'Late Payment Rate',
  tenureAdjFreq: 'Tenure-Adj Frequency',
};

const CATEGORIES = ['All', 'EDA', 'Dimensionality Reduction', 'Clustering Validation'];

const CHART_DEFS = [
  { id: 'univariate', title: 'Feature Distributions', description: 'Univariate analysis of key customer features — recency, frequency, monetary, and AOV distributions across the customer base.', category: 'EDA', feature: 'monetary' as const, },
  { id: 'correlation', title: 'Feature Correlation Heatmap', description: 'Pearson correlation matrix showing relationships between all engineered features.', category: 'EDA', },
  { id: 'bivariate', title: 'Bivariate Scatter Plots', description: 'Scatter plots of Monetary vs Recency and Monetary vs Frequency, revealing natural groupings in the customer data.', category: 'EDA', x: 'recency', y: 'monetary', },
  { id: 'pca', title: 'PCA Explained Variance', description: 'Cumulative explained variance by principal components.', category: 'Dimensionality Reduction', },
  { id: 'umap', title: 't-SNE Projection', description: 't-SNE 2D projection of the feature space. Distinct visual clusters validate the K-Means segmentation approach.', category: 'Dimensionality Reduction', },
  { id: 'clustering', title: 'Elbow & Silhouette Curves', description: 'Elbow method and silhouette score analysis confirming optimal number of clusters.', category: 'Clustering Validation', },
];

export default function Visualizations() {
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery();
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedChart, setSelectedChart] = useState(CHART_DEFS[0].id);

  const qHistogram = trpc.analytics.histogram.useQuery(
    { feature: CHART_DEFS[0].feature ?? 'monetary', bins: 12 },
    { enabled: activeCategory === 'All' || activeCategory === 'EDA' }
  );

  const qCorrelation = trpc.analytics.correlation.useQuery(undefined, {
    enabled: activeCategory === 'All' || activeCategory === 'EDA',
  });

  const qScatter = trpc.analytics.scatter.useQuery(
    { x: CHART_DEFS[2].x ?? 'recency', y: CHART_DEFS[2].y ?? 'monetary', limit: 500 },
    { enabled: activeCategory === 'All' || activeCategory === 'EDA' }
  );

  const qPCA = trpc.analytics.pca.useQuery(undefined, {
    enabled: activeCategory === 'All' || activeCategory === 'Dimensionality Reduction',
  });

  const qProjection = trpc.analytics.projection.useQuery(undefined, {
    enabled: activeCategory === 'All' || activeCategory === 'Dimensionality Reduction',
  });

  const qClustering = trpc.analytics.clustering.useQuery(undefined, {
    enabled: activeCategory === 'All' || activeCategory === 'Clustering Validation',
  });

  const histogramData = useMemo(() => {
    const raw = qHistogram.data ?? [];
    return raw.map((b: any) => ({
      ...b,
      label: `${b.binStart.toFixed(0)}–${b.binEnd.toFixed(0)}`,
    }));
  }, [qHistogram.data]);

const correlationData = useMemo(() => {
  if (!qCorrelation.data) return [];
  const { features, matrix } = qCorrelation.data as { features: string[]; matrix: number[][] };
  if (!features || !matrix || !Array.isArray(features) || !Array.isArray(matrix)) return [];
  return features
    .filter(f => FEATURE_LABELS[f] || f !== '')
    .slice(0, 8)
    .map(f => {
      const fi = features.indexOf(f);
      const ri = features.indexOf('recency');
      if (fi < 0 || ri < 0) {
        return { feature: FEATURE_LABELS[f] ?? f, recency: 0, frequency: 0, monetary: 0, aov: 0, tenure: 0 };
      }
      const row = matrix[fi];
      if (!row) {
        return { feature: FEATURE_LABELS[f] ?? f, recency: 0, frequency: 0, monetary: 0, aov: 0, tenure: 0 };
      }
      const idx = (key: string) => features.indexOf(key);
      return {
        feature: FEATURE_LABELS[f] ?? f,
        recency: row[idx('recency')] ?? 0,
        frequency: row[idx('frequency')] ?? 0,
        monetary: row[idx('monetary')] ?? 0,
        aov: row[idx('aov')] ?? 0,
        tenure: row[idx('tenure')] ?? 0,
      };
    });
}, [qCorrelation.data]);

const heatmapBins = useMemo(() => {
  const raw = qCorrelation.data as { features: string[]; matrix: number[][] } | undefined;
  if (!raw) return [];
  const labels = FEATURE_LABELS;
  const short = ['recency', 'frequency', 'monetary', 'aov', 'tenure'];
  const rows = short.map(f => raw.features.indexOf(f)).filter(i => i >= 0);
  if (rows.length === 0) return [];
  return rows.map(i => {
    const row = raw.matrix[i];
    if (!row) return null;
    return {
      feature: labels[raw.features[i]] ?? raw.features[i],
      recency: +(row[raw.features.indexOf('recency')] ?? 0).toFixed(2),
      frequency: +(row[raw.features.indexOf('frequency')] ?? 0).toFixed(2),
      monetary: +(row[raw.features.indexOf('monetary')] ?? 0).toFixed(2),
      aov: +(row[raw.features.indexOf('aov')] ?? 0).toFixed(2),
      tenure: +(row[raw.features.indexOf('tenure')] ?? 0).toFixed(2),
    };
  }).filter(Boolean);
}, [qCorrelation.data]);

  const pcaData = qPCA.data ?? [];
  const clusteringData = qClustering.data ?? [];

  const projectedByCluster = useMemo(() => {
    const raw = qProjection.data as any[] | undefined;
    if (!raw) return {};
    const grouped: Record<number, { x: number; y: number }[]> = {};
    raw.forEach(r => {
      const c = r.cluster ?? 0;
      if (!grouped[c]) grouped[c] = [];
      grouped[c].push({ x: r.x, y: r.y });
    });
    return grouped;
  }, [qProjection.data]);

  const hasLiveData = stats && stats.totalCustomers > 0;

  function isLoadingAny() {
    return qHistogram.isLoading || qCorrelation.isLoading || qScatter.isLoading ||
      qPCA.isLoading || qProjection.isLoading || qClustering.isLoading;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Visualizations</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          EDA charts, dimensionality reduction projections, and clustering validation curves
        </p>
      </div>

      {!statsLoading && stats && stats.totalCustomers === 0 && (
        <Card className="glass-card border-dashed border-border/40">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">No live data yet — upload CSVs to run your own analysis.</p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => (
          <Button
            key={cat}
            variant={activeCategory === cat ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory(cat)}
            className={activeCategory === cat ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}
          >
            {cat}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {/* Feature Distributions */}
        {(activeCategory === 'All' || activeCategory === 'EDA') && (
          <Card className="glass-card border-border/40 overflow-hidden md:col-span-2 xl:col-span-2">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-1">Feature Distributions</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Univariate analysis of key customer features — distributions across the customer base.
              </p>
              {qHistogram.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-48 w-full" />
                </div>
              ) : (
                <ChartContainer config={{}} className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={histogramData.slice(0, 12)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/30" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: 'currentColor' }}
                        className="text-muted-foreground"
                        interval="preserveStartEnd"
                      />
                      <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} className="text-muted-foreground" />
                      <Tooltip content={<ChartTooltipContent indicator="dot" hideLabel />} />
                      <Bar dataKey="count" fill="#818cf8" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </div>
          </Card>
        )}

        {/* Correlation Heatmap */}
        {(activeCategory === 'All' || activeCategory === 'EDA') && (
          <Card className="glass-card border-border/40 overflow-hidden">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-1">Feature Correlation Heatmap</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Pearson correlation matrix showing relationships between top engineered features.
              </p>
              {qCorrelation.isLoading || heatmapBins.length === 0 ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <ChartContainer config={{}} className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={heatmapBins} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/30" />
                      <XAxis
                        type="number"
                        domain={[-1, 1]}
                        tick={{ fontSize: 9, fill: 'currentColor' }}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        type="category"
                        dataKey="feature"
                        tick={{ fontSize: 9, fill: 'currentColor' }}
                        className="text-muted-foreground"
                        width={90}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          `${(value * 100).toFixed(1)}%`,
                          name,
                        ]}
                      />
                      {heatmapBins.length > 1 && [
                        { key: 'recency', color: '#22d3ee' },
                        { key: 'frequency', color: '#f472b6' },
                        { key: 'monetary', color: '#818cf8' },
                        { key: 'aov', color: '#fbbf24' },
                        { key: 'tenure', color: '#34d399' },
                      ]
                        .filter(item => heatmapBins.some(d => (d as any)[item.key] !== undefined))
                        .map(({ key, color }) => (
                          <Bar
                            key={key}
                            dataKey={key}
                            fill={color}
                            stackId="a"
                            radius={[0, 1, 1, 0]}
                          />
                        ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </div>
          </Card>
        )}

        {/* Bivariate Scatter Plots */}
        {(activeCategory === 'All' || activeCategory === 'EDA') && (
          <Card className="glass-card border-border/40 overflow-hidden md:col-span-2 xl:col-span-3">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-1">Bivariate Scatter Plots</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Scatter plots of Monetary vs Recency, revealing natural groupings in the customer data.
              </p>
              {qScatter.isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <ChartContainer config={{}} className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/30" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Recency"
                        tick={{ fontSize: 10, fill: 'currentColor' }}
                        className="text-muted-foreground"
                        label={{ value: 'Recency (days)', position: 'insideBottom', offset: -5, fontSize: 10 }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="Monetary"
                        tick={{ fontSize: 10, fill: 'currentColor' }}
                        className="text-muted-foreground"
                        label={{ value: 'Monetary (KES)', angle: -90, position: 'insideLeft', fontSize: 10 }}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        formatter={(value: any, name: any) => {
                          if (name === 'segment') return [value, 'Segment'];
                          return [`${Number(value).toLocaleString()}`, name];
                        }}
                        labelFormatter={() => ''}
                      />
                      <Legend />
                      {SEGMENT_ORDER.map(seg => {
                        const data = (qScatter.data as any[] | undefined ?? []).filter(
                          (d: any) => d.segment === seg
                        );
                        if (data.length === 0) return null;
                        return (
                          <Scatter
                            key={seg}
                            name={seg}
                            data={data}
                            fill={SEGMENT_CONFIG[seg].color}
                          />
                        );
                      })}
                    </ScatterChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </div>
          </Card>
        )}

        {/* PCA Explained Variance */}
        {(activeCategory === 'All' || activeCategory === 'Dimensionality Reduction') && (
          <Card className="glass-card border-border/40 overflow-hidden md:col-span-2 xl:col-span-2">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-1">PCA Explained Variance</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Cumulative explained variance by principal components. Higher components explain diminishing variance.
              </p>
              {qPCA.isLoading || pcaData.length === 0 ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <ChartContainer config={{}} className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={pcaData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/30" />
                      <XAxis
                        dataKey="component"
                        tick={{ fontSize: 10, fill: 'currentColor' }}
                        className="text-muted-foreground"
                        label={{ value: 'Component', position: 'insideBottom', offset: -5, fontSize: 10 }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'currentColor' }}
                        className="text-muted-foreground"
                        label={{ value: 'Variance (%)', angle: -90, position: 'insideLeft', fontSize: 10 }}
                      />
                      <Tooltip content={<ChartTooltipContent indicator="dot" />} />
                      <Area
                        type="monotone"
                        dataKey="cumulative"
                        stroke="#818cf8"
                        fill="rgba(129, 140, 248, 0.2)"
                        name="Cumulative %"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </div>
          </Card>
        )}

        {/* t-SNE Projection */}
        {(activeCategory === 'All' || activeCategory === 'Dimensionality Reduction') && (
          <Card className="glass-card border-border/40 overflow-hidden">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-1">t-SNE Projection</h3>
              <p className="text-xs text-muted-foreground mb-3">
                t-SNE 2D projection of the feature space colored by cluster.
              </p>
              {qProjection.isLoading || Object.keys(projectedByCluster).length === 0 ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <ChartContainer config={{}} className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/30" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Dim 1"
                        tick={{ fontSize: 10, fill: 'currentColor' }}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="Dim 2"
                        tick={{ fontSize: 10, fill: 'currentColor' }}
                        className="text-muted-foreground"
                      />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                      <Legend />
                      {Object.entries(projectedByCluster).map(([cluster, pts]) => (
                        <Scatter
                          key={cluster}
                          name={`Cluster ${cluster}`}
                          data={pts as any[]}
                          fill={getClusterColor(Number(cluster))}
                        />
                      ))}
                    </ScatterChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </div>
          </Card>
        )}

        {/* Elbow & Silhouette Curves */}
        {(activeCategory === 'All' || activeCategory === 'Clustering Validation') && (
          <Card className="glass-card border-border/40 overflow-hidden md:col-span-2 xl:col-span-3">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-1">Elbow & Silhouette Curves</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Elbow method and silhouette score analysis confirming optimal K. Shows 2 columns: k-clusters applied minus 1; and Silhouette Score
              </p>
              {qClustering.isLoading || clusteringData.length === 0 ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <ChartContainer config={{ inertia: {}, silhouette: {} }} className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={clusteringData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/30" />
                      <XAxis
                        dataKey="k"
                        tick={{ fontSize: 10, fill: 'currentColor' }}
                        className="text-muted-foreground"
                        label={{ value: 'K (clusters)', position: 'insideBottom', offset: -5, fontSize: 10 }}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 10, fill: 'currentColor' }}
                        className="text-muted-foreground"
                        label={{ value: 'Inertia', angle: -90, position: 'insideLeft', fontSize: 10 }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 10, fill: 'currentColor' }}
                        className="text-muted-foreground"
                        label={{ value: 'Silhouette', angle: 90, position: 'insideRight', fontSize: 10 }}
                      />
                      <Tooltip content={<ChartTooltipContent indicator="dot" />} />
                      <Legend />
                      <Bar yAxisId="left" dataKey="inertia" fill="#818cf8" radius={[4, 4, 0, 0]} name="Inertia" />
                      <Line yAxisId="right" type="monotone" dataKey="silhouette" stroke="#f472b6" strokeWidth={2} name="Silhouette" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </div>
          </Card>
        )}
      </div>

      <div className="p-4">
        <p className="text-sm text-muted-foreground text-center">
          {hasLiveData ? 'Live visualizations generated from your customer data.' : 'No data yet — upload your CSVs to generate your own analysis.'}
        </p>
      </div>
    </div>
  );
}

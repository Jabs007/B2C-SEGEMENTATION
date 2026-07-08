import { useQuery } from "@tanstack/react-query";
import { trpc } from "@renderer/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, CheckCircle2, XCircle } from "lucide-react";

export function PipelineStatus() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["segments.pipelineLog"],
    queryFn: () => trpc.segments.pipelineLog.query({ limit: 5 }),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const latest = logs[0];
  if (!latest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No runs recorded</p>
        </CardContent>
      </Card>
    );
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-amber-500" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Pipeline Status
          {statusIcon(latest.status)}
          <Badge variant={latest.status === "completed" ? "default" : "secondary"}>
            {latest.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Customers scored:</span>{" "}
            <span className="font-medium">{latest.successfully_scored ?? 0}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Avg confidence:</span>{" "}
            <span className="font-medium">
              {latest.average_confidence ? `${(latest.average_confidence * 100).toFixed(1)}%` : "—"}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">Duration:</span>{" "}
            <span className="font-medium">
              {latest.processing_time_seconds
                ? `${latest.processing_time_seconds.toFixed(1)}s`
                : "—"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground pt-1">
            Last run: {new Date(latest.run_date).toLocaleString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

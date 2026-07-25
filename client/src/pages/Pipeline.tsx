import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Play, RefreshCw, Clock, CheckCircle2, XCircle, Loader2,
  Plus, Trash2, Calendar, Activity, Terminal
} from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'text-yellow-400', borderColor: 'border-yellow-400/30', bg: 'bg-yellow-400/10', icon: Clock },
  running: { label: 'Running', color: 'text-blue-400', borderColor: 'border-blue-400/30', bg: 'bg-blue-400/10', icon: Loader2 },
  completed: { label: 'Completed', color: 'text-emerald-400', borderColor: 'border-emerald-400/30', bg: 'bg-emerald-400/10', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'text-red-400', borderColor: 'border-red-400/30', bg: 'bg-red-400/10', icon: XCircle },
};

function RunCard({ run }: { run: any }) {
  const [expanded, setExpanded] = useState(false);
  const status = run.status as keyof typeof STATUS_CONFIG;
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = config.icon;

  return (
    <Card className={`glass-card border ${config.borderColor} transition-all`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center`}>
              <Icon className={`w-4 h-4 ${config.color} ${status === 'running' ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Run #{run.id}</span>
                <Badge variant="outline" className={`text-xs ${config.color}`} style={{ borderColor: config.borderColor.replace('border-', '') }}>
                  {config.label}
                </Badge>
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {run.triggeredBy}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Started: {new Date(run.startedAt).toLocaleString()}
                {run.completedAt && ` · Completed: ${new Date(run.completedAt).toLocaleString()}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {run.customersProcessed && (
              <span className="text-xs text-muted-foreground">{run.customersProcessed.toLocaleString()} customers</span>
            )}
            {run.logs && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(e => !e)}
                className="text-xs text-muted-foreground"
              >
                <Terminal className="w-3 h-3 mr-1" />
                {expanded ? 'Hide' : 'Logs'}
              </Button>
            )}
          </div>
        </div>

        {expanded && run.logs && (
          <div className="mt-3 rounded-lg bg-black/40 border border-border/30 p-3 font-mono text-xs text-emerald-400 max-h-48 overflow-y-auto">
            {run.logs.split('\n').map((line: string, i: number) => (
              <div key={i} className="leading-5">{line}</div>
            ))}
          </div>
        )}

        {run.errorMessage && (
          <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 p-2 text-xs text-red-400">
            {run.errorMessage}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Pipeline() {
  const [newJobName, setNewJobName] = useState('');
  const [newJobCron, setNewJobCron] = useState('0 2 * * 1');
  const [showNewJob, setShowNewJob] = useState(false);

  const utils = trpc.useUtils();

  const { data: runs, isLoading: runsLoading } = trpc.pipeline.runs.useQuery(undefined, {
    refetchInterval: 3000,
  });

  const { data: schedules, isLoading: schedulesLoading } = trpc.pipeline.schedules.useQuery();

  const triggerMutation = trpc.pipeline.trigger.useMutation({
    onSuccess: () => {
      toast.success('Pipeline triggered! Monitoring run...');
      utils.pipeline.runs.invalidate();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const createScheduleMutation = trpc.pipeline.createSchedule.useMutation({
    onSuccess: () => {
      toast.success('Scheduled job created');
      utils.pipeline.schedules.invalidate();
      setShowNewJob(false);
      setNewJobName('');
      setNewJobCron('0 2 * * 1');
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const toggleMutation = trpc.pipeline.toggleSchedule.useMutation({
    onSuccess: () => utils.pipeline.schedules.invalidate(),
  });

  const deleteMutation = trpc.pipeline.deleteSchedule.useMutation({
    onSuccess: () => {
      toast.success('Schedule deleted');
      utils.pipeline.schedules.invalidate();
    },
  });

  const activeRun = runs?.find((r: any) => r.status === 'running' || r.status === 'pending');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pipeline Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Trigger batch re-segmentation, monitor pipeline status, and manage recurring schedules
        </p>
      </div>

      {/* Trigger Panel */}
      <Card className="glass-card border-border/40">
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Manual Re-segmentation</p>
                <p className="text-xs text-muted-foreground">
                  {activeRun
                    ? `Run #${activeRun.id} is currently ${activeRun.status}...`
                    : 'Trigger a full pipeline run on all 7,551 customers'}
                </p>
              </div>
            </div>
            <Button
              onClick={() => triggerMutation.mutate({ triggeredBy: 'manual' })}
              disabled={triggerMutation.isPending || !!activeRun}
              className="bg-primary hover:bg-primary/90"
            >
              {triggerMutation.isPending || activeRun ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Pipeline
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Run History */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
              Run History
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => utils.pipeline.runs.invalidate()}
              className="text-xs text-muted-foreground"
            >
              Refresh
            </Button>
          </div>

          <div className="space-y-3">
            {runsLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="glass-card border-border/40">
                    <CardContent className="p-4">
                      <Skeleton className="h-5 w-48 mb-2" />
                      <Skeleton className="h-3 w-64" />
                    </CardContent>
                  </Card>
                ))
              : runs?.length === 0
                ? (
                  <Card className="glass-card border-border/40 border-dashed">
                    <CardContent className="p-6 text-center">
                      <p className="text-sm text-muted-foreground">No pipeline runs yet.</p>
                      <p className="text-xs text-muted-foreground mt-1">Trigger your first run above.</p>
                    </CardContent>
                  </Card>
                )
                : runs?.map((run: any) => <RunCard key={run.id} run={run} />)}
          </div>
        </div>

        {/* Scheduled Jobs */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              Scheduled Jobs
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewJob(s => !s)}
              className="text-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              New Schedule
            </Button>
          </div>

          {showNewJob && (
            <Card className="glass-card border-primary/30">
              <CardContent className="p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Job Name</Label>
                  <Input
                    placeholder="e.g. Weekly Re-segmentation"
                    value={newJobName}
                    onChange={e => setNewJobName(e.target.value)}
                    className="bg-muted/50 border-border/60 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Cron Expression</Label>
                  <Input
                    placeholder="0 2 * * 1"
                    value={newJobCron}
                    onChange={e => setNewJobCron(e.target.value)}
                    className="bg-muted/50 border-border/60 text-sm font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Examples: <code className="text-primary">0 2 * * 1</code> (Mon 2am) · <code className="text-primary">0 0 1 * *</code> (1st of month)
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => createScheduleMutation.mutate({ name: newJobName, cronExpression: newJobCron })}
                    disabled={!newJobName || !newJobCron || createScheduleMutation.isPending}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {createScheduleMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowNewJob(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {schedulesLoading
              ? Array.from({ length: 2 }).map((_, i) => (
                  <Card key={i} className="glass-card border-border/40">
                    <CardContent className="p-4">
                      <Skeleton className="h-5 w-40 mb-2" />
                      <Skeleton className="h-3 w-32" />
                    </CardContent>
                  </Card>
                ))
              : schedules?.length === 0
                ? (
                  <Card className="glass-card border-border/40 border-dashed">
                    <CardContent className="p-6 text-center">
                      <p className="text-sm text-muted-foreground">No scheduled jobs.</p>
                    </CardContent>
                  </Card>
                )
                : schedules?.map((job: any) => (
                    <Card key={job.id} className="glass-card border-border/40">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{job.name}</p>
                            <p className="text-xs font-mono text-muted-foreground mt-0.5">{job.cronExpression}</p>
                            {job.lastRunAt && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Last run: {new Date(job.lastRunAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-3">
                            <Switch
                              checked={job.isActive}
                              onCheckedChange={v => toggleMutation.mutate({ id: job.id, isActive: v })}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 text-muted-foreground hover:text-red-400"
                              onClick={() => deleteMutation.mutate({ id: job.id })}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
          </div>
        </div>
      </div>
    </div>
  );
}

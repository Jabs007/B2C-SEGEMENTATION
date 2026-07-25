import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Megaphone, Plus, Play, BarChart3, Mail, Tag, Gift, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SEGMENT_CONFIG } from "../../../shared/segments";

const CAMPAIGN_TYPES = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'discount', label: 'Discount', icon: Tag },
  { value: 'loyalty', label: 'Loyalty', icon: Gift },
  { value: 'referral', label: 'Referral', icon: UserPlus },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'border-white/10 text-muted-foreground' },
  active: { label: 'Active', color: 'border-emerald-400/40 text-emerald-300' },
  completed: { label: 'Completed', color: 'border-white/10 text-muted-foreground' },
  paused: { label: 'Paused', color: 'border-yellow-400/40 text-yellow-300' },
};

function SegmentCard({ segment, onClick }: { segment: string; onClick: () => void }) {
  const cfg = SEGMENT_CONFIG[segment as keyof typeof SEGMENT_CONFIG];
  if (!cfg) return null;
  return (
    <Card className="glass-card border-border/40 hover:border-white/20 transition-all cursor-pointer group">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{cfg.icon}</span>
            <span className="font-semibold text-sm">{segment}</span>
          </div>
          <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={onClick}>
            <Plus className="w-3.5 h-3.5 mr-1" />Create
          </Button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">{cfg.strategy}</p>
      </CardContent>
    </Card>
  );
}

export default function CampaignActionBoard() {
  const queryClient = useQueryClient();
  const [showEditor, setShowEditor] = useState(false);
  const [editCampaign, setEditCampaign] = useState<any>(null);
  const [form, setForm] = useState({ segmentName: '', campaignType: 'email', title: '', description: '', owner: '', discountCode: '', emailTemplate: '', scheduledDate: '' });
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const { data: campaigns = [], isLoading } = useQuery({ queryKey: ['campaigns', filterStatus], queryFn: () => trpc.campaigns.list.query(filterStatus === 'all' ? undefined : { status: filterStatus }).then(r => r as any[]) });
  const createMut = useMutation({ mutationFn: (data: any) => trpc.campaigns.create.mutate(data), onSuccess: () => { toast.success('Campaign created'); setShowEditor(false); queryClient.invalidateQueries({ queryKey: ['campaigns'] }); } });
  const launchMut = useMutation({ mutationFn: (id: number) => trpc.campaigns.launch.mutate({ id }), onSuccess: () => { toast.success('Campaign launched'); queryClient.invalidateQueries({ queryKey: ['campaigns'] }); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: any) => trpc.campaigns.update.mutate({ id, data }), onSuccess: () => { toast.success('Campaign updated'); setShowEditor(false); queryClient.invalidateQueries({ queryKey: ['campaigns'] }); } });

  const openCreate = (segment: string) => { setEditCampaign(null); setForm({ ...form, segmentName: segment }); setShowEditor(true); };
  const openEdit = (campaign: any) => { setEditCampaign(campaign); setForm({ segmentName: campaign.segmentName, campaignType: campaign.campaignType, title: campaign.title, description: campaign.description ?? '', owner: campaign.owner ?? '', discountCode: campaign.discountCode ?? '', emailTemplate: campaign.emailTemplate ?? '', scheduledDate: campaign.scheduledDate ? new Date(campaign.scheduledDate).toISOString().slice(0, 16) : '' }); setShowEditor(true); };
  const submit = () => {
    const payload = { ...form };
    if (!payload.segmentName || !payload.campaignType || !payload.title) return toast.error('Segment, type, and title are required');
    if (editCampaign) updateMut.mutate({ id: editCampaign.id, data: payload }); else createMut.mutate(payload);
  };

  const segments = ['Champions', 'Loyal', 'At Risk', 'Regulars'];
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold tracking-tight text-foreground">Campaign Action Board</h2><p className="text-xs text-muted-foreground mt-0.5">Create, manage, and track marketing campaigns per segment</p></div></div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {segments.map(s => <SegmentCard key={s} segment={s} onClick={() => openCreate(s)} />)}
      </div>
      <Card className="glass-card border-border/40">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Campaigns</CardTitle>
          <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-40 h-8 text-xs bg-white/[0.03] border-white/10"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent></Select>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border/60 text-left text-xs text-muted-foreground uppercase tracking-wider"><th className="py-3 px-4 font-medium">Segment</th><th className="py-3 px-4 font-medium">Type</th><th className="py-3 px-4 font-medium">Title</th><th className="py-3 px-4 font-medium">Status</th><th className="py-3 px-4 font-medium">Sent</th><th className="py-3 px-4 font-medium">Opens</th><th className="py-3 px-4 font-medium">Clicks</th><th className="py-3 px-4 font-medium">Actions</th></tr></thead>
              <tbody>
                {isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={8} className="py-3 px-4"><Skeleton className="h-6 w-full" /></td></tr>)
                  : campaigns.length === 0 ? <tr><td colSpan={8} className="py-8 text-center text-xs text-muted-foreground">No campaigns yet. Create one from the cards above.</td></tr>
                  : (campaigns as any[]).map((c) => {
                      const typeCfg = CAMPAIGN_TYPES.find(t => t.value === c.campaignType);
                      const TypeIcon = typeCfg?.icon ?? Megaphone;
                      const statusCfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.draft;
                      return (
                        <tr key={c.id} className="border-b border-border/30 hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-4 text-xs">{c.segmentName}</td>
                          <td className="py-3 px-4"><span className="inline-flex items-center gap-1.5 text-xs"><TypeIcon className="w-3.5 h-3.5" />{typeCfg?.label ?? c.campaignType}</span></td>
                          <td className="py-3 px-4 text-xs">{c.title}</td>
                          <td className="py-3 px-4"><Badge variant="outline" className={"text-[10px] " + statusCfg.color}>{statusCfg.label}</Badge></td>
                          <td className="py-3 px-4 text-xs font-mono">{c.sentCount ?? 0}</td>
                          <td className="py-3 px-4 text-xs font-mono">{c.openCount ?? 0}</td>
                          <td className="py-3 px-4 text-xs font-mono">{c.clickCount ?? 0}</td>
                          <td className="py-3 px-4"><div className="flex items-center gap-1"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}><BarChart3 className="w-3.5 h-3.5" /></Button>{c.status === 'draft' && <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-400" onClick={() => launchMut.mutate(c.id)}><Play className="w-3.5 h-3.5" /></Button>}</div></td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="text-sm">{editCampaign ? 'Edit Campaign' : 'New Campaign'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Segment</Label><Input value={form.segmentName} onChange={e => setForm({ ...form, segmentName: e.target.value })} disabled={!!editCampaign} className="h-8 text-xs bg-white/[0.03] border-white/10" /></div>
            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Type</Label><Select value={form.campaignType} onValueChange={(v) => setForm({ ...form, campaignType: v })}><SelectTrigger className="h-8 text-xs bg-white/[0.03] border-white/10"><SelectValue /></SelectTrigger><SelectContent>{CAMPAIGN_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="h-8 text-xs bg-white/[0.03] border-white/10" /></div>
            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="text-xs bg-white/[0.03] border-white/10" /></div>
            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Owner</Label><Input value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} className="h-8 text-xs bg-white/[0.03] border-white/10" /></div>
            {form.campaignType === 'discount' && <div className="space-y-1"><Label className="text-xs text-muted-foreground">Discount Code</Label><Input value={form.discountCode} onChange={e => setForm({ ...form, discountCode: e.target.value })} placeholder="e.g. SAVE20" className="h-8 text-xs bg-white/[0.03] border-white/10" /></div>}
            {form.campaignType === 'email' && <div className="space-y-1"><Label className="text-xs text-muted-foreground">Email Template</Label><Textarea value={form.emailTemplate} onChange={e => setForm({ ...form, emailTemplate: e.target.value })} className="text-xs bg-white/[0.03] border-white/10" /></div>}
            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Scheduled Date</Label><Input type="datetime-local" value={form.scheduledDate} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} className="h-8 text-xs bg-white/[0.03] border-white/10" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowEditor(false)}>Cancel</Button>
            <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={submit} disabled={createMut.isPending || updateMut.isPending}>{(createMut.isPending || updateMut.isPending) ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving...</> : 'Save Campaign'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

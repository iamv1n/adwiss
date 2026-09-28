"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Clock, Plus, Search, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, InlineEmpty, errorMessage } from "@/components/app/analytics/states";
import { formatMoney, formatNumber, formatPercent, formatRoas } from "@/components/app/analytics/format";
import { useCampaigns } from "@/lib/entities-api";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  useCreateLead,
  useLeadSetup,
  useLeadSummary,
  useLeads,
  type Lead,
  type LeadFilter,
  type LeadStatus,
  type SummaryRow,
} from "@/lib/leads-api";
import { canManage } from "@/lib/automation-api";
import { useActiveOrg } from "@/lib/queries";
import { cn, timeAgo } from "@/lib/utils";
import { LeadSheet } from "./lead-sheet";
import { LeadStatusPill } from "./lead-bits";
import { InstantLeadsStep, LeadSetupPanel } from "./lead-setup";

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
] as const;

function isoDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeFor(days: number) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - (days - 1));
  return { from: isoDay(from), to: isoDay(to) };
}

/** Money in the row's currency; "—" when it is unknown or mixed. */
function money(v: number | null | undefined, currency: string) {
  return currency === "mixed" ? "—" : formatMoney(v, currency || null);
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-xs">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold text-fg tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

export function LeadsView() {
  const org = useActiveOrg();
  const orgId = org?.id;
  const [days, setDays] = useState<number>(30);
  const range = useMemo(() => rangeFor(days), [days]);
  const [status, setStatus] = useState<LeadStatus | undefined>();
  const [campaignId, setCampaignId] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Lead | null>(null);
  const [adding, setAdding] = useState(false);
  const [showCampaigns, setShowCampaigns] = useState(false);
  const [instantOpen, setInstantOpen] = useState(false);

  const filter: LeadFilter = { ...range, status, campaign_id: campaignId, q: search.trim() || undefined };
  const leads = useLeads(orgId, filter);
  const summary = useLeadSummary(orgId, range.from, range.to);
  const setup = useLeadSetup(orgId);
  const rows = leads.data?.pages.flatMap((p) => p.leads) ?? [];
  const t = summary.data?.totals;
  const cur = t?.currency ?? "";

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Leads"
        description="Leads from your Meta lead forms arrive here automatically. Mark them won with a deal value to see which ads bring buyers."
        actions={
          <>
            {setup.data?.ad_types?.includes("lead_forms") && (
              <button
                type="button"
                onClick={() => setInstantOpen(true)}
                title={setup.data.instant_leads.enabled ? "Meta pushes new leads within seconds" : "New leads are imported every hour"}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  setup.data.instant_leads.enabled
                    ? "border-success bg-success-subtle text-success-fg"
                    : "border-border bg-surface text-fg-muted hover:border-primary/60",
                )}
              >
                {setup.data.instant_leads.enabled ? <Zap className="size-3.5" aria-hidden="true" /> : <Clock className="size-3.5" aria-hidden="true" />}
                {setup.data.instant_leads.enabled ? "Instant" : "Hourly"}
              </button>
            )}
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger size="sm" aria-label="Date range" className="h-8 min-w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.days} value={String(r.days)}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" /> Add lead
            </Button>
          </>
        }
      />

      {setup.data && (
        <Dialog open={instantOpen} onOpenChange={setInstantOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Get leads instantly</DialogTitle>
              <DialogDescription>Meta can push each new lead-form lead to Adwise as it arrives.</DialogDescription>
            </DialogHeader>
            <InstantLeadsStep setup={setup.data} admin={canManage(org?.role)} />
          </DialogContent>
        </Dialog>
      )}

      {setup.data && !setup.data.complete && (
        <section aria-labelledby="lead-setup-h" className="rounded-xl border border-primary/40 bg-surface p-4 shadow-xs">
          <h2 id="lead-setup-h" className="mb-3 font-display text-base font-semibold text-fg">
            Finish setting up leads
          </h2>
          <LeadSetupPanel setup={setup.data} />
        </section>
      )}

      {summary.error ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Leads" value={formatNumber(t?.leads)} />
          <Stat label="Won" value={formatNumber(t?.won)} hint={t?.win_rate != null ? `${formatPercent(t.win_rate)} win rate` : undefined} />
          <Stat label="Deal value" value={money(t?.won_value, cur)} />
          <Stat label="Cost per lead" value={money(t?.cost_per_lead, cur)} />
          <Stat label="Cost per deal" value={money(t?.cost_per_won, cur)} />
          <Stat label="Real ROAS" value={formatRoas(t?.roas)} hint="Deal value ÷ spend" />
        </div>
      )}

      {summary.data && summary.data.campaigns.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          <button
            type="button"
            onClick={() => setShowCampaigns((v) => !v)}
            aria-expanded={showCampaigns}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-fg hover:bg-bg-subtle/60"
          >
            By campaign
            <ChevronDown className={cn("size-4 text-fg-subtle transition-transform", showCampaigns && "rotate-180")} aria-hidden="true" />
          </button>
          {showCampaigns && <CampaignTable rows={summary.data.campaigns} onPick={(id) => setCampaignId(id)} />}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Status">
          {([undefined, ...LEAD_STATUSES] as (LeadStatus | undefined)[]).map((s) => {
            const n = s ? t?.by_status[s] : t?.leads;
            return (
              <button
                key={s ?? "all"}
                type="button"
                role="tab"
                aria-selected={status === s}
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  status === s ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-bg-subtle",
                )}
              >
                {s ? LEAD_STATUS_LABELS[s] : "All"}
                {n != null && <span className="ml-1 text-fg-subtle tabular-nums">{n}</span>}
              </button>
            );
          })}
        </div>
        {campaignId && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCampaignId(undefined)}>
            {summary.data?.campaigns.find((c) => c.campaign_id === campaignId)?.campaign_name ?? "Campaign"} ✕
          </Button>
        )}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, email, notes"
            aria-label="Search leads"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        {leads.error ? (
          <ErrorState error={leads.error} onRetry={() => leads.refetch()} className="m-3" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="bg-bg-subtle text-left text-xs text-fg-muted">
                <tr className="[&>th]:h-8 [&>th]:px-3 [&>th]:font-medium">
                  <th>Lead</th>
                  <th>Campaign / ad</th>
                  <th className="w-32">Received</th>
                  <th className="w-28">Status</th>
                  <th className="w-32 text-right">Deal value</th>
                </tr>
              </thead>
              <tbody>
                {leads.isLoading ? (
                  <tr>
                    <td colSpan={5}>
                      <InlineEmpty>Loading leads…</InlineEmpty>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <InlineEmpty>
                        {status || campaignId || search
                          ? "No leads match these filters."
                          : "No leads in this period. Leads from Meta lead-form campaigns appear here after each sync."}
                      </InlineEmpty>
                    </td>
                  </tr>
                ) : (
                  rows.map((l) => (
                    <tr
                      key={l.id}
                      onClick={() => setOpen(l)}
                      className="cursor-pointer border-t border-border hover:bg-bg-subtle/60 [&>td]:px-3 [&>td]:py-2"
                    >
                      <td>
                        <button type="button" className="text-left font-medium text-fg hover:text-primary" onClick={() => setOpen(l)}>
                          {l.name || "Unnamed lead"}
                        </button>
                        <p className="text-xs text-fg-muted">{[l.phone, l.email].filter(Boolean).join(" · ") || "—"}</p>
                      </td>
                      <td className="max-w-80">
                        <p className="truncate text-fg">{l.campaign_name ?? <span className="text-fg-subtle">Not linked</span>}</p>
                        {l.ad_name && <p className="truncate text-xs text-fg-muted">{l.ad_name}</p>}
                      </td>
                      <td className="text-xs text-fg-muted">{timeAgo(l.lead_created_at)}</td>
                      <td>
                        <LeadStatusPill status={l.status} />
                      </td>
                      <td className="text-right tabular-nums">{l.value != null ? formatMoney(l.value, l.currency || null) : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {leads.hasNextPage && (
          <div className="border-t border-border p-2 text-center">
            <Button variant="ghost" size="sm" onClick={() => leads.fetchNextPage()} disabled={leads.isFetchingNextPage}>
              Load more
            </Button>
          </div>
        )}
      </div>

      {orgId && <LeadSheet orgId={orgId} lead={open} onClose={() => setOpen(null)} />}
      {orgId && adding && <AddLeadDialog orgId={orgId} onClose={() => setAdding(false)} />}
    </div>
  );
}

function CampaignTable({ rows, onPick }: { rows: SummaryRow[]; onPick: (id: string) => void }) {
  return (
    <div className="overflow-x-auto border-t border-border">
      <table className="w-full min-w-[52rem] text-sm">
        <thead className="bg-bg-subtle text-left text-xs text-fg-muted">
          <tr className="[&>th]:h-8 [&>th]:px-3 [&>th]:font-medium [&>th:not(:first-child)]:text-right">
            <th>Campaign</th>
            <th>Spend</th>
            <th>Leads</th>
            <th>Cost / lead</th>
            <th>Won</th>
            <th>Cost / deal</th>
            <th>Deal value</th>
            <th>ROAS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.campaign_id ?? "none"} className="border-t border-border [&>td]:px-3 [&>td]:py-2 [&>td:not(:first-child)]:text-right [&>td]:tabular-nums">
              <td className="max-w-72 truncate">
                {r.campaign_id ? (
                  <button type="button" className="text-left text-fg hover:text-primary" onClick={() => onPick(r.campaign_id!)}>
                    {r.campaign_name ?? "Campaign"}
                  </button>
                ) : (
                  <span className="text-fg-muted">Not linked to a campaign</span>
                )}
              </td>
              <td>{money(r.spend, r.currency)}</td>
              <td>{formatNumber(r.leads)}</td>
              <td>{money(r.cost_per_lead, r.currency)}</td>
              <td>{formatNumber(r.won)}</td>
              <td>{money(r.cost_per_won, r.currency)}</td>
              <td>{money(r.won_value, r.currency)}</td>
              <td className={cn(r.leads === 0 && r.spend ? "text-danger-fg" : undefined)}>{formatRoas(r.roas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NO_CAMPAIGN = "none";

function AddLeadDialog({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const create = useCreateLead(orgId);
  const campaigns = useCampaigns(orgId, { limit: 200 });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [campaignId, setCampaignId] = useState(NO_CAMPAIGN);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        campaign_id: campaignId === NO_CAMPAIGN ? undefined : campaignId,
      },
      {
        onSuccess: () => {
          toast.success("Lead added");
          onClose();
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add lead</DialogTitle>
            <DialogDescription>For leads from calls, WhatsApp or walk-ins. Link the campaign that brought them in.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1">
            <Label htmlFor="new-lead-name">Name</Label>
            <Input id="new-lead-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} autoFocus />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="new-lead-phone">Phone</Label>
              <Input id="new-lead-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-lead-email">Email</Label>
              <Input id="new-lead-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="new-lead-campaign">Campaign</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger id="new-lead-campaign">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CAMPAIGN}>Not from a campaign</SelectItem>
                {(campaigns.data?.rows ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              Add lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

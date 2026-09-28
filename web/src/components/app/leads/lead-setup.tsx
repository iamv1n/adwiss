"use client";

import { useState } from "react";
import {
  AppWindow,
  Check,
  ClipboardList,
  Globe,
  Loader2,
  MessageCircle,
  Plug,
  ShoppingCart,
  Store,
  Tv,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/components/app/analytics/states";
import { canManage } from "@/lib/automation-api";
import {
  useEnableInstantLeads,
  useSetAdTypes,
  useLeadSetup,
  type AdType,
  type InstantLeadsPage,
  type LeadSetup,
} from "@/lib/leads-api";
import { useActiveOrg, useConnectProvider } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const AD_TYPE_OPTIONS: { id: AdType; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "online_sales", label: "Online sales", hint: "People buy on your website or store", icon: ShoppingCart },
  { id: "lead_forms", label: "Lead form ads", hint: "People fill a form on Facebook or Instagram", icon: ClipboardList },
  { id: "messages", label: "WhatsApp, Messenger or call ads", hint: "People message or call you", icon: MessageCircle },
  { id: "website_leads", label: "Website sign-ups or bookings", hint: "Enquiries, demos, appointments on your site", icon: Globe },
  { id: "app_installs", label: "App installs", hint: "People install your app", icon: AppWindow },
  { id: "store_visits", label: "Store visits", hint: "People visit your shop, clinic or office", icon: Store },
  { id: "awareness", label: "Awareness or video", hint: "Reach and views, no direct sale", icon: Tv },
];

/** Multi-select of the kinds of ads the org runs. */
export function AdTypePicker({ value, onChange }: { value: AdType[]; onChange: (v: AdType[]) => void }) {
  const toggle = (id: AdType) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Kinds of ads you run">
      {AD_TYPE_OPTIONS.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => toggle(o.id)}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
              on ? "border-primary bg-accent/60" : "border-border bg-surface hover:border-primary/60",
            )}
          >
            <o.icon className={cn("mt-0.5 size-4 shrink-0", on ? "text-primary" : "text-fg-subtle")} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-fg">{o.label}</span>
              <span className="block text-xs text-fg-muted">{o.hint}</span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
              )}
            >
              {on && <Check className="size-3" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StepHeading({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-medium text-fg">
      <span
        className={cn(
          "grid size-5 place-items-center rounded-full text-xs",
          done ? "bg-success text-white" : "bg-accent text-accent-fg",
        )}
      >
        {done ? <Check className="size-3" aria-hidden="true" /> : n}
      </span>
      {children}
    </h3>
  );
}

/**
 * The lead setup checklist: (1) what kinds of ads you run, (2) for lead-form
 * ads, give Adwise access to the leads. Shown until complete.
 */
export function LeadSetupPanel({ setup, onDone }: { setup: LeadSetup; onDone?: () => void }) {
  const org = useActiveOrg();
  const orgId = org?.id ?? "";
  const admin = canManage(org?.role);
  const save = useSetAdTypes(orgId);
  const connect = useConnectProvider(orgId);
  const [editing, setEditing] = useState(setup.ad_types === null);
  const [types, setTypes] = useState<AdType[]>(setup.ad_types ?? []);

  const answered = setup.ad_types !== null && !editing;
  const needsLeads = (setup.ad_types ?? []).includes("lead_forms");
  const accessStep = setup.pending.find((p) => p === "connect_meta" || p === "grant_lead_access");

  const submit = () =>
    save.mutate(types, {
      onSuccess: (s) => {
        setEditing(false);
        if (s.complete) {
          toast.success("Lead setup complete");
          onDone?.();
        }
      },
      onError: (e) => toast.error(errorMessage(e)),
    });

  return (
    <div className="grid gap-5">
      <section className="grid gap-3">
        <StepHeading n={1} done={answered}>
          What kinds of ads do you run?
        </StepHeading>
        {answered ? (
          <div className="flex flex-wrap items-center gap-1.5 pl-7">
            {(setup.ad_types ?? []).map((t) => (
              <span key={t} className="rounded-full bg-bg-subtle px-2.5 py-0.5 text-xs text-fg">
                {AD_TYPE_OPTIONS.find((o) => o.id === t)?.label ?? t}
              </span>
            ))}
            {admin && (
              <Button variant="link" size="sm" className="h-auto px-1 text-xs" onClick={() => setEditing(true)}>
                Change
              </Button>
            )}
          </div>
        ) : admin ? (
          <div className="grid gap-3 pl-7">
            <p className="text-xs text-fg-muted">Choose all that apply. This decides how Adwise counts your results and revenue.</p>
            <AdTypePicker value={types} onChange={setTypes} />
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={types.length === 0 || save.isPending}>
                {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                Save
              </Button>
              {setup.ad_types !== null && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="pl-7 text-sm text-fg-muted">Ask an admin or owner of your organization to answer this.</p>
        )}
      </section>

      {answered && needsLeads && (
        <section className="grid gap-2">
          <StepHeading n={2} done={!accessStep}>
            Let Adwise read your lead-form leads
          </StepHeading>
          <div className="grid gap-2 pl-7 text-sm">
            {!accessStep ? (
              <p className="text-fg-muted">Done. New leads arrive with every sync.</p>
            ) : (
              <>
                <p className="text-fg-muted">
                  {accessStep === "connect_meta"
                    ? "Connect Meta so Adwise can import leads from your lead form ads."
                    : "Your Meta connection was made before Adwise could read leads. Reconnect and allow access to leads and Pages."}
                </p>
                {admin ? (
                  <Button size="sm" className="justify-self-start" onClick={() => connect.mutate("meta")} disabled={connect.isPending}>
                    {connect.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plug aria-hidden="true" />}
                    {accessStep === "connect_meta" ? "Connect Meta" : "Reconnect Meta"}
                  </Button>
                ) : (
                  <p className="text-fg-muted">Ask an admin or owner to reconnect Meta.</p>
                )}
                {connect.error && <p className="text-xs text-danger-fg">{errorMessage(connect.error)}</p>}
              </>
            )}
          </div>
        </section>
      )}

      {answered && needsLeads && !accessStep && (
        <section className="grid gap-2">
          <StepHeading n={3} done={setup.instant_leads.enabled}>
            Get leads instantly <span className="text-xs font-normal text-fg-subtle">(optional)</span>
          </StepHeading>
          <div className="pl-7">
            <InstantLeadsStep setup={setup} admin={admin} />
          </div>
        </section>
      )}

      {answered && !needsLeads && (setup.ad_types ?? []).some((t) => t === "messages" || t === "store_visits" || t === "website_leads") && (
        <p className="rounded-lg bg-bg-subtle px-3 py-2 text-xs text-fg-muted">
          Leads from calls, chats, visits or your website can be added on the Leads page, linked to the campaign that brought them.
        </p>
      )}
    </div>
  );
}

/**
 * Optional step: subscribe the org's Facebook Pages to Meta's lead webhook so
 * new leads arrive within seconds instead of with the hourly sync.
 */
export function InstantLeadsStep({ setup, admin }: { setup: LeadSetup; admin: boolean }) {
  const orgId = useActiveOrg()?.id;
  const enable = useEnableInstantLeads(orgId);
  const [pages, setPages] = useState<InstantLeadsPage[] | null>(null);
  const on = setup.instant_leads.enabled;

  const run = () =>
    enable.mutate(undefined, {
      onSuccess: (p) => {
        setPages(p);
        const ok = p.filter((x) => x.ok).length;
        if (ok > 0) toast.success(`Instant leads on for ${ok} Page${ok === 1 ? "" : "s"}`);
        else toast.error(p.length === 0 ? "No Facebook Pages found for your Meta connection" : "No Page could be subscribed");
      },
      onError: (e) => toast.error(errorMessage(e)),
    });

  return (
    <div className="grid gap-2 text-sm">
      <p className="text-fg-muted">
        {on
          ? `On for ${setup.instant_leads.pages} Page${setup.instant_leads.pages === 1 ? "" : "s"}. New leads arrive within seconds.`
          : "Leads now arrive every hour. Turn this on to get each lead within seconds, so you can call while they are still interested."}
      </p>
      {admin ? (
        <Button size="sm" variant={on ? "outline" : "default"} className="justify-self-start" onClick={run} disabled={enable.isPending}>
          {enable.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Zap aria-hidden="true" />}
          {on ? "Check Pages again" : "Get leads instantly"}
        </Button>
      ) : (
        !on && <p className="text-fg-muted">Ask an admin or owner to turn this on.</p>
      )}
      {pages && pages.length > 0 && (
        <ul className="grid gap-1" aria-label="Facebook Pages">
          {pages.map((p) => (
            <li key={p.id} className="flex items-start gap-2 text-xs">
              {p.ok ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-success-fg" aria-hidden="true" />
              ) : (
                <X className="mt-0.5 size-3.5 shrink-0 text-danger-fg" aria-hidden="true" />
              )}
              <span className="min-w-0">
                <span className="font-medium text-fg">{p.name || p.id}</span>
                <span className="text-fg-muted">{p.ok ? " — subscribed" : ` — ${p.error ?? "failed"}`}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SNOOZE_KEY = (orgId: string) => `adwise.lead-setup-snooze.${orgId}`;
const SNOOZE_MS = 24 * 60 * 60 * 1000;

function snoozed(orgId: string) {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY(orgId)));
    return until > Date.now();
  } catch {
    return false;
  }
}

/**
 * Dashboard reminder shown to every org whose lead setup is incomplete,
 * including those that skipped it at sign-up. "Remind me later" hides it for
 * a day; it comes back until the setup is done.
 */
export function LeadSetupBanner() {
  const org = useActiveOrg();
  const orgId = org?.id;
  const setup = useLeadSetup(orgId);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // The query has no data during server rendering, so reading storage here is client-only.
  if (!orgId || !setup.data || setup.data.complete || dismissed || snoozed(orgId)) return null;
  const s = setup.data;
  const title =
    s.pending[0] === "ad_types" ? "Tell Adwise what kinds of ads you run" : "Let Adwise read your lead-form leads";
  const body =
    s.pending[0] === "ad_types"
      ? "One question, so results, revenue and suggestions match your business."
      : "Reconnect Meta to import leads automatically and see which ads bring buyers.";

  const snooze = () => {
    try {
      localStorage.setItem(SNOOZE_KEY(orgId), String(Date.now() + SNOOZE_MS));
    } catch {
      // Storage unavailable: hide for this visit only.
    }
    setDismissed(true);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-accent/40 px-4 py-3">
        <ClipboardList className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-[12rem] flex-1">
          <p className="text-sm font-medium text-fg">{title}</p>
          <p className="text-xs text-fg-muted">{body}</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          Finish setup
        </Button>
        <Button size="sm" variant="ghost" onClick={snooze}>
          Remind me later
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Set up leads and results</DialogTitle>
            <DialogDescription>Takes a minute. You can change it later on the Leads page.</DialogDescription>
          </DialogHeader>
          <LeadSetupPanel setup={s} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

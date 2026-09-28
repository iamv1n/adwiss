"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, CircleDashed, PartyPopper, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LeadSetupPanel } from "@/components/app/leads/lead-setup";
import { suggestLessons } from "@/lib/ad-profile";
import { canManage, useRules } from "@/lib/automation-api";
import { ALL_LESSON_KEYS } from "@/lib/learn/course";
import { useLearnProgress } from "@/lib/learn/progress";
import { useLeadSetup, type LeadSetup } from "@/lib/leads-api";
import { useActiveOrg, useAdAccounts, useIntegrations, useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";

type StepId = "connect" | "sync" | "ad_types" | "rule" | "lesson";

export interface OnboardingStep {
  id: StepId;
  title: string;
  why: string;
  done: boolean;
  /** Needs an owner or admin. */
  adminOnly: boolean;
  cta: { label: string; href: string } | { label: string; action: "lead_setup" };
}

export interface Onboarding {
  /** Every source loaded; nothing is shown before, to avoid a flash. */
  ready: boolean;
  steps: OnboardingStep[];
  doneCount: number;
  allDone: boolean;
  /** The checklist is on screen (not hidden, not finished and already celebrated). */
  visible: boolean;
  /** Show the one-time "You're all set" state. */
  celebrate: boolean;
  isAdmin: boolean;
  leadSetup: LeadSetup | undefined;
  hide: () => void;
}

const storageKey = (kind: "hidden" | "celebrated", orgId: string, userId: string) =>
  `adwise.onboarding.${kind}.${orgId}.${userId}`;

/** org.user scopes whose "You're all set" was first shown during this page load. */
const celebratingNow = new Set<string>();

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Storage unavailable: remembered for this visit only.
  }
}

/** Derives the checklist from real org data. Shared by the dashboard so the lead banner doesn't repeat a step. */
export function useOnboarding(): Onboarding {
  const me = useMe();
  const org = useActiveOrg();
  const orgId = org?.id;
  const userId = me.data?.user.id;
  const isAdmin = canManage(org?.role);

  const integrations = useIntegrations(orgId);
  const accounts = useAdAccounts(orgId);
  const setup = useLeadSetup(orgId);
  const rules = useRules(orgId);
  const progress = useLearnProgress();
  // Bumped to re-read storage after "Hide" in this tab.
  const [, setTick] = useState(0);

  const settled = (q: { isPending: boolean; isError: boolean }) => !q.isPending || q.isError;
  const ready =
    !!orgId && !!userId && settled(integrations) && settled(accounts) && settled(setup) && settled(rules) && settled(progress);

  const list = integrations.data?.integrations ?? [];
  const accs = accounts.data?.accounts ?? [];
  const connected = list.some((i) => i.status === "active");
  const syncing = accs.filter((a) => a.sync_enabled);
  const syncedOnce = syncing.some((a) => a.last_synced_at);
  const adTypesAnswered = setup.data ? setup.data.ad_types !== null : false;
  const hasRule = (rules.data?.rules.length ?? 0) > 0;
  const lessonDone = progress.done.size > 0;

  const firstLesson =
    suggestLessons({
      adTypes: setup.data?.ad_types,
      hasGoogle: list.some((i) => i.provider === "google" && i.status === "active"),
      done: progress.done,
      allKeys: ALL_LESSON_KEYS,
      max: 1,
      min: 1,
    })[0] ?? ALL_LESSON_KEYS[0];
  const lessonHref = firstLesson ? `/app/learn/${firstLesson.replace(".", "/")}` : "/app/learn";

  const steps: OnboardingStep[] = [
    {
      id: "connect",
      title: "Connect Meta or Google",
      why: "Adwise imports your campaigns and results from your ad accounts.",
      done: connected,
      adminOnly: true,
      cta: { label: "Connect", href: "/app/integrations" },
    },
    {
      id: "sync",
      title: "Turn on sync for an ad account",
      why:
        syncing.length > 0 && !syncedOnce
          ? "Sync is on. The first import can take a few minutes."
          : "Pick the accounts to import so the dashboard fills with real numbers.",
      done: syncing.length > 0,
      adminOnly: true,
      cta: { label: "Choose accounts", href: "/app/integrations" },
    },
    {
      id: "ad_types",
      title: "Tell us what kinds of ads you run",
      why: "So the dashboard, rules and lessons match your business.",
      done: adTypesAnswered,
      adminOnly: true,
      cta: { label: "Answer", action: "lead_setup" },
    },
    {
      id: "rule",
      title: "Create your first rule in dry run",
      why: "See what a rule would pause or scale before it touches real ads.",
      done: hasRule,
      adminOnly: true,
      cta: { label: "Create a rule", href: "/app/automations" },
    },
    {
      id: "lesson",
      title: "Finish your first lesson",
      why: "Short, practical lessons on reading results and spending well.",
      done: lessonDone,
      adminOnly: false,
      cta: { label: "Start lesson", href: lessonHref },
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const scope = orgId && userId ? `${orgId}.${userId}` : null;
  const hidden = ready && orgId && userId ? readFlag(storageKey("hidden", orgId, userId)) : false;
  const celebrated = ready && orgId && userId ? readFlag(storageKey("celebrated", orgId, userId)) : false;
  const celebrate = ready && allDone && !hidden && (!celebrated || (!!scope && celebratingNow.has(scope)));

  // Show "You're all set" once: mark it seen, but keep it for this visit.
  useEffect(() => {
    if (celebrate && orgId && userId && !celebrated) {
      celebratingNow.add(`${orgId}.${userId}`);
      writeFlag(storageKey("celebrated", orgId, userId));
    }
  }, [celebrate, celebrated, orgId, userId]);

  return {
    ready,
    steps,
    doneCount,
    allDone,
    visible: ready && !hidden && (!allDone || celebrate),
    celebrate,
    isAdmin,
    leadSetup: setup.data,
    hide: () => {
      if (orgId && userId) writeFlag(storageKey("hidden", orgId, userId));
      if (scope) celebratingNow.delete(scope);
      setTick((t) => t + 1);
    },
  };
}

const rowClass = "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 text-sm";

export function OnboardingChecklist({ onboarding: o }: { onboarding: Onboarding }) {
  const [open, setOpen] = useState(true);
  const [setupOpen, setSetupOpen] = useState(false);

  if (!o.visible) return null;
  const total = o.steps.length;

  if (o.celebrate) {
    return (
      <section
        aria-label="Getting started"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-success/50 bg-success-subtle px-4 py-3"
      >
        <PartyPopper className="size-5 shrink-0 text-success" aria-hidden="true" />
        <div className="min-w-[12rem] flex-1">
          <p className="text-sm font-medium text-success-fg">You&apos;re all set</p>
          <p className="text-xs text-fg-muted">Every getting-started step is done. This won&apos;t show again.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={o.hide}>
          Dismiss
        </Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="onboarding-heading" className="rounded-xl border border-border bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-[10rem] flex-1">
          <h2 id="onboarding-heading" className="font-display text-base font-semibold text-fg">
            Get started with Adwise
          </h2>
          <p className="text-sm text-fg-muted">
            {o.doneCount} of {total} done
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={o.hide}>
          <X aria-hidden="true" />
          Hide checklist
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={open}
          aria-controls="onboarding-steps"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Collapse" : "Show steps"}
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} aria-hidden="true" />
        </Button>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-subtle"
        role="progressbar"
        aria-label="Getting started progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={o.doneCount}
        aria-valuetext={`${o.doneCount} of ${total} done`}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${(o.doneCount / total) * 100}%` }}
        />
      </div>

      {open && (
        <ol id="onboarding-steps" className="mt-3 grid gap-1">
          {o.steps.map((st) => {
            const canDo = !st.adminOnly || o.isAdmin;
            return (
              <li key={st.id} className={cn(rowClass, !st.done && "hover:bg-bg-subtle/60")}>
                {st.done ? (
                  <span className="grid size-4 shrink-0 place-items-center rounded-full bg-success text-on-status">
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                ) : (
                  <CircleDashed className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1 basis-48">
                  <p className={cn("font-medium", st.done ? "text-fg-muted line-through decoration-fg-subtle" : "text-fg")}>
                    {st.title}
                    <span className="sr-only">{st.done ? " (done)" : " (to do)"}</span>
                  </p>
                  {!st.done && <p className="text-xs text-fg-muted">{st.why}</p>}
                </div>
                {!st.done &&
                  (!canDo ? (
                    <span className="flex items-center gap-1 text-xs text-fg-subtle">
                      <UserRound className="size-3.5" aria-hidden="true" />
                      Ask an admin
                    </span>
                  ) : "href" in st.cta ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={st.cta.href}>
                        {st.cta.label}
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setSetupOpen(true)} disabled={!o.leadSetup}>
                      {st.cta.label}
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  ))}
              </li>
            );
          })}
        </ol>
      )}

      {o.leadSetup && (
        <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Set up leads and results</DialogTitle>
              <DialogDescription>Takes a minute. You can change it later on the Leads page.</DialogDescription>
            </DialogHeader>
            <LeadSetupPanel setup={o.leadSetup} onDone={() => setSetupOpen(false)} />
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

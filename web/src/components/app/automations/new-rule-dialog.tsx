"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Plus, Workflow } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RuleInput } from "@/lib/automation-api";
import { orderByRecommendation, recommendedTemplateIds } from "@/lib/ad-profile";
import { useLeadSetup } from "@/lib/leads-api";
import { useActiveOrg } from "@/lib/queries";
import { canManage } from "@/lib/automation-api";
import { useSaveTargets, useTargets } from "@/lib/recommendations-api";
import { DEFAULT_TARGETS, RULE_TEMPLATES, TEMPLATE_GROUPS, type RuleTemplate, type Targets } from "./templates";

const TARGETS_KEY = "adwise.automation-targets";

function loadTargets(): Targets {
  try {
    if (typeof window === "undefined") return DEFAULT_TARGETS;
    const raw = localStorage.getItem(TARGETS_KEY);
    if (!raw) return DEFAULT_TARGETS;
    const t = JSON.parse(raw) as Partial<Targets>;
    return {
      cpa: typeof t.cpa === "number" && t.cpa > 0 ? t.cpa : DEFAULT_TARGETS.cpa,
      roas: typeof t.roas === "number" && t.roas > 0 ? t.roas : DEFAULT_TARGETS.roas,
    };
  } catch {
    return DEFAULT_TARGETS;
  }
}

const cardClass =
  "group flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-left shadow-xs transition-colors hover:border-primary/60 disabled:opacity-60";

function TemplateCard({ t, targets, disabled, onPick, recommended = false }: {
  t: RuleTemplate;
  recommended?: boolean;
  targets: Targets;
  disabled: boolean;
  onPick: (seed: RuleInput) => void;
}) {
  const Icon = t.href ? CalendarClock : Workflow;
  const body = (
    <>
      <Icon className="mt-0.5 size-4 shrink-0 text-fg-subtle group-hover:text-primary" aria-hidden="true" />
      <span className="grid min-w-0 gap-0.5">
        <span className="block text-sm font-medium text-fg">
          {t.title}
          {recommended && (
            <span className="ml-2 inline-block rounded-full bg-accent px-2 py-0.5 align-middle text-[11px] font-medium text-accent-fg">
              Recommended for you
            </span>
          )}
        </span>
        <span className="block text-xs text-fg-muted">{t.blurb(targets)}</span>
        <span className="block text-xs text-fg-subtle">{t.why}</span>
      </span>
    </>
  );
  return t.href ? (
    <Link href={t.href} className={cardClass}>
      {body}
    </Link>
  ) : (
    <button type="button" disabled={disabled} onClick={() => onPick(t.input(targets))} className={cardClass}>
      {body}
    </button>
  );
}

/**
 * "New rule" picker: start blank or from a template, with template thresholds
 * derived from the user's target CPA and ROAS.
 */
export function NewRuleDialog({ open, onOpenChange, onPick }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (seed?: RuleInput) => void;
}) {
  // Opened only after the org loads on the client, so storage is available.
  // Targets live on the server (GET/PUT /orgs/{id}/targets; the recommendations
  // inbox uses them too). localStorage is only a fallback for unset targets.
  const org = useActiveOrg();
  const serverTargets = useTargets(org?.id);
  const saveTargets = useSaveTargets(org?.id);
  const [localTargets, setTargets] = useState<Targets>(loadTargets);
  const st = serverTargets.data?.targets;
  const targets: Targets = {
    cpa: st?.target_cpa ?? localTargets.cpa,
    roas: st?.target_roas ?? localTargets.roas,
  };
  // Templates that fit the kinds of ads the org runs go first in each group, and those groups first.
  const setup = useLeadSetup(org?.id);
  const recommended = recommendedTemplateIds(setup.data?.ad_types);
  const groups = orderByRecommendation(
    TEMPLATE_GROUPS,
    recommended.map((id) => RULE_TEMPLATES.find((t) => t.id === id)?.group ?? ""),
  );

  const update = (key: keyof Targets, raw: string) => {
    const v = Number(raw);
    if (!(v > 0)) return;
    const next = { ...targets, [key]: v };
    setTargets(next);
    try {
      localStorage.setItem(TARGETS_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable: keep the values for this visit only.
    }
    // Admins save for the whole organization; members keep a local copy.
    if (canManage(org?.role) && v !== (key === "cpa" ? st?.target_cpa : st?.target_roas)) {
      // Only the edited target is set; the other keeps its saved value (or stays unset).
      saveTargets.mutate({
        currency: st?.currency,
        target_cpa: key === "cpa" ? v : (st?.target_cpa ?? null),
        target_roas: key === "roas" ? v : (st?.target_roas ?? null),
      });
    }
  };

  const pick = (seed?: RuleInput) => {
    onOpenChange(false);
    onPick(seed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[85vh] grid-rows-[auto_1fr] gap-4 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>New rule</DialogTitle>
          <DialogDescription>Start from scratch or from a template. New rules run in dry run until you switch them live.</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto pr-2">
          <button type="button" onClick={() => pick()} className={cardClass}>
            <Plus className="mt-0.5 size-4 shrink-0 text-fg-subtle group-hover:text-primary" aria-hidden="true" />
            <span className="grid min-w-0 gap-0.5">
              <span className="block text-sm font-medium text-fg">Blank rule</span>
              <span className="block text-xs text-fg-muted">Choose your own conditions and action.</span>
            </span>
          </button>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <h3 className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Or start from a template</h3>
            <div className="flex items-end gap-3">
              <div className="grid gap-1">
                <Label htmlFor="target-cpa" className="text-xs text-fg-muted">Target CPA (₹)</Label>
                <Input
                  id="target-cpa"
                  type="number"
                  min={1}
                  step={50}
                  key={`cpa-${targets.cpa}`}
                  defaultValue={targets.cpa}
                  onBlur={(e) => update("cpa", e.target.value)}
                  className="h-8 w-28"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="target-roas" className="text-xs text-fg-muted">Target ROAS (×)</Label>
                <Input
                  id="target-roas"
                  type="number"
                  min={0.1}
                  step={0.1}
                  key={`roas-${targets.roas}`}
                  defaultValue={targets.roas}
                  onBlur={(e) => update("roas", e.target.value)}
                  className="h-8 w-24"
                />
              </div>
            </div>
          </div>

          {groups.map((g) => (
            <div key={g.id} className="grid gap-2">
              <h4 className="text-sm font-medium text-fg">{g.label}</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {orderByRecommendation(RULE_TEMPLATES.filter((t) => t.group === g.id), recommended).map((t) => (
                  <TemplateCard
                    key={t.id}
                    t={t}
                    targets={targets}
                    disabled={false}
                    onPick={pick}
                    recommended={recommended.includes(t.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

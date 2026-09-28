"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill } from "@/components/app/integrations/status-pill";
import { ErrorState, errorMessage } from "@/components/app/analytics/states";
import { isNotLive } from "@/components/app/actions/action-bits";
import { canManage, useDeleteRule, useRules, useSaveRule, type Rule, type RuleInput } from "@/lib/automation-api";
import { useActiveOrg } from "@/lib/queries";
import { cn, timeAgo } from "@/lib/utils";
import { conditionText, cooldownLabel, intervalLabel } from "./templates";
import { RuleBuilderSheet } from "./rule-builder";
import { NewRuleDialog } from "./new-rule-dialog";

const ACTION_TEXT: Record<Rule["action"]["type"], (v?: number) => string> = {
  pause: () => "Pause",
  activate: () => "Activate",
  increase_budget: (v) => `Budget +${v ?? 0}%`,
  decrease_budget: (v) => `Budget −${v ?? 0}%`,
  set_budget: (v) => `Budget = ₹${(v ?? 0).toLocaleString()}`,
  notify: () => "Notify only",
};

const SCOPE_TEXT = (r: Rule) =>
  r.scope_type === "org"
    ? "All campaigns"
    : r.scope_type === "account"
      ? `${r.scope_ids.length} account${r.scope_ids.length === 1 ? "" : "s"}`
      : `${r.scope_ids.length} campaign${r.scope_ids.length === 1 ? "" : "s"}`;

export function AutomationsView() {
  const org = useActiveOrg();
  const orgId = org?.id;
  const manage = canManage(org?.role);
  const rules = useRules(orgId);
  const save = useSaveRule(orgId);
  const del = useDeleteRule(orgId);
  const [editor, setEditor] = useState<{ rule?: Rule; seed?: RuleInput } | null>(null);
  const [picking, setPicking] = useState(false);
  const [goingLive, setGoingLive] = useState<Rule | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);
  const list = rules.data?.rules ?? [];
  const notLive = isNotLive(rules.error);

  const toggle = (r: Rule, enabled: boolean) => {
    if (enabled && !r.dry_run) {
      setGoingLive(r);
      return;
    }
    save.mutate(
      { id: r.id, body: { enabled } },
      {
        onSuccess: () => toast.success(`${r.name} ${enabled ? "enabled" : "disabled"}${enabled && r.dry_run ? " (dry run)" : ""}`),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Automations"
        description="Rules check your campaigns on a schedule and pause, activate or re-budget the ones that match. New rules start in dry run."
        actions={
          manage ? (
            <Button size="sm" onClick={() => setPicking(true)} disabled={notLive}>
              <Plus aria-hidden="true" /> New rule
            </Button>
          ) : null
        }
      />

      {manage && picking ? (
        <NewRuleDialog open onOpenChange={setPicking} onPick={(seed) => setEditor(seed ? { seed } : {})} />
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[62rem] text-sm">
            <thead className="sticky top-0 bg-bg-subtle text-left text-xs text-fg-muted">
              <tr className="[&>th]:h-8 [&>th]:px-3 [&>th]:font-medium">
                <th className="w-14">On</th>
                <th>Rule</th>
                <th className="w-32">Scope</th>
                <th className="w-32">Action</th>
                <th className="w-24">Mode</th>
                <th className="w-32">Checks</th>
                <th className="w-44">Last run</th>
                <th className="w-24 text-right">Changes 7d</th>
                <th className="w-10" aria-label="Menu" />
              </tr>
            </thead>
            <tbody>
              {rules.isLoading ? (
                Array.from({ length: 4 }, (_, i) => (
                  <tr key={i} className="h-10 border-t border-border">
                    <td colSpan={9} className="px-3">
                      <div className="h-3 animate-pulse rounded bg-bg-subtle" />
                    </td>
                  </tr>
                ))
              ) : notLive ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-fg-muted">
                    Automation rules are coming online. New rule will open the rule builder once they are.
                  </td>
                </tr>
              ) : rules.error ? (
                <tr>
                  <td colSpan={9} className="p-3">
                    <ErrorState error={rules.error} onRetry={() => rules.refetch()} />
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-fg-muted">
                    No rules yet. {manage ? "Use New rule to start from a template or from scratch; it will run in dry run until you switch it live." : ""}
                  </td>
                </tr>
              ) : (
                list.map((r) => (
                  <tr key={r.id} className="h-11 border-t border-border hover:bg-bg-subtle/60 [&>td]:px-3">
                    <td>
                      <Switch
                        checked={r.enabled}
                        disabled={!manage || save.isPending}
                        onCheckedChange={(v) => toggle(r, v)}
                        aria-label={`${r.enabled ? "Disable" : "Enable"} ${r.name}`}
                      />
                    </td>
                    <td className="max-w-0">
                      <button
                        type="button"
                        className="block w-full min-w-0 text-left"
                        onClick={() => setEditor({ rule: r })}
                      >
                        <span className="block truncate font-medium text-fg hover:underline">{r.name}</span>
                        <span className="block truncate text-xs text-fg-muted">
                          {r.conditions.map((c) => conditionText(c)).join(" and ")} · last {r.lookback_days}d
                        </span>
                      </button>
                    </td>
                    <td className="text-xs text-fg-muted">{SCOPE_TEXT(r)}</td>
                    <td className="text-xs text-fg">{ACTION_TEXT[r.action.type](r.action.value)}</td>
                    <td>
                      {r.dry_run ? <StatusPill tone="info">Dry run</StatusPill> : <StatusPill tone="warning">Live</StatusPill>}
                    </td>
                    <td className="text-xs text-fg-muted">
                      {intervalLabel(r.check_interval_minutes)}
                      <span className="block text-fg-subtle">cooldown {cooldownLabel(r.cooldown_minutes)}</span>
                    </td>
                    <td className="text-xs whitespace-nowrap text-fg-muted tabular-nums">
                      {r.last_run_at ? (
                        <>
                          {timeAgo(r.last_run_at)}
                          <span className="block text-fg-subtle">
                            {r.last_run_matched} matched · {r.last_run_changes} changed
                          </span>
                        </>
                      ) : r.enabled ? (
                        "Waiting for first run"
                      ) : (
                        "Never"
                      )}
                    </td>
                    <td className="text-right tabular-nums">
                      <Link
                        href={`/app/actions?source_id=${r.id}`}
                        className={cn("font-medium hover:underline", r.changes_7d ? "text-fg" : "text-fg-subtle")}
                      >
                        {r.changes_7d}
                      </Link>
                      <span className="block text-xs text-fg-subtle">{r.changes_total} total</span>
                    </td>
                    <td>
                      {manage ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon-xs" variant="ghost" aria-label={`Actions for ${r.name}`}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditor({ rule: r })}>
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/app/actions?source_id=${r.id}`}>View actions</Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(r)}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editor ? (
        <RuleBuilderSheet
          orgId={orgId}
          rule={editor.rule}
          seed={editor.seed}
          readOnly={!manage}
          onClose={() => setEditor(null)}
        />
      ) : null}

      <ConfirmDialog
        open={!!goingLive}
        onOpenChange={(o) => !o && setGoingLive(null)}
        title="Enable a live rule?"
        description={
          goingLive ? (
            <>
              “{goingLive.name}” is live, not a dry run. Every {intervalLabel(goingLive.check_interval_minutes).replace("every ", "")} it
              will {ACTION_TEXT[goingLive.action.type](goingLive.action.value).toLowerCase()} up to{" "}
              {goingLive.max_changes_per_run} matching campaigns on Meta or Google, and each change is logged in Actions.
            </>
          ) : null
        }
        confirmLabel="Enable live rule"
        onConfirm={() => {
          const r = goingLive;
          setGoingLive(null);
          if (r)
            save.mutate(
              { id: r.id, body: { enabled: true } },
              { onSuccess: () => toast.success(`${r.name} is live`), onError: (e) => toast.error(errorMessage(e)) },
            );
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this rule?"
        description={deleting ? `“${deleting.name}” stops running. Its past actions stay in the log.` : null}
        confirmLabel="Delete rule"
        onConfirm={() => {
          const r = deleting;
          setDeleting(null);
          if (r) del.mutate(r.id, { onSuccess: () => toast.success("Rule deleted"), onError: (e) => toast.error(errorMessage(e)) });
        }}
      />
    </div>
  );
}

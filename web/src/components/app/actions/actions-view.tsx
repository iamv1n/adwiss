"use client";

import { Fragment, useEffect, useState } from "react";
import { CalendarClock, ChevronDown, ChevronRight, Hand, Search, Undo2, Wallet, Workflow, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, errorMessage } from "@/components/app/analytics/states";
import { PROVIDER_NAMES } from "@/components/app/analytics/format";
import {
  canManage,
  useActions,
  useRevertAction,
  type Action,
  type ActionFilter,
  type ActionSource,
  type ActionStatus,
  type ActionType,
} from "@/lib/automation-api";
import { useActiveOrg } from "@/lib/queries";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import {
  ActionStatusPill,
  ChangeSummary,
  SOURCE_LABELS,
  STATUS_LABELS,
  StateDiff,
  TYPE_LABELS,
  isNotLive,
} from "./action-bits";

const PAGE = 50;
const ALL = "all";

const SOURCE_ICONS: Record<ActionSource, typeof Hand> = {
  manual: Hand,
  schedule: CalendarClock,
  rule: Workflow,
  plan: Wallet,
  revert: Undo2,
};

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  options: Record<T, string>;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : (v as T))}>
      <SelectTrigger size="sm" aria-label={label} className="h-8 min-w-32 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {label.toLowerCase()}</SelectItem>
        {(Object.keys(options) as T[]).map((k) => (
          <SelectItem key={k} value={k}>
            {options[k]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ActionsView({ sourceId: sourceProp, compact = false }: { sourceId?: string; compact?: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const sourceParam = params.get("source_id") ?? undefined;
  const sourceId = sourceProp ?? sourceParam;
  const org = useActiveOrg();
  const orgId = org?.id;
  const manage = canManage(org?.role);
  const [source, setSource] = useState<ActionSource | undefined>();
  const [status, setStatus] = useState<ActionStatus | undefined>();
  const [type, setType] = useState<ActionType | undefined>();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [reverting, setReverting] = useState<Action | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const filter: ActionFilter = { source, status, action_type: type, search: search || undefined, source_id: sourceId, limit: PAGE, offset };
  const q = useActions(orgId, filter);
  const revert = useRevertAction(orgId);
  const rows = q.data?.actions ?? [];
  const total = q.data?.page.total ?? 0;
  const notLive = isNotLive(q.error);

  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setOffset(0);
  };

  const table = (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      <div className="max-h-[calc(100vh-15rem)] overflow-auto">
        <table className="w-full min-w-[64rem] table-fixed text-sm">
          <thead className="sticky top-0 z-10 bg-bg-subtle text-left text-xs text-fg-muted">
            <tr className="[&>th]:h-8 [&>th]:px-3 [&>th]:font-medium">
              <th className="w-9" aria-label="Expand" />
              <th className="w-40">When</th>
              <th className="w-52">Source</th>
              <th>Entity</th>
              <th className="w-20">Action</th>
              <th className="w-72">Change</th>
              <th className="w-24">Status</th>
              {manage && !compact ? <th className="w-20 text-right">
                <span className="sr-only">Revert</span>
              </th> : null}
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              Array.from({ length: 12 }, (_, i) => (
                <tr key={i} className="h-9 border-t border-border">
                  <td colSpan={8} className="px-3">
                    <div className="h-3 w-full animate-pulse rounded bg-bg-subtle" />
                  </td>
                </tr>
              ))
            ) : notLive ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-fg-muted">
                  The actions log is coming online. Changes from schedules, rules and people will appear here.
                </td>
              </tr>
            ) : q.error ? (
              <tr>
                <td colSpan={8} className="p-3">
                  <ErrorState error={q.error} onRetry={() => q.refetch()} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-fg-muted">
                  {source || status || type || search
                    ? "No actions match these filters."
                    : "Nothing has changed yet. Pauses, activations and budget changes from people, schedules and rules are recorded here, including dry runs."}
                </td>
              </tr>
            ) : (
              rows.map((a) => {
                const Icon = SOURCE_ICONS[a.source];
                const expanded = open === a.id;
                return (
                  <Fragment key={a.id}>
                    <tr
                      className={cn(
                        "h-9 cursor-pointer border-t border-border hover:bg-bg-subtle/60 [&>td]:px-3",
                        expanded && "bg-bg-subtle/60",
                      )}
                      onClick={() => setOpen(expanded ? null : a.id)}
                    >
                      <td>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={expanded ? "Hide details" : "Show details"}
                          className="grid size-5 place-items-center rounded text-fg-subtle hover:text-fg"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpen(expanded ? null : a.id);
                          }}
                        >
                          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                        </button>
                      </td>
                      <td className="truncate text-xs text-fg-muted tabular-nums" title={formatDate(a.created_at, { dateStyle: "medium", timeStyle: "short" })}>
                        {formatDate(a.created_at, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        <span className="ml-1.5 text-fg-subtle">{timeAgo(a.created_at)}</span>
                      </td>
                      <td>
                        <span className="flex min-w-0 items-center gap-1.5" title={a.source_name || a.actor_name}>
                          <Icon className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                          <span className="text-xs text-fg-subtle">{SOURCE_LABELS[a.source]}</span>
                          <span className="truncate text-fg">{a.source === "manual" ? a.actor_name || "Someone" : a.source_name || "—"}</span>
                        </span>
                      </td>
                      <td>
                        <span className="flex min-w-0 items-center gap-1.5" title={a.entity_name}>
                          <span className="truncate font-medium text-fg">{a.entity_name || a.entity_id.slice(0, 8)}</span>
                          <span className="shrink-0 text-xs text-fg-subtle">
                            {a.provider ? PROVIDER_NAMES[a.provider] : ""} {a.entity_type === "ad_group" ? "ad set" : a.entity_type}
                          </span>
                        </span>
                      </td>
                      <td className="text-xs text-fg-muted">{TYPE_LABELS[a.action_type] ?? a.action_type}</td>
                      <td className="overflow-hidden">
                        <ChangeSummary type={a.action_type} before={a.before} after={a.after} currency={a.currency} />
                      </td>
                      <td title={a.error || a.reason || undefined}>
                        <ActionStatusPill status={a.status} />
                      </td>
                      {manage && !compact ? (
                        <td className="text-right">
                          {a.revertible ? (
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReverting(a);
                              }}
                            >
                              <Undo2 aria-hidden="true" /> Revert
                            </Button>
                          ) : a.reverted_by ? (
                            <span className="text-xs text-fg-subtle">Reverted</span>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                    {expanded ? (
                      <tr className="bg-bg-subtle/40">
                        <td />
                        <td colSpan={7} className="px-3 pt-1 pb-3">
                          <div className="grid gap-4 text-xs md:grid-cols-[minmax(0,28rem)_1fr]">
                            <StateDiff action={a} />
                            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
                              {a.reason ? (
                                <>
                                  <dt className="text-fg-subtle">Reason</dt>
                                  <dd className="text-fg">{a.reason}</dd>
                                </>
                              ) : null}
                              {a.error ? (
                                <>
                                  <dt className="text-fg-subtle">Provider error</dt>
                                  <dd className="font-mono break-all text-danger-fg">{a.error}</dd>
                                </>
                              ) : null}
                              <dt className="text-fg-subtle">Recorded</dt>
                              <dd className="tabular-nums">{formatDate(a.created_at, { dateStyle: "medium", timeStyle: "medium" })}</dd>
                              {a.executed_at ? (
                                <>
                                  <dt className="text-fg-subtle">Executed</dt>
                                  <dd className="tabular-nums">{formatDate(a.executed_at, { dateStyle: "medium", timeStyle: "medium" })}</dd>
                                </>
                              ) : null}
                              {a.slot_start ? (
                                <>
                                  <dt className="text-fg-subtle">Time slot</dt>
                                  <dd className="tabular-nums">{formatDate(a.slot_start, { dateStyle: "medium", timeStyle: "short" })}</dd>
                                </>
                              ) : null}
                              <dt className="text-fg-subtle">Action ID</dt>
                              <dd className="font-mono text-fg-muted">{a.id}</dd>
                            </dl>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-xs text-fg-muted">
        <span className="tabular-nums">
          {total ? `${offset + 1}–${Math.min(offset + PAGE, total)} of ${total}` : "0 actions"}
          {q.data?.counts
            ? ` · ${Object.entries(q.data.counts)
                .filter(([, n]) => n)
                .map(([s, n]) => `${n} ${STATUS_LABELS[s as ActionStatus].toLowerCase()}`)
                .join(" · ")}`
            : ""}
        </span>
        <span className="flex gap-1">
          <Button size="xs" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            Previous
          </Button>
          <Button size="xs" variant="outline" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
            Next
          </Button>
        </span>
      </div>
    </div>
  );

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search entity or source"
          aria-label="Search actions"
          className="h-8 w-60 pl-8 text-xs"
        />
      </div>
      {!sourceId ? <FilterSelect label="Sources" value={source} onChange={resetPage(setSource)} options={SOURCE_LABELS} /> : null}
      {sourceParam && !sourceProp ? (
        <Button size="xs" variant="secondary" onClick={() => router.replace("/app/actions")}>
          From {rows[0]?.source_name ? `“${rows[0].source_name}”` : "one schedule or rule"} <X aria-hidden="true" />
        </Button>
      ) : null}
      <FilterSelect label="Statuses" value={status} onChange={resetPage(setStatus)} options={STATUS_LABELS} />
      <FilterSelect label="Actions" value={type} onChange={resetPage(setType)} options={TYPE_LABELS} />
    </div>
  );

  return (
    <div className="grid gap-3">
      {compact ? null : (
        <PageHeader
          title="Actions"
          description="Every pause, activation and budget change, from people, schedules and rules, including dry runs."
        />
      )}
      {filters}
      {table}
      <ConfirmDialog
        open={!!reverting}
        onOpenChange={(o) => !o && setReverting(null)}
        title="Revert this change?"
        description={
          reverting ? (
            <>
              This sends a live change to {reverting.provider ? PROVIDER_NAMES[reverting.provider] : "the provider"} now: “
              {reverting.entity_name}” goes back to its state before this action. Schedules and rules may change it again
              on their next run.
            </>
          ) : null
        }
        confirmLabel="Revert now"
        destructive={false}
        onConfirm={() => {
          const a = reverting;
          setReverting(null);
          if (!a) return;
          revert.mutate(a.id, {
            onSuccess: (res) =>
              res.action.status === "succeeded"
                ? toast.success(`Reverted ${a.entity_name}`)
                : toast.error(`Revert ${STATUS_LABELS[res.action.status].toLowerCase()}: ${res.action.error || res.action.reason}`),
            onError: (e) => toast.error(errorMessage(e)),
          });
        }}
      />
    </div>
  );
}

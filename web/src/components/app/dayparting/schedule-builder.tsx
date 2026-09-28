"use client";

import { useMemo, useState } from "react";
import { Eye, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { errorMessage } from "@/components/app/analytics/states";
import { ChangeSummary } from "@/components/app/actions/action-bits";
import { TargetPicker } from "@/components/app/automations/target-picker";
import type { Dayparting } from "@/lib/analytics-api";
import {
  usePreviewSchedule,
  useSaveSchedule,
  type Grid,
  type Level,
  type Schedule,
  type ScheduleInput,
  type SchedulePreview,
} from "@/lib/automation-api";
import { useAdAccounts } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { BRUSHES, PRESETS, cellClass, cloneGrid, countDiff, fillGrid, gridFromHeatmap, valueLabel } from "./grid";
import { GridPainter } from "./grid-painter";
import { ScheduleTimeline } from "./schedule-timeline";

const ZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];
const ACCOUNT_TZ = "__account__";

/** Weekday (0 = Mon) and hour now in tz. */
export function nowCellIn(tz: string | undefined): { day: number; hour: number } | null {
  if (!tz) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    return { day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd), hour };
  } catch {
    return null;
  }
}

export function scheduleToInput(s: Schedule): ScheduleInput {
  return {
    name: s.name,
    level: s.level,
    target_ids: s.target_ids,
    timezone: s.timezone,
    grid: s.grid,
    enabled: s.enabled,
    dry_run: s.dry_run,
  };
}

function diffLines(a: ScheduleInput, b: ScheduleInput): string[] {
  const out: string[] = [];
  if (a.name !== b.name) out.push(`Name: “${a.name}” → “${b.name}”`);
  if (a.level !== b.level) out.push(`Targets: ${a.level === "campaign" ? "campaigns" : "ad sets"} → ${b.level === "campaign" ? "campaigns" : "ad sets"}`);
  const added = b.target_ids.filter((id) => !a.target_ids.includes(id)).length;
  const removed = a.target_ids.filter((id) => !b.target_ids.includes(id)).length;
  if (added || removed) out.push(`Targets: ${added ? `+${added}` : ""}${added && removed ? " / " : ""}${removed ? `−${removed}` : ""}`);
  if ((a.timezone ?? "") !== (b.timezone ?? "")) out.push(`Time zone: ${a.timezone ?? "account"} → ${b.timezone ?? "account"}`);
  const hours = countDiff(a.grid, b.grid);
  if (hours) out.push(`${hours} hour${hours === 1 ? "" : "s"} of the week repainted`);
  if (a.dry_run !== b.dry_run) out.push(`Mode: ${a.dry_run ? "dry run" : "live"} → ${b.dry_run ? "dry run" : "live"}`);
  return out;
}

export function ScheduleBuilderSheet({
  orgId,
  schedule,
  seed,
  heat,
  readOnly,
  onClose,
}: {
  orgId: string | undefined;
  schedule?: Schedule;
  seed?: Partial<ScheduleInput>;
  heat?: Dayparting;
  readOnly?: boolean;
  onClose: () => void;
}) {
  const initial: ScheduleInput = useMemo(
    () =>
      schedule
        ? scheduleToInput(schedule)
        : {
            name: "",
            level: "campaign",
            target_ids: [],
            timezone: null,
            grid: fillGrid(1),
            enabled: false,
            dry_run: true,
            ...seed,
          },
    [schedule, seed],
  );
  const [f, setF] = useState<ScheduleInput>(initial);
  const [brush, setBrush] = useState(0);
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [confirm, setConfirm] = useState<{ enable: boolean } | null>(null);
  const [bestShare, setBestShare] = useState(50);
  const accounts = useAdAccounts(orgId);
  const previewM = usePreviewSchedule(orgId);
  const save = useSaveSchedule(orgId);

  const set = <K extends keyof ScheduleInput>(k: K, v: ScheduleInput[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setPreview(null);
  };
  const accountTz = accounts.data?.accounts[0]?.timezone;
  const tzs = Array.from(new Set((accounts.data?.accounts ?? []).map((a) => a.timezone)));
  const clockTz = f.timezone ?? accountTz;
  const diff = schedule ? diffLines(initial, f) : [];
  const usesBudget = f.grid.some((row) => row.some((v) => v !== 0 && v !== 1));

  const runPreview = () =>
    previewM.mutate({ ...f, name: f.name || "Preview" }, { onSuccess: setPreview, onError: (e) => toast.error(errorMessage(e)) });

  const doSave = (enable: boolean) => {
    const body: ScheduleInput = { ...f, enabled: enable, name: f.name.trim() || "Untitled schedule" };
    save.mutate(
      { id: schedule?.id, body },
      {
        onSuccess: () => {
          toast.success(`${body.name} saved${enable ? (body.dry_run ? ", running in dry run" : ", live") : ""}`);
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };
  const requestSave = (enable: boolean) => {
    const goingLive = enable && !f.dry_run && (!schedule || schedule.dry_run || !schedule.enabled || diff.length > 0);
    if (goingLive) setConfirm({ enable });
    else doSave(enable);
  };
  const bestHours = () => {
    if (!heat) return;
    const g = gridFromHeatmap(heat, bestShare / 100, heat.metric === "cpa");
    if (!g) {
      toast.error("Not enough hourly data in the heatmap to pick hours.");
      return;
    }
    set("grid", g);
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[min(72rem,95vw)]">
        <SheetHeader className="border-b border-border px-5 py-3">
          <SheetTitle>{schedule ? `Edit “${schedule.name}”` : "New dayparting schedule"}</SheetTitle>
          <SheetDescription className="text-xs">
            Paint the week: off hours pause the targets, on hours run them, percentages scale each target’s daily budget from
            its normal amount (restored when the block ends). Schedules start in dry run.
          </SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid content-start gap-3 px-5 py-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid min-w-56 flex-1 gap-1">
                <Label htmlFor="sched-name" className="text-xs">
                  Name
                </Label>
                <Input
                  id="sched-name"
                  value={f.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Weekday prime time"
                  className="h-8"
                  disabled={readOnly}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Time zone</Label>
                <Select value={f.timezone ?? ACCOUNT_TZ} onValueChange={(v) => set("timezone", v === ACCOUNT_TZ ? null : v)} disabled={readOnly}>
                  <SelectTrigger size="sm" className="h-8 w-60 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ACCOUNT_TZ}>
                      Each account’s own ({tzs.length === 1 ? tzs[0] : `${tzs.length} zones`})
                    </SelectItem>
                    {Array.from(new Set([...tzs, ...ZONES])).map((z) => (
                      <SelectItem key={z} value={z}>
                        {z}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Brush">
                <span className="mr-1 text-xs text-fg-muted">Brush</span>
                {BRUSHES.map((b) => (
                  <button
                    key={b.value}
                    type="button"
                    role="radio"
                    aria-checked={brush === b.value}
                    title={b.hint}
                    disabled={readOnly}
                    onClick={() => setBrush(b.value)}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs",
                      brush === b.value ? "border-primary ring-1 ring-primary" : "border-border text-fg-muted hover:text-fg",
                    )}
                  >
                    <span aria-hidden="true" className={cn("size-3 rounded-[2px]", cellClass(b.value))} />
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-fg-muted">Quick fill</span>
              {PRESETS.map((p) => (
                <Button key={p.id} type="button" size="xs" variant="outline" disabled={readOnly} onClick={() => set("grid", p.build())}>
                  {p.label}
                </Button>
              ))}
              <span className="ml-2 inline-flex items-center gap-1">
                <Button type="button" size="xs" variant="outline" disabled={readOnly || !heat} onClick={bestHours}>
                  <Sparkles /> Best hours from heatmap
                </Button>
                <Select value={String(bestShare)} onValueChange={(v) => setBestShare(Number(v))}>
                  <SelectTrigger size="sm" className="h-6 w-24 text-xs" aria-label="Share of hours to keep on">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[25, 40, 50, 60, 75].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        top {n}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
            </div>

            <GridPainter value={f.grid} onChange={(g) => set("grid", cloneGrid(g))} brush={brush} disabled={readOnly} nowCell={nowCellIn(clockTz)} />

            <section aria-labelledby="sched-preview-h" className="grid gap-2">
              <div className="flex items-center justify-between">
                <h3 id="sched-preview-h" className="text-sm font-semibold text-fg">
                  Preview
                </h3>
                <Button size="xs" variant="outline" onClick={runPreview} disabled={previewM.isPending || !f.target_ids.length}>
                  {previewM.isPending ? <Loader2 className="animate-spin" /> : <Eye />} {preview ? "Refresh" : "Preview now + 24 h"}
                </Button>
              </div>
              {!f.target_ids.length ? (
                <p className="text-xs text-fg-muted">Choose targets on the right to preview.</p>
              ) : preview ? (
                <SchedulePreviewPanel preview={preview} />
              ) : (
                <p className="text-xs text-fg-muted">See what changes this hour and over the next 24 hours. A preview never changes anything.</p>
              )}
            </section>
          </div>

          <aside className="grid min-w-0 content-start gap-3 border-t border-border px-4 py-4 lg:border-t-0 lg:border-l">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-fg-muted">Apply to</span>
              <div className="flex gap-1" role="radiogroup" aria-label="Target level">
                {(
                  [
                    ["campaign", "Campaigns"],
                    ["ad_group", "Ad sets"],
                  ] as [Level, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={f.level === id}
                    disabled={readOnly}
                    onClick={() => f.level !== id && setF((p) => ({ ...p, level: id, target_ids: [] }))}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs",
                      f.level === id ? "border-primary bg-accent text-accent-fg" : "border-border text-fg-muted hover:text-fg",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {f.level === "ad_group" ? (
                <p className="text-[0.6875rem] text-fg-subtle">Use ad sets when budgets live on the ad sets (Meta without campaign budget).</p>
              ) : null}
            </div>
            <TargetPicker
              orgId={orgId}
              kind={f.level === "campaign" ? "campaigns" : "ad_groups"}
              value={f.target_ids}
              onChange={(ids) => set("target_ids", ids)}
              disabled={readOnly}
              maxHeight="20rem"
            />
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium text-fg">Dry run</p>
                <p className="text-xs text-fg-muted">
                  {f.dry_run ? "Logs what it would change. Nothing is sent to Meta or Google." : "Live: pauses, activations and budgets change on the ad platforms."}
                </p>
              </div>
              <Switch checked={f.dry_run} onCheckedChange={(v) => set("dry_run", v)} disabled={readOnly} aria-label="Dry run" />
            </div>
            {usesBudget ? (
              <p className="rounded-md bg-bg-subtle px-2 py-1.5 text-xs text-fg-muted">
                Budget blocks scale from each target’s normal daily budget, captured before the schedule first changes it, and restore it
                when the block ends. Targets without a daily budget only follow on/off.
              </p>
            ) : null}
            {schedule ? (
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs font-medium text-fg">Changes from the saved version</p>
                {diff.length ? (
                  <ul className="mt-1 list-disc pl-4 text-xs text-fg-muted">
                    {diff.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-fg-subtle">No changes yet.</p>
                )}
              </div>
            ) : null}
            <GridSummary grid={f.grid} />
          </aside>
        </div>

        {!readOnly ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
            {!preview && f.target_ids.length ? <span className="mr-auto text-xs text-fg-subtle">Preview before enabling.</span> : null}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="outline" size="sm" onClick={() => requestSave(schedule?.enabled ?? false)} disabled={save.isPending || (!!schedule && !diff.length)}>
              {schedule ? "Save changes" : "Save (disabled)"}
            </Button>
            {!schedule?.enabled ? (
              <Button size="sm" onClick={() => requestSave(true)} disabled={save.isPending || !preview || !f.target_ids.length}>
                {f.dry_run ? "Save & enable dry run" : "Save & go live"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Run this schedule live?"
        description={
          <>
            “{f.name || "This schedule"}” will change {f.target_ids.length} {f.level === "campaign" ? "campaign" : "ad set"}
            {f.target_ids.length === 1 ? "" : "s"} on Meta or Google every time a painted block starts: pausing them in off hours,
            re-activating the ones it paused, {usesBudget ? "and scaling their daily budgets in percentage blocks, " : ""}checked every 5
            minutes in {f.timezone ?? "each account’s time zone"}. Every change is logged in Actions and can be reverted there.
            {preview ? ` This hour it would make ${preview.now.length} change${preview.now.length === 1 ? "" : "s"}.` : ""}
          </>
        }
        confirmLabel="Go live"
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c) doSave(c.enable);
        }}
      />
    </Sheet>
  );
}

function GridSummary({ grid }: { grid: Grid }) {
  const counts = new Map<number, number>();
  grid.forEach((row) => row.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1)));
  return (
    <div className="grid gap-1 text-xs">
      <span className="font-medium text-fg-muted">Hours per week</span>
      {Array.from(counts.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([v, n]) => (
          <span key={v} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn("size-3 rounded-[2px]", cellClass(v))} />
            <span className="w-12 text-fg">{valueLabel(v)}</span>
            <span className="text-fg-muted tabular-nums">{n} h</span>
          </span>
        ))}
    </div>
  );
}

const whenFmt = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });

export function SchedulePreviewPanel({ preview }: { preview: SchedulePreview }) {
  return (
    <div className="grid gap-2">
      <p className="text-xs text-fg">
        Affects <span className="font-medium">{preview.affected.targets}</span> target{preview.affected.targets === 1 ? "" : "s"} in{" "}
        <span className="font-medium">{preview.affected.accounts}</span> account{preview.affected.accounts === 1 ? "" : "s"}.{" "}
        <span className="text-fg-muted">
          This hour: {preview.now.length} change{preview.now.length === 1 ? "" : "s"} · next 24 h: {preview.next_24h.length}
        </span>
      </p>
      {preview.warnings.map((w) => (
        <p key={w} className="rounded-md bg-warning-subtle px-2 py-1 text-xs text-warning-fg">
          {w}
        </p>
      ))}
      <ScheduleTimeline targets={preview.targets} timeline={preview.timeline} />
      {[...preview.now, ...preview.next_24h].length ? (
        <div className="max-h-56 overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-bg-subtle text-left text-fg-muted">
              <tr className="[&>th]:h-7 [&>th]:px-2 [&>th]:font-medium">
                <th className="w-28">When</th>
                <th>Target</th>
                <th className="w-56">Change</th>
              </tr>
            </thead>
            <tbody>
              {[...preview.now, ...preview.next_24h].map((c, i) => (
                <tr key={i} className="h-7 border-t border-border [&>td]:px-2">
                  <td className="text-fg-muted tabular-nums">{i < preview.now.length ? "Now" : whenFmt(c.at)}</td>
                  <td className="max-w-0 truncate font-medium text-fg" title={c.reason}>
                    {c.target_name}
                  </td>
                  <td>
                    <ChangeSummary type={c.type} before={c.before} after={c.after} currency={c.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

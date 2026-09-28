"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { CurrencyPicker, RangePicker } from "@/components/app/analytics/controls";
import { presetRange, useDayparting, type RangePreset } from "@/lib/analytics-api";
import { canManage, type Schedule, type ScheduleInput } from "@/lib/automation-api";
import { useActiveOrg } from "@/lib/queries";
import { PerformanceHeatmap, type HeatMetric } from "./performance-heatmap";
import { SchedulesTable } from "./schedules-table";
import { ScheduleBuilderSheet, scheduleToInput } from "./schedule-builder";
import { PRESETS } from "./grid";

type Editor = { schedule?: Schedule; seed?: Partial<ScheduleInput> };

export function DaypartingView() {
  const org = useActiveOrg();
  const orgId = org?.id;
  const manage = canManage(org?.role);
  const router = useRouter();
  const params = useSearchParams();
  const [days, setDays] = useState<RangePreset>(30);
  const [metric, setMetric] = useState<HeatMetric>("roas");
  const [currency, setCurrency] = useState<string | undefined>();
  const [editorState, setEditor] = useState<Editor | null>(null);
  const [hovered, setHovered] = useState<Schedule | null>(null);
  const range = useMemo(() => presetRange(days), [days]);
  const heat = useDayparting(orgId, { ...range, metric, currency });
  const currencies = heat.data?.currencies ?? [];

  // /app/dayparting?template=night (from the Automations templates) opens the builder prefilled.
  const template = params.get("template");
  const editor: Editor | null =
    editorState ??
    (template === "night" && manage
      ? { seed: { name: "Night-time pause", grid: PRESETS.find((p) => p.id === "overnight")!.build() } }
      : null);
  const closeEditor = () => {
    setEditor(null);
    if (template) router.replace("/app/dayparting");
  };

  const overlay = hovered ? hovered.grid.map((row) => row.map((v) => v === 0)) : undefined;

  return (
    <div className="grid gap-3">
      <PageHeader
        title="Dayparting"
        description="When your campaigns earn and when they burn budget, and schedules that act on it."
        actions={
          <>
            {currencies.length > 1 ? (
              <CurrencyPicker currencies={currencies} value={currency ?? heat.data?.currency ?? undefined} onChange={setCurrency} />
            ) : null}
            <RangePicker value={days} onChange={setDays} />
            {manage ? (
              <Button size="sm" onClick={() => setEditor({})}>
                <Plus aria-hidden="true" /> New schedule
              </Button>
            ) : null}
          </>
        }
      />
      <PerformanceHeatmap
        data={heat.data}
        metric={metric}
        onMetricChange={setMetric}
        error={heat.error}
        onRetry={() => heat.refetch()}
        loading={heat.isFetching}
        overlay={overlay}
        overlayLabel={hovered ? `Off in “${hovered.name}”` : undefined}
      />
      <SchedulesTable
        orgId={orgId}
        manage={manage}
        onEdit={(s) => setEditor({ schedule: s })}
        onDuplicate={(s) => setEditor({ seed: { ...scheduleToInput(s), name: `${s.name} (copy)`, enabled: false, dry_run: true } })}
        onHover={setHovered}
      />
      {editor ? (
        <ScheduleBuilderSheet
          key={editor.schedule?.id ?? "new"}
          orgId={orgId}
          schedule={editor.schedule}
          seed={editor.seed}
          heat={metric === "roas" || metric === "cpa" ? heat.data : undefined}
          readOnly={!manage}
          onClose={closeEditor}
        />
      ) : null}
    </div>
  );
}

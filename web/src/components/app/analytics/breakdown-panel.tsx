"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBreakdown, type AnalyticsScope, type BreakdownDimension } from "@/lib/analytics-api";
import { cn } from "@/lib/utils";
import { breakdownLabel, formatMoney, formatNumber, formatPercent, formatRoas } from "./format";
import { ErrorState, InlineEmpty, Panel } from "./states";

const DIMENSIONS: { value: BreakdownDimension; label: string }[] = [
  { value: "country", label: "Country" },
  { value: "device", label: "Device" },
  { value: "publisher_platform", label: "Platform" },
  { value: "placement", label: "Placement" },
];

export function BreakdownPanel({
  orgId,
  scope,
  enabled,
}: {
  orgId: string | undefined;
  scope: AnalyticsScope;
  enabled: boolean;
}) {
  const [dimension, setDimension] = useState<BreakdownDimension>("country");
  const q = useBreakdown(orgId, { ...scope, dimension }, { enabled });
  const d = q.data;
  const currency = d?.currency ?? null;
  const rows = d?.rows.filter((r) => r.impressions > 0 || (r.spend ?? 0) > 0) ?? [];

  return (
    <Panel
      titleId="breakdown-heading"
      title="Breakdown"
      description="Where the money goes, sorted by spend."
      actions={
        <Tabs value={dimension} onValueChange={(v) => setDimension(v as BreakdownDimension)}>
          <TabsList aria-label="Break down by">
            {DIMENSIONS.map((dim) => (
              <TabsTrigger key={dim.value} value={dim.value} className="text-xs">
                {dim.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    >
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !d ? (
        <div className="grid gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <InlineEmpty>No {DIMENSIONS.find((x) => x.value === dimension)?.label.toLowerCase()} data for this period.</InlineEmpty>
      ) : (
        <div className={cn("transition-opacity", q.isPlaceholderData && "opacity-60")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-fg-muted">{DIMENSIONS.find((x) => x.value === dimension)?.label}</TableHead>
                <TableHead className="text-right text-fg-muted">Spend</TableHead>
                <TableHead className="hidden text-right text-fg-muted md:table-cell">Impressions</TableHead>
                <TableHead className="hidden text-right text-fg-muted md:table-cell">CTR</TableHead>
                <TableHead className="text-right text-fg-muted">Conv.</TableHead>
                <TableHead className="hidden text-right text-fg-muted sm:table-cell">CPA</TableHead>
                <TableHead className="text-right text-fg-muted">ROAS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.publisher_platform ?? ""}|${r.value}`}>
                  <TableCell className="max-w-56 truncate font-medium text-fg">
                    {breakdownLabel(dimension, r.value, r.publisher_platform)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div className="flex items-center justify-end gap-3">
                      {r.spend_share != null && (
                        <span
                          className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-heat-1 sm:block"
                          role="meter"
                          aria-label="Share of spend"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(r.spend_share * 100)}
                          title={`${formatPercent(r.spend_share)} of spend`}
                        >
                          <span
                            className="block h-full rounded-full bg-chart-1"
                            style={{ width: `${Math.max(2, r.spend_share * 100)}%` }}
                          />
                        </span>
                      )}
                      <span className="text-fg">{formatMoney(r.spend, currency ?? r.currency)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-right text-fg tabular-nums md:table-cell">
                    {formatNumber(r.impressions, { compact: true })}
                  </TableCell>
                  <TableCell className="hidden text-right text-fg tabular-nums md:table-cell">
                    {formatPercent(r.ctr, 2)}
                  </TableCell>
                  <TableCell className="text-right text-fg tabular-nums">{formatNumber(r.conversions)}</TableCell>
                  <TableCell className="hidden text-right text-fg tabular-nums sm:table-cell">
                    {formatMoney(r.cpa, currency ?? r.currency)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      r.roas != null && r.roas < 1 ? "font-medium text-danger-fg" : "text-fg",
                    )}
                  >
                    {formatRoas(r.roas)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

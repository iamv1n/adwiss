"use client";

import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader } from "@/components/app/page-header";
import { ActivityTable } from "@/components/admin/activity-table";
import { ErrorRow, Panel, RowsSkeleton } from "@/components/admin/ui";
import { useAdminActivity } from "@/lib/admin-queries";

/** Action prefixes, matching audit action names like "integration.connected". */
const FILTERS = [
  { value: "all", label: "All", prefix: "" },
  { value: "admin", label: "Admin", prefix: "admin." },
  { value: "user", label: "Sign-ups", prefix: "user." },
  { value: "organization", label: "Organizations", prefix: "organization." },
  { value: "integration", label: "Integrations", prefix: "integration." },
];

export function ActivityView() {
  const [filter, setFilter] = useState("all");
  const prefix = FILTERS.find((f) => f.value === filter)?.prefix ?? "";
  const activity = useAdminActivity(prefix);

  return (
    <div className="grid gap-8">
      <PageHeader title="Activity" description="The audit log across every organization, newest first." />
      <Panel
        title="Events"
        description="Latest 200. Expand a row to see its details."
        actions={
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={filter}
            onValueChange={(v) => v && setFilter(v)}
            aria-label="Filter events"
          >
            {FILTERS.map((f) => (
              <ToggleGroupItem key={f.value} value={f.value} className="px-3">
                {f.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      >
        {activity.isPending ? (
          <RowsSkeleton rows={8} />
        ) : activity.isError ? (
          <ErrorRow message={activity.error.message} onRetry={() => activity.refetch()} />
        ) : (
          <ActivityTable rows={activity.data} empty="No events match this filter." />
        )}
      </Panel>
    </div>
  );
}

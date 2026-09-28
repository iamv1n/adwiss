import { StatusPill, type PillTone } from "@/components/app/integrations/status-pill";
import { LEAD_STATUS_LABELS, type Lead, type LeadStatus } from "@/lib/leads-api";

const STATUS_TONES: Record<LeadStatus, PillTone> = {
  new: "info",
  contacted: "muted",
  qualified: "warning",
  won: "success",
  lost: "danger",
};

export function LeadStatusPill({ status }: { status: LeadStatus }) {
  return <StatusPill tone={STATUS_TONES[status]}>{LEAD_STATUS_LABELS[status]}</StatusPill>;
}

export function sourceLabel(l: Lead) {
  if (l.source === "manual") return "Added by hand";
  return l.is_organic ? "Meta lead form (organic)" : "Meta lead form";
}

/** "which_budget_are_you_looking_at?" → "Which budget are you looking at?" */
export function fieldLabel(key: string) {
  const s = key.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

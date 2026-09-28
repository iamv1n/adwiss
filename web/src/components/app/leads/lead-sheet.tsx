"use client";

import { useState } from "react";
import { Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { errorMessage } from "@/components/app/analytics/states";
import { formatMoney } from "@/components/app/analytics/format";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  useUpdateLead,
  type Lead,
  type LeadStatus,
  type UpdateLeadInput,
} from "@/lib/leads-api";
import { cn, formatDate } from "@/lib/utils";
import { LeadStatusPill, fieldLabel, sourceLabel } from "./lead-bits";

/** Details of one lead, and where the team records the outcome. */
export function LeadSheet({ orgId, lead, onClose }: { orgId: string; lead: Lead | null; onClose: () => void }) {
  return (
    <Sheet open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        {lead ? <LeadDetails key={lead.id} orgId={orgId} lead={lead} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function LeadDetails({ orgId, lead, onClose }: { orgId: string; lead: Lead; onClose: () => void }) {
  const update = useUpdateLead(orgId);
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [value, setValue] = useState(lead.value == null ? "" : String(lead.value));
  const [notes, setNotes] = useState(lead.notes);

  const parsedValue = value.trim() === "" ? null : Number(value);
  const valueInvalid = parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue < 0);

  const body: UpdateLeadInput = {};
  if (status !== lead.status) body.status = status;
  if (parsedValue !== lead.value) body.value = parsedValue;
  if (notes !== lead.notes) body.notes = notes;
  const dirty = Object.keys(body).length > 0;

  const save = () =>
    update.mutate(
      { id: lead.id, body },
      {
        onSuccess: ({ lead: l }) => {
          toast.success(
            l.status === "won" && lead.status !== "won"
              ? `Marked won${l.value != null ? ` · ${formatMoney(l.value, l.currency)}` : ""}`
              : "Lead updated",
          );
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  const answers = Object.entries(lead.fields).filter(([k]) => !["full_name", "email", "phone_number"].includes(k));

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <SheetTitle className="truncate">{lead.name || "Unnamed lead"}</SheetTitle>
          <LeadStatusPill status={lead.status} />
        </div>
        <SheetDescription>
          {sourceLabel(lead)} · {formatDate(lead.lead_created_at, { dateStyle: "medium", timeStyle: "short" })}
        </SheetDescription>
      </SheetHeader>

      <div className="grid flex-1 content-start gap-5 overflow-y-auto px-5 py-4">
        <section className="grid gap-1.5 text-sm">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-fg hover:text-primary">
              <Phone className="size-4 text-fg-subtle" aria-hidden="true" /> {lead.phone}
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-fg hover:text-primary">
              <Mail className="size-4 text-fg-subtle" aria-hidden="true" /> {lead.email}
            </a>
          )}
          {!lead.phone && !lead.email && <p className="text-fg-muted">No contact details.</p>}
        </section>

        <section className="grid gap-1 text-sm">
          <h3 className="text-xs font-medium tracking-wide text-fg-subtle uppercase">From</h3>
          {lead.campaign_name ? (
            <>
              <p className="text-fg">{lead.campaign_name}</p>
              {(lead.ad_group_name || lead.ad_name) && (
                <p className="text-fg-muted">{[lead.ad_group_name, lead.ad_name].filter(Boolean).join(" › ")}</p>
              )}
            </>
          ) : (
            <p className="text-fg-muted">Not linked to a campaign</p>
          )}
        </section>

        {answers.length > 0 && (
          <section className="grid gap-2">
            <h3 className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Form answers</h3>
            <dl className="grid gap-2 text-sm">
              {answers.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-fg-muted">{fieldLabel(k)}</dt>
                  <dd className="text-fg">{v || "—"}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="grid gap-3 rounded-lg border border-border bg-bg-subtle/50 p-3">
          <h3 className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Outcome</h3>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Status">
            {LEAD_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={status === s}
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  status === s
                    ? s === "won"
                      ? "border-success bg-success-subtle text-success-fg"
                      : s === "lost"
                        ? "border-danger bg-danger-subtle text-danger-fg"
                        : "border-primary bg-accent text-accent-fg"
                    : "border-border bg-surface text-fg-muted hover:border-primary/60",
                )}
              >
                {LEAD_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="lead-value" className="text-xs text-fg-muted">
              Deal value{lead.currency ? ` (${lead.currency})` : ""}
              {status === "won" ? "" : " · counted as revenue once won"}
            </Label>
            <Input
              id="lead-value"
              type="number"
              min={0}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={valueInvalid || undefined}
              placeholder="e.g. 160000"
              className="h-9"
            />
            <p className="text-xs text-fg-subtle">
              Enter what you earn from the deal (your commission or margin) to see real ROAS.
            </p>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="lead-notes" className="text-xs text-fg-muted">
              Notes
            </Label>
            <textarea
              id="lead-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={5000}
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
        </section>
      </div>

      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!dirty || valueInvalid || update.isPending}>
          Save
        </Button>
      </div>
    </div>
  );
}

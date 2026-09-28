"use client";

import { Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStopImpersonation } from "@/lib/admin-queries";
import { useMe } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";

/** Shown on every app page while a platform admin is logged in as someone else. */
export function ImpersonationBanner() {
  const { data } = useMe();
  const stop = useStopImpersonation();
  if (!data?.impersonator) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning px-4 py-2 text-center text-sm font-medium text-on-status"
    >
      <Eye className="size-4" aria-hidden="true" />
      <span>
        Admin view: you&apos;re logged in as <strong>{data.user.email}</strong>. Anything you change is recorded as done by{" "}
        {data.impersonator.email}.
        {data.impersonation_expires_at && <> Ends {timeAgo(data.impersonation_expires_at)}.</>}
      </span>
      <Button
        size="xs"
        variant="secondary"
        disabled={stop.isPending}
        onClick={() => stop.mutate(undefined, { onError: (e) => toast.error("Couldn't return to admin", { description: e.message }) })}
      >
        {stop.isPending ? "Returning…" : "Return to admin"}
      </Button>
    </div>
  );
}

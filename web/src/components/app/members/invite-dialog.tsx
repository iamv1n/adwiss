"use client";

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FormError } from "@/components/app/field";
import { CopyField } from "@/components/app/members/copy-field";
import { isApiError, type Role } from "@/lib/api";
import { useInvite } from "@/lib/queries";

/**
 * The API returns an absolute accept_url built from its own config (often
 * localhost). Keep only the path so the link matches the host the app is being
 * used on (e.g. an ngrok tunnel).
 */
function absoluteUrl(url: string) {
  try {
    const u = new URL(url, window.location.origin);
    return new URL(`${u.pathname}${u.search}${u.hash}`, window.location.origin).toString();
  } catch {
    return url;
  }
}

export function InviteDialog({ orgId, orgName, canInviteOwner }: { orgId: string; orgName: string; canInviteOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; url: string } | null>(null);
  const invite = useInvite(orgId);

  function reset() {
    setEmail("");
    setRole("member");
    setFields({});
    setFormError(null);
    setResult(null);
    invite.reset();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFields({});
    setFormError(null);
    if (!email.trim()) {
      setFields({ email: "Enter an email address." });
      return;
    }
    try {
      const res = await invite.mutateAsync({ email: email.trim(), role });
      setResult({ email: res.invitation.email, url: absoluteUrl(res.accept_url) });
    } catch (err) {
      if (isApiError(err)) {
        setFields(err.fields);
        if (!Object.keys(err.fields).length) setFormError(err.message);
      } else setFormError("Something went wrong. Please try again.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden="true" /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Invitation created</DialogTitle>
              <DialogDescription>
                Email delivery isn&apos;t set up yet. Send this link to{" "}
                <span className="font-medium text-fg">{result.email}</span> yourself. They must sign in with that
                address to accept.
              </DialogDescription>
            </DialogHeader>
            <CopyField value={result.url} label="Invitation link" />
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Invite another
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form method="post" onSubmit={onSubmit} noValidate className="grid gap-5">
            <DialogHeader>
              <DialogTitle>Invite to {orgName}</DialogTitle>
              <DialogDescription>They&apos;ll get access to this organization&apos;s data and settings, based on their role.</DialogDescription>
            </DialogHeader>
            <FormError message={formError} />
            <Field
              label="Email"
              type="email"
              autoComplete="off"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fields.email}
              autoFocus
            />
            <div className="grid gap-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger id="invite-role" className="h-10 w-full" aria-invalid={fields.role ? true : undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member: view data, and create drafts</SelectItem>
                  <SelectItem value="admin">Admin: manage team, integrations and rules</SelectItem>
                  {canInviteOwner && <SelectItem value="owner">Owner: full control, including billing</SelectItem>}
                </SelectContent>
              </Select>
              {fields.role && <p className="text-sm text-danger-fg">{fields.role}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={invite.isPending}>
                {invite.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                Create invitation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

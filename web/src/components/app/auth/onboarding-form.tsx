"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, FormError } from "@/components/app/field";
import { isApiError } from "@/lib/api";
import { useCreateOrg, useMe } from "@/lib/queries";
import { useSetAdTypes, type AdType } from "@/lib/leads-api";
import { AdTypePicker } from "@/components/app/leads/lead-setup";

export function OnboardingForm() {
  const router = useRouter();
  const params = useSearchParams();
  const creatingAdditional = params.get("new") === "1";
  const me = useMe();
  const createOrg = useCreateOrg();

  const [name, setName] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Step 2: set once the organization exists.
  const [newOrgId, setNewOrgId] = useState<string | null>(null);

  const hasOrgs = (me.data?.organizations.length ?? 0) > 0;

  useEffect(() => {
    if (me.data === null) router.replace("/login?next=/onboarding");
    else if (me.data?.email_verified === false && !me.data.impersonator) router.replace("/verify-email?next=%2Fonboarding");
    else if (me.data && hasOrgs && !creatingAdditional && !createOrg.isSuccess) router.replace("/app/dashboard");
  }, [me.data, hasOrgs, creatingAdditional, createOrg.isSuccess, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFields({});
    setFormError(null);
    if (!name.trim()) {
      setFields({ name: "Give your organization a name." });
      return;
    }
    try {
      const { organization } = await createOrg.mutateAsync({ name: name.trim() });
      setNewOrgId(organization.id);
    } catch (err) {
      if (isApiError(err)) {
        setFields(err.fields);
        if (!Object.keys(err.fields).length) setFormError(err.message);
      } else setFormError("Something went wrong. Please try again.");
    }
  }

  if (me.isPending || !me.data) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="mt-6 h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const firstName = me.data.user.name.split(" ")[0];

  if (newOrgId) return <AdTypesStep orgId={newOrgId} onDone={() => router.replace("/app/dashboard")} />;

  return (
    <div>
      <p className="text-sm font-medium text-primary">
        {creatingAdditional ? "New organization · step 1 of 2" : "Step 1 of 2"}
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg">
        {creatingAdditional ? "Create another organization" : `Welcome, ${firstName}`}
      </h1>
      <p className="mt-2 text-fg-muted">
        Organizations hold your ad accounts, automations and team. Use your company or client name.
      </p>

      <form method="post" onSubmit={onSubmit} noValidate className="mt-8 grid gap-5">
        <FormError message={formError} />
        <Field
          label="Organization name"
          name="name"
          autoComplete="organization"
          placeholder="Acme Growth Co."
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fields.name}
          autoFocus
        />
        <Button type="submit" size="lg" className="h-10 w-full" disabled={createOrg.isPending}>
          {createOrg.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {createOrg.isPending ? "Creating…" : "Create organization"}
        </Button>
        {creatingAdditional && hasOrgs && (
          <Button asChild variant="ghost" className="w-full">
            <Link href="/app/dashboard">Cancel</Link>
          </Button>
        )}
      </form>
      <p className="mt-8 text-sm text-fg-subtle">
        Were you invited to a team? Open the invitation link you received instead.
      </p>
    </div>
  );
}

/** Onboarding step 2: what kinds of ads the org runs. Skipping is allowed; the
 * dashboard keeps reminding until it is answered. */
function AdTypesStep({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const save = useSetAdTypes(orgId);
  const [types, setTypes] = useState<AdType[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    setError(null);
    try {
      await save.mutateAsync(types);
      onDone();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div>
      <p className="text-sm font-medium text-primary">Step 2 of 2</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg">What kinds of ads do you run?</h1>
      <p className="mt-2 text-fg-muted">
        Choose all that apply. Adwise uses this to count your results and revenue the right way, like leads that turn
        into sales later.
      </p>
      <div className="mt-6 grid gap-4">
        <FormError message={error} />
        <AdTypePicker value={types} onChange={setTypes} />
        <Button size="lg" className="h-10 w-full" onClick={onContinue} disabled={types.length === 0 || save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Continue
        </Button>
        <Button variant="ghost" className="w-full" onClick={onDone} disabled={save.isPending}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}

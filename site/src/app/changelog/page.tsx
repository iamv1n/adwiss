import type { Metadata } from "next";
import { ChangelogArticle } from "@/components/marketing/changelog/entry";
import { PageHero } from "@/components/marketing/page-hero";
import { Container } from "@/components/marketing/primitives";
import { groupByMonth, listEntries } from "@/lib/changelog";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Changelog",
  description: "New features, improvements and fixes in Adwise.",
  openGraph: { title: "Adwise changelog", description: "New features, improvements and fixes in Adwise." },
};

export default async function ChangelogPage() {
  const entries = await listEntries();
  const groups = entries ? groupByMonth(entries) : [];
  return (
    <>
      <PageHero
        eyebrow="Changelog"
        title="What's new in Adwise"
        description="New features, improvements and fixes, newest first."
        cta={false}
      />
      <Container className="max-w-3xl pb-24">
        {groups.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-10 text-center text-fg-muted">
            {entries === null
              ? "Updates can't be loaded right now. Please check back in a few minutes."
              : "No updates yet. Check back soon."}
          </p>
        ) : (
          <div className="grid gap-14">
            {groups.map((g) => (
              <section key={g.key} aria-labelledby={`month-${g.key}`}>
                <h2
                  id={`month-${g.key}`}
                  className="mb-5 font-mono text-xs font-medium tracking-wider text-fg-subtle uppercase"
                >
                  {g.label}
                </h2>
                <div className="grid gap-6">
                  {g.entries.map((e) => (
                    <ChangelogArticle key={e.id} entry={e} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Container>
    </>
  );
}

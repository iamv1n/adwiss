import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ChangelogArticle } from "@/components/marketing/changelog/entry";
import { Container } from "@/components/marketing/primitives";
import { getEntry } from "@/lib/changelog";

export const revalidate = 300;

// Explicit rather than PageProps<"/changelog/[slug]"> so type-checking works before route types are generated.
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getEntry(slug);
  if (!entry) return { title: "Changelog" };
  return {
    title: entry.title,
    description: entry.summary,
    openGraph: {
      type: "article",
      title: entry.title,
      description: entry.summary,
      ...(entry.image_url ? { images: [entry.image_url] } : {}),
    },
  };
}

export default async function ChangelogEntryPage({ params }: Props) {
  const { slug } = await params;
  const entry = await getEntry(slug);
  if (!entry) notFound();
  return (
    <Container className="max-w-3xl py-14 sm:py-20">
      <Link
        href="/changelog"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> All updates
      </Link>
      <ChangelogArticle entry={entry} standalone />
    </Container>
  );
}

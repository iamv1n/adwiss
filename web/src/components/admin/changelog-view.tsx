"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill } from "@/components/app/integrations/status-pill";
import { KindPill } from "@/components/app/changelog/whats-new-sheet";
import { Markdown } from "@/components/app/changelog/markdown";
import { EmptyRow, ErrorRow, Panel, RowsSkeleton } from "@/components/admin/ui";
import { isApiError } from "@/lib/api";
import {
  KIND_LABEL,
  useAdminChangelog,
  useCreateChangelog,
  useDeleteChangelog,
  useSetChangelogPublished,
  useUpdateChangelog,
  type ChangelogEntry,
  type ChangelogInput,
  type ChangelogKind,
} from "@/lib/changelog-api";
import { formatDate } from "@/lib/utils";

export function slugify(title: string) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

type Editing = { entry: ChangelogEntry | null } | null;

export function ChangelogView() {
  const list = useAdminChangelog();
  const setPublished = useSetChangelogPublished();
  const del = useDeleteChangelog();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<ChangelogEntry | null>(null);

  const togglePublish = (e: ChangelogEntry) =>
    setPublished.mutate(
      { id: e.id, publish: !e.published_at },
      {
        onSuccess: () => toast.success(e.published_at ? "Moved back to drafts" : "Published"),
        onError: (err) => toast.error("Couldn't update the entry", { description: err.message }),
      },
    );

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Changelog"
        description="Product updates shown in the app's What's new panel and on the public changelog."
        actions={
          <Button onClick={() => setEditing({ entry: null })}>
            <Plus aria-hidden="true" /> New entry
          </Button>
        }
      />
      <Panel title="Entries" description={list.data ? `${list.data.entries.length} total` : undefined}>
        {list.isPending ? (
          <RowsSkeleton rows={5} />
        ) : list.isError ? (
          <ErrorRow message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.entries.length === 0 ? (
          <EmptyRow>No entries yet.</EmptyRow>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Entry</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="hidden w-28 sm:table-cell">Kind</TableHead>
                <TableHead className="hidden w-32 md:table-cell">Date</TableHead>
                <TableHead className="w-56 pr-5">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="max-w-0 pl-5">
                    <p className="truncate font-medium text-fg">{e.title}</p>
                    <p className="truncate font-mono text-xs text-fg-muted">{e.slug}</p>
                  </TableCell>
                  <TableCell>
                    {e.published_at ? (
                      <StatusPill tone="success">Published</StatusPill>
                    ) : (
                      <StatusPill tone="muted">Draft</StatusPill>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <KindPill kind={e.kind} />
                  </TableCell>
                  <TableCell className="hidden text-sm text-fg-muted md:table-cell">
                    {formatDate(e.published_at ?? e.updated_at)}
                  </TableCell>
                  <TableCell className="pr-5">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={setPublished.isPending}
                        onClick={() => togglePublish(e)}
                      >
                        {e.published_at ? "Unpublish" : "Publish"}
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`Edit ${e.title}`} onClick={() => setEditing({ entry: e })}>
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`Delete ${e.title}`} onClick={() => setDeleting(e)}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-2xl">
          {editing && (
            <EntryForm key={editing.entry?.id ?? "new"} entry={editing.entry} onDone={() => setEditing(null)} />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this entry?"
        description={`“${deleting?.title ?? ""}” will be removed from the app and the public changelog. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleting) return;
          del.mutate(deleting.id, {
            onSuccess: () => toast.success("Entry deleted"),
            onError: (err) => toast.error("Couldn't delete the entry", { description: err.message }),
          });
          setDeleting(null);
        }}
      />
    </div>
  );
}

const textareaClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function EntryForm({ entry, onDone }: { entry: ChangelogEntry | null; onDone: () => void }) {
  const create = useCreateChangelog();
  const update = useUpdateChangelog();
  const [title, setTitle] = useState(entry?.title ?? "");
  const [slug, setSlug] = useState(entry?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!entry);
  const [summary, setSummary] = useState(entry?.summary ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [kind, setKind] = useState<ChangelogKind>(entry?.kind ?? "new");
  const [tags, setTags] = useState((entry?.tags ?? []).join(", "));
  const [linkPath, setLinkPath] = useState(entry?.link_path ?? "");
  const [linkLabel, setLinkLabel] = useState(entry?.link_label ?? "");
  const [imageUrl, setImageUrl] = useState(entry?.image_url ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pending = create.isPending || update.isPending;

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const input: ChangelogInput = {
      slug: slug.trim(),
      title: title.trim(),
      summary: summary.trim(),
      body,
      kind,
      tags: tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      link_path: linkPath.trim() || null,
      link_label: linkLabel.trim() || null,
      image_url: imageUrl.trim() || null,
    };
    const opts = {
      onSuccess: () => {
        toast.success(entry ? "Entry saved" : "Draft created");
        onDone();
      },
      onError: (err: Error) => {
        if (isApiError(err) && Object.keys(err.fields).length) setErrors(err.fields);
        toast.error("Couldn't save the entry", { description: err.message });
      },
    };
    setErrors({});
    if (entry) update.mutate({ id: entry.id, input }, opts);
    else create.mutate(input, opts);
  };

  const field = (id: string, label: string, control: React.ReactNode, hint?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
      {errors[id] ? (
        <p className="text-xs text-danger-fg">{errors[id]}</p>
      ) : hint ? (
        <p className="text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );

  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      <SheetHeader className="border-b border-border px-5 py-4">
        <SheetTitle className="font-display">{entry ? "Edit entry" : "New entry"}</SheetTitle>
        <SheetDescription>
          {entry?.published_at ? "This entry is live; changes show immediately." : "Saved as a draft until you publish it."}
        </SheetDescription>
      </SheetHeader>
      <div className="grid flex-1 gap-4 overflow-y-auto px-5 py-4">
        {field(
          "title",
          "Title",
          <Input
            id="title"
            value={title}
            maxLength={120}
            required
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />,
        )}
        {field(
          "slug",
          "Slug",
          <Input
            id="slug"
            value={slug}
            maxLength={80}
            required
            className="font-mono"
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />,
          "Lowercase words separated by hyphens. Used in the public URL.",
        )}
        {field(
          "summary",
          "Summary",
          <textarea id="summary" rows={2} maxLength={300} required value={summary} onChange={(e) => setSummary(e.target.value)} className={textareaClass} />,
          "One or two sentences, shown everywhere.",
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            "kind",
            "Kind",
            <Select value={kind} onValueChange={(v) => setKind(v as ChangelogKind)}>
              <SelectTrigger id="kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as ChangelogKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
          )}
          {field("tags", "Tags", <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} />, "Comma separated.")}
          {field("link_path", "Link path", <Input id="link_path" placeholder="/app/learn" value={linkPath} onChange={(e) => setLinkPath(e.target.value)} />, "Optional in-app page for the Try it button.")}
          {field("link_label", "Link label", <Input id="link_label" placeholder="Try it" maxLength={40} value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />)}
        </div>
        {field("image_url", "Image URL", <Input id="image_url" placeholder="https://…" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />, "Optional.")}
        <div className="grid gap-4 lg:grid-cols-2">
          {field(
            "body",
            "Body",
            <textarea id="body" rows={12} value={body} onChange={(e) => setBody(e.target.value)} className={`${textareaClass} font-mono`} />,
            "Paragraphs, “- ” bullets, **bold**, `code`, [text](https://…).",
          )}
          <div className="grid content-start gap-1.5">
            <span className="text-sm font-medium">Preview</span>
            <div className="min-h-24 rounded-md border border-border bg-bg-subtle p-3">
              {body.trim() ? <Markdown source={body} /> : <p className="text-sm text-fg-subtle">Nothing to preview.</p>}
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : entry ? "Save" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}

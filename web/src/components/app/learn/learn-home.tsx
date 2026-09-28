"use client";

import { useState } from "react";
import Link from "next/link";
import { Award, BookOpen, CheckCircle2, ChevronRight, Circle, Clock, GraduationCap, Lock } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState } from "@/components/app/analytics/states";
import { ALL_LESSON_KEYS, MILESTONES, MODULES, TRACKS, lessonKey, milestoneProgress, moduleMinutes } from "@/lib/learn/course";
import { useLearnProgress, useResetLearnProgress } from "@/lib/learn/progress";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { errorMessage } from "@/components/app/analytics/states";
import { suggestLessons } from "@/lib/ad-profile";
import { useLeadSetup } from "@/lib/leads-api";
import { useActiveOrg, useIntegrations } from "@/lib/queries";
import type { Module, Track } from "@/lib/learn/types";
import { cn } from "@/lib/utils";

function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className={cn("h-1.5 overflow-hidden rounded-full bg-bg-subtle", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", value >= 1 ? "bg-success" : "bg-primary")}
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

const TRACK_TONE: Record<Track, string> = {
  basics: "bg-chart-1/15 text-fg",
  meta: "bg-chart-2/15 text-fg",
  google: "bg-chart-3/15 text-fg",
  adwise: "bg-chart-4/15 text-fg",
};

function ModuleCard({ m, done }: { m: Module; done: Set<string> }) {
  const [open, setOpen] = useState(false);
  const n = m.lessons.filter((l) => done.has(lessonKey(m, l))).length;
  const next = m.lessons.find((l) => !done.has(lessonKey(m, l))) ?? m.lessons[0];
  const track = TRACKS.find((t) => t.id === m.track)!;
  return (
    <article className="flex flex-col rounded-xl border border-border bg-surface shadow-xs">
      <div className="grid gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TRACK_TONE[m.track])}>{track.label}</span>
          {n === m.lessons.length && (
            <span className="flex items-center gap-1 text-xs font-medium text-success-fg">
              <CheckCircle2 className="size-3.5" aria-hidden="true" /> Complete
            </span>
          )}
        </div>
        <h3 className="font-display text-base font-semibold text-fg">{m.title}</h3>
        <p className="text-sm text-fg-muted">{m.summary}</p>
        <div className="mt-1 flex items-center gap-3 text-xs text-fg-subtle">
          <span className="flex items-center gap-1">
            <BookOpen className="size-3.5" aria-hidden="true" /> {m.lessons.length} lessons
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden="true" /> {moduleMinutes(m)} min
          </span>
          <span className="ml-auto tabular-nums">
            {n}/{m.lessons.length}
          </span>
        </div>
        <ProgressBar value={n / m.lessons.length} />
      </div>
      {open && (
        <ol className="border-t border-border">
          {m.lessons.map((l) => {
            const isDone = done.has(lessonKey(m, l));
            return (
              <li key={l.id}>
                <Link
                  href={`/app/learn/${m.id}/${l.id}`}
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-bg-subtle/60"
                >
                  {isDone ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Completed" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-fg-subtle" aria-label="Not completed" />
                  )}
                  <span className={cn("flex-1", isDone ? "text-fg-muted" : "text-fg")}>{l.title}</span>
                  <span className="text-xs text-fg-subtle">{l.minutes} min</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-auto flex items-center gap-2 border-t border-border px-4 py-2.5">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-xs text-fg-muted hover:text-fg">
          {open ? "Hide lessons" : "Show lessons"}
        </button>
        <Link
          href={`/app/learn/${m.id}/${next.id}`}
          className="ml-auto flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {n === 0 ? "Start" : n === m.lessons.length ? "Review" : "Continue"}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

/** Lessons picked from the org's kinds of ads (and Google, if connected), not yet completed. */
function SuggestedLessons({ done }: { done: Set<string> }) {
  const orgId = useActiveOrg()?.id;
  const setup = useLeadSetup(orgId);
  const integrations = useIntegrations(orgId);
  const adTypes = setup.data?.ad_types;
  const hasGoogle =
    integrations.data?.integrations.some((i) => i.provider === "google" && i.status === "active") ?? false;
  // Nothing personal to go on: the "Up next" card already follows the course order.
  if (!adTypes?.length && !hasGoogle) return null;

  const byKey = new Map(MODULES.flatMap((m) => m.lessons.map((l) => [lessonKey(m, l), { m, l }] as const)));
  const picks = suggestLessons({ adTypes, hasGoogle, done, allKeys: ALL_LESSON_KEYS, max: 5, min: 3 })
    .map((k) => byKey.get(k))
    .filter((x) => x !== undefined);
  if (picks.length === 0) return null;

  return (
    <section aria-labelledby="suggested-h" className="grid gap-2">
      <h2 id="suggested-h" className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
        Suggested for you
      </h2>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {picks.map(({ m, l }) => (
          <li key={lessonKey(m, l)}>
            <Link
              href={`/app/learn/${m.id}/${l.id}`}
              className="flex h-full items-start gap-2 rounded-xl border border-border bg-surface p-3 shadow-xs hover:border-primary/60"
            >
              <div className="min-w-0 flex-1">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TRACK_TONE[m.track])}>
                  {TRACKS.find((t) => t.id === m.track)?.label}
                </span>
                <p className="mt-1.5 text-sm font-medium text-fg">{l.title}</p>
                <p className="text-xs text-fg-subtle">
                  {m.title} · {l.minutes} min
                </p>
              </div>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function LearnHome() {
  const progress = useLearnProgress();
  const reset = useResetLearnProgress();
  const [resetting, setResetting] = useState(false);
  const done = progress.done;
  const [track, setTrack] = useState<Track | "all">("all");

  const total = ALL_LESSON_KEYS.length;
  const completed = ALL_LESSON_KEYS.filter((k) => done.has(k)).length;
  const nextUp = MODULES.flatMap((m) => m.lessons.map((l) => ({ m, l }))).find(({ m, l }) => !done.has(lessonKey(m, l)));
  const earned = MILESTONES.filter((ms) => {
    const p = milestoneProgress(ms, done);
    return p.total > 0 && p.done >= p.total;
  }).length;
  const shown = track === "all" ? MODULES : MODULES.filter((m) => m.track === track);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Learn"
        description="Everything you need to run ads that pay off, from the basics to launching and optimizing on Meta and Google."
        actions={
          progress.done.size > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setResetting(true)} disabled={reset.isPending}>
              <RotateCcw aria-hidden="true" /> Reset progress
            </Button>
          ) : null
        }
      />
      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title="Reset your learning progress?"
        description={`This marks all ${progress.done.size} completed lessons as not done and removes your milestones. The lessons themselves stay available. This can't be undone.`}
        confirmLabel="Reset progress"
        onConfirm={() =>
          reset.mutate(undefined, {
            onSuccess: () => {
              setResetting(false);
              toast.success("Learning progress reset");
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />

      {progress.error ? (
        <ErrorState error={progress.error} onRetry={() => progress.refetch()} />
      ) : (
        <section className="grid gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs md:grid-cols-[1fr_auto] md:items-center">
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <GraduationCap className="size-5 text-primary" aria-hidden="true" />
              <p className="font-medium text-fg">
                {completed === 0
                  ? "Start your first lesson"
                  : completed === total
                    ? "You've completed every lesson"
                    : `${completed} of ${total} lessons done`}
              </p>
              <span className="ml-auto text-sm text-fg-subtle tabular-nums">{Math.round((completed / Math.max(total, 1)) * 100)}%</span>
            </div>
            <ProgressBar value={completed / Math.max(total, 1)} />
            <p className="text-xs text-fg-subtle">
              {earned} of {MILESTONES.length} milestones earned · your progress is saved to your account
            </p>
          </div>
          {nextUp && (
            <Link
              href={`/app/learn/${nextUp.m.id}/${nextUp.l.id}`}
              className="flex items-center gap-3 rounded-lg border border-primary/40 bg-accent/40 px-4 py-3 hover:border-primary"
            >
              <div className="min-w-0">
                <p className="text-xs text-fg-muted">{completed === 0 ? "Start here" : "Up next"}</p>
                <p className="truncate text-sm font-medium text-fg">{nextUp.l.title}</p>
                <p className="text-xs text-fg-subtle">
                  {nextUp.m.title} · {nextUp.l.minutes} min
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-primary" aria-hidden="true" />
            </Link>
          )}
        </section>
      )}

      {!progress.isPending && !progress.error && <SuggestedLessons done={done} />}

      <section aria-labelledby="milestones-h" className="grid gap-2">
        <h2 id="milestones-h" className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
          Milestones
        </h2>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {MILESTONES.map((ms) => {
            const p = milestoneProgress(ms, done);
            const got = p.total > 0 && p.done >= p.total;
            return (
              <li
                key={ms.id}
                className={cn(
                  "grid gap-1 rounded-xl border p-3",
                  got ? "border-success/50 bg-success-subtle" : "border-border bg-surface",
                )}
              >
                {got ? (
                  <Award className="size-5 text-success" aria-hidden="true" />
                ) : (
                  <Lock className="size-5 text-fg-subtle" aria-hidden="true" />
                )}
                <p className={cn("text-sm font-medium", got ? "text-success-fg" : "text-fg")}>{ms.title}</p>
                <p className="text-xs text-fg-muted">{ms.description}</p>
                {!got && p.total > 1 && <ProgressBar value={p.done / p.total} className="mt-1" />}
                <span className="sr-only">{got ? "Earned" : `${p.done} of ${p.total} lessons`}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="modules-h" className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="modules-h" className="mr-2 text-xs font-medium tracking-wide text-fg-subtle uppercase">
            Modules
          </h2>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Track">
            {([{ id: "all", label: "All" }, ...TRACKS] as { id: Track | "all"; label: string }[]).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={track === t.id}
                onClick={() => setTrack(t.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  track === t.id ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-bg-subtle",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {track !== "all" && <p className="text-sm text-fg-muted">{TRACKS.find((t) => t.id === track)?.blurb}</p>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((m) => (
            <ModuleCard key={m.id} m={m} done={done} />
          ))}
        </div>
      </section>
    </div>
  );
}

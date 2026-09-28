"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Award, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/components/app/analytics/states";
import { MILESTONES, TRACKS, findLesson, lessonKey, milestoneProgress } from "@/lib/learn/course";
import { useLearnProgress, useSetLessonDone } from "@/lib/learn/progress";
import { cn } from "@/lib/utils";
import { Blocks } from "./blocks";

export function LessonView({ moduleId, lessonId }: { moduleId: string; lessonId: string }) {
  const found = findLesson(moduleId, lessonId);
  const progress = useLearnProgress();
  const setDone = useSetLessonDone();
  const [quiz, setQuiz] = useState<boolean | null>(null);
  const top = useRef<HTMLDivElement>(null);

  // The page keys this component by lesson, so state resets per lesson.
  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, []);

  if (!found) {
    return (
      <div className="grid gap-3">
        <p className="text-fg">This lesson doesn&apos;t exist.</p>
        <Link href="/app/learn" className="text-sm text-primary hover:underline">
          Back to Learn
        </Link>
      </div>
    );
  }

  const { module: m, lesson: l, index, prev, next } = found;
  const key = lessonKey(m, l);
  const isDone = progress.done.has(key);
  const track = TRACKS.find((t) => t.id === m.track)!;

  const complete = (done: boolean) => {
    const before = new Set(progress.done);
    setDone.mutate(
      { lessonId: key, done, quizCorrect: quiz },
      {
        onSuccess: () => {
          if (!done) return;
          const after = new Set(before).add(key);
          const newly = MILESTONES.filter((ms) => {
            const a = milestoneProgress(ms, before), b = milestoneProgress(ms, after);
            return b.total > 0 && b.done >= b.total && a.done < a.total;
          });
          if (newly.length) {
            newly.forEach((ms) =>
              toast.success(`Milestone earned: ${ms.title}`, { description: ms.description, icon: <Award className="size-4" /> }),
            );
          } else toast.success("Lesson complete");
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <div ref={top} className="mx-auto grid w-full max-w-3xl scroll-mt-20 gap-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-fg-muted">
        <Link href="/app/learn" className="hover:text-fg">
          Learn
        </Link>
        <span aria-hidden="true">/</span>
        <span>{track.label}</span>
        <span aria-hidden="true">/</span>
        <span className="text-fg">{m.title}</span>
      </nav>

      <header className="grid gap-2">
        <p className="text-sm font-medium text-primary">
          Lesson {index + 1} of {m.lessons.length}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{l.title}</h1>
        <p className="text-fg-muted">{l.summary}</p>
        <div className="flex items-center gap-3 text-xs text-fg-subtle">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden="true" /> {l.minutes} min read
          </span>
          {isDone && (
            <span className="flex items-center gap-1 text-success-fg">
              <CheckCircle2 className="size-3.5" aria-hidden="true" /> Completed
            </span>
          )}
        </div>
        <div className="mt-1 flex gap-1" aria-hidden="true">
          {m.lessons.map((x, i) => (
            <span
              key={x.id}
              className={cn(
                "h-1 flex-1 rounded-full",
                progress.done.has(lessonKey(m, x)) ? "bg-success" : i === index ? "bg-primary" : "bg-bg-subtle",
              )}
            />
          ))}
        </div>
      </header>

      <Blocks key={key} blocks={l.blocks} onQuizAnswer={setQuiz} />

      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg-subtle/50 p-4">
        <div className="min-w-[12rem] flex-1">
          <p className="font-medium text-fg">{isDone ? "You've completed this lesson" : "Finished reading?"}</p>
          <p className="text-xs text-fg-muted">
            {isDone ? "It counts toward your module and milestones." : "Mark it complete to track your progress and earn milestones."}
          </p>
        </div>
        {isDone ? (
          <Button variant="ghost" size="sm" onClick={() => complete(false)} disabled={setDone.isPending}>
            Mark as not done
          </Button>
        ) : (
          <Button onClick={() => complete(true)} disabled={setDone.isPending}>
            <CheckCircle2 aria-hidden="true" /> Mark complete
          </Button>
        )}
      </section>

      <nav className="grid gap-2 sm:grid-cols-2" aria-label="Lessons">
        {prev ? (
          <Link
            href={`/app/learn/${prev.module.id}/${prev.lesson.id}`}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 hover:border-primary/60"
          >
            <ArrowLeft className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-xs text-fg-muted">Previous</span>
              <span className="block truncate text-sm text-fg">{prev.lesson.title}</span>
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            href={`/app/learn/${next.module.id}/${next.lesson.id}`}
            onClick={() => !isDone && complete(true)}
            className="flex items-center justify-end gap-2 rounded-lg border border-primary/40 bg-accent/40 px-3 py-2.5 text-right hover:border-primary"
          >
            <span className="min-w-0">
              <span className="block text-xs text-fg-muted">{isDone ? "Next" : "Complete and continue"}</span>
              <span className="block truncate text-sm text-fg">{next.lesson.title}</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden="true" />
          </Link>
        )}
      </nav>
    </div>
  );
}

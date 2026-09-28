"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api";

export interface Completion {
  lesson_id: string;
  completed_at: string;
  quiz_correct: boolean | null;
}

const KEY = ["learn", "progress"] as const;

/** The signed-in user's completed lessons (across organizations). */
export function useLearnProgress() {
  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => (await request<{ completed: Completion[] }>("GET", "/learn/progress")).completed,
    staleTime: 60_000,
  });
  const done = new Set((q.data ?? []).map((c) => c.lesson_id));
  return { ...q, done };
}

export function useSetLessonDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lessonId, done, quizCorrect }: { lessonId: string; done: boolean; quizCorrect?: boolean | null }) => {
      const path = `/learn/progress/${encodeURIComponent(lessonId)}`;
      if (done) await request("PUT", path, { quiz_correct: quizCorrect ?? null });
      else await request("DELETE", path);
    },
    onMutate: async ({ lessonId, done }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<Completion[]>(KEY);
      qc.setQueryData<Completion[]>(KEY, (old = []) =>
        done
          ? old.some((c) => c.lesson_id === lessonId)
            ? old
            : [...old, { lesson_id: lessonId, completed_at: new Date().toISOString(), quiz_correct: null }]
          : old.filter((c) => c.lesson_id !== lessonId),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(KEY, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Forget every completed lesson (and so every milestone) for this user. */
export function useResetLearnProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<void>("DELETE", "/learn/progress"),
    onSuccess: () => qc.setQueryData<Completion[]>(KEY, []),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

import type { Metadata } from "next";
import { LessonView } from "@/components/app/learn/lesson-view";
import { findLesson } from "@/lib/learn/course";

export async function generateMetadata({ params }: PageProps<"/app/learn/[moduleId]/[lessonId]">): Promise<Metadata> {
  const { moduleId, lessonId } = await params;
  return { title: findLesson(moduleId, lessonId)?.lesson.title ?? "Learn" };
}

export default async function LessonPage({ params }: PageProps<"/app/learn/[moduleId]/[lessonId]">) {
  const { moduleId, lessonId } = await params;
  return <LessonView key={`${moduleId}.${lessonId}`} moduleId={moduleId} lessonId={lessonId} />;
}

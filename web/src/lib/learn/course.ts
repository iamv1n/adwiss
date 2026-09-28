import { ADWISE_MODULES } from "./content/adwise";
import { BASICS_MODULES } from "./content/basics";
import { GOOGLE_MODULES } from "./content/google";
import { META_MODULES } from "./content/meta";
import type { Lesson, Module, Track } from "./types";

export const TRACKS: { id: Track; label: string; blurb: string }[] = [
  { id: "basics", label: "Ad basics", blurb: "How paid ads work and the numbers that matter, on any platform." },
  { id: "meta", label: "Meta Ads", blurb: "Facebook and Instagram: set up, launch and optimize." },
  { id: "google", label: "Google Ads", blurb: "Search, Performance Max and more: set up, launch and optimize." },
  { id: "adwise", label: "Using Adwise", blurb: "Get the most out of Adwise's analytics, automations and leads." },
];

/** Every module in suggested order: basics first, then platforms, then Adwise. */
export const MODULES: Module[] = [...BASICS_MODULES, ...META_MODULES, ...GOOGLE_MODULES, ...ADWISE_MODULES];

export const lessonKey = (m: Module, l: Lesson) => `${m.id}.${l.id}`;

export const ALL_LESSON_KEYS = MODULES.flatMap((m) => m.lessons.map((l) => lessonKey(m, l)));

export function findLesson(moduleId: string, lessonId: string) {
  const m = MODULES.find((x) => x.id === moduleId);
  const i = m?.lessons.findIndex((l) => l.id === lessonId) ?? -1;
  if (!m || i < 0) return null;
  const flat = MODULES.flatMap((mm) => mm.lessons.map((l) => ({ module: mm, lesson: l })));
  const at = flat.findIndex((x) => x.module.id === m.id && x.lesson.id === lessonId);
  return { module: m, lesson: m.lessons[i], index: i, prev: flat[at - 1] ?? null, next: flat[at + 1] ?? null };
}

export function moduleMinutes(m: Module) {
  return m.lessons.reduce((n, l) => n + l.minutes, 0);
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  /** Lesson keys that must all be complete. */
  requires: string[];
}

const keysFor = (pred: (m: Module) => boolean) =>
  MODULES.filter(pred).flatMap((m) => m.lessons.map((l) => lessonKey(m, l)));

export const MILESTONES: Milestone[] = [
  {
    id: "first-step",
    title: "First step",
    description: "Complete your first lesson.",
    requires: [], // special-cased: any one lesson
  },
  {
    id: "fundamentals",
    title: "Knows the numbers",
    description: "Finish the Ad basics track.",
    requires: keysFor((m) => m.track === "basics"),
  },
  {
    id: "meta-ready",
    title: "Ready to launch on Meta",
    description: "Finish Meta setup and your first Meta ad.",
    requires: keysFor((m) => m.id === "meta-setup" || m.id === "meta-first-ad"),
  },
  {
    id: "google-ready",
    title: "Ready to launch on Google",
    description: "Finish Google setup and your first Google campaign.",
    requires: keysFor((m) => m.id === "google-setup" || m.id === "google-first-campaign"),
  },
  {
    id: "optimizer",
    title: "Optimizer",
    description: "Finish the optimize modules for Meta and Google.",
    requires: keysFor((m) => m.id === "meta-optimize" || m.id === "google-optimize"),
  },
  {
    id: "adwise-pro",
    title: "Adwise pro",
    description: "Finish the Using Adwise track.",
    requires: keysFor((m) => m.track === "adwise"),
  },
  {
    id: "graduate",
    title: "Ad graduate",
    description: "Complete every lesson.",
    requires: ALL_LESSON_KEYS,
  },
];

export function milestoneProgress(m: Milestone, done: Set<string>) {
  if (m.id === "first-step") return { done: done.size > 0 ? 1 : 0, total: 1 };
  const d = m.requires.filter((k) => done.has(k)).length;
  return { done: d, total: m.requires.length };
}

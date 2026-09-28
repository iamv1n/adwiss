"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * Steps a counter from 0..steps-1 on an interval, looping, only while the
 * element is on screen. Reduced-motion users get the final step, static.
 */
export function useTicker(steps: number, intervalMs: number) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const id = window.setInterval(() => setTick((t) => (t + 1) % steps), intervalMs);
    return () => window.clearInterval(id);
  }, [inView, reduce, steps, intervalMs]);

  return { ref, step: reduce ? steps - 1 : tick, reduce: !!reduce };
}

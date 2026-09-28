"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** Counts from the previous value to `value` when in view. Renders the final value on the server. */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString("en-US"),
  duration = 1.2,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const from = useRef(0);
  const [display, setDisplay] = useState<number | null>(null);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
      onComplete: () => {
        from.current = value;
      },
    });
    return () => {
      from.current = value;
      controls.stop();
    };
  }, [inView, value, reduce, duration]);

  const shown = reduce || display === null ? (inView || reduce ? value : 0) : display;
  return (
    <span ref={ref} className={className}>
      {format(shown)}
    </span>
  );
}

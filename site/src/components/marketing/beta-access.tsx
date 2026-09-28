"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Copy, KeyRound, Mail, MessageSquareReply, Sparkles } from "lucide-react";
import { ACCESS_HREF, CONTACT_EMAIL } from "@/lib/site";
import { Container, CtaLink, Eyebrow, Glow, GridBackdrop } from "./primitives";
import { Reveal } from "./reveal";

const STEPS = [
  { icon: Mail, title: "Send an email", body: "A line about your business, the ad platforms you use and roughly what you spend." },
  { icon: MessageSquareReply, title: "Get a reply", body: "Usually within a day or two, with any questions about your setup." },
  { icon: KeyRound, title: "Receive your invite", body: "An invite link to create your workspace and connect your ad accounts." },
] as const;

const PERKS = [
  "Free for the whole beta",
  "Every feature, including dayparting and the budget planner",
  "Direct line to the developer for feedback and requests",
  "Dry-run by default, so nothing changes until you say so",
];

function CopyEmail() {
  const [copied, setCopied] = useState(false);
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(CONTACT_EMAIL).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        });
      }}
      className="group flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-bg-subtle px-4 py-3 text-left outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Copy email address ${CONTACT_EMAIL}`}
    >
      <span className="min-w-0 truncate font-mono text-sm text-fg">{CONTACT_EMAIL}</span>
      <span className="relative grid size-7 shrink-0 place-items-center rounded-md bg-surface text-fg-muted ring-1 ring-border group-hover:text-fg">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={copied ? "done" : "copy"}
            initial={reduce ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduce ? undefined : { scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}

export function BetaAccess() {
  const reduce = useReducedMotion();
  return (
    <section id="beta" aria-labelledby="beta-title" className="relative isolate scroll-mt-20 overflow-hidden py-24 sm:py-32">
      <GridBackdrop className="[mask-image:radial-gradient(ellipse_60%_60%_at_50%_40%,black_20%,transparent_75%)]" />
      <Glow className="top-1/3 left-1/2 h-[24rem] w-[40rem] -translate-x-1/2" />
      <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Reveal>
            <Eyebrow>Closed beta</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2
              id="beta-title"
              className="font-display text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]"
            >
              Adwise is invite-only for now.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-xl text-base leading-relaxed text-pretty text-fg-muted sm:text-lg">
              New accounts are opened in small batches so every one gets set up properly. Send an email to ask for
              access. There&rsquo;s no pricing yet, and the beta is free.
            </p>
          </Reveal>
          <ul className="flex flex-col gap-2.5">
            {PERKS.map((p, i) => (
              <Reveal key={p} delay={0.15 + i * 0.06}>
                <li className="flex items-start gap-2.5 text-sm text-fg">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-subtle text-success-fg">
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                  {p}
                </li>
              </Reveal>
            ))}
          </ul>
        </div>

        <Reveal delay={0.1} y={28}>
          <div className="relative">
            {/* Slowly rotating conic ring behind the card. */}
            <motion.div
              aria-hidden="true"
              className="absolute -inset-px -z-10 rounded-[1.4rem] bg-[conic-gradient(from_0deg,transparent_0%,var(--color-primary)_18%,transparent_36%,transparent_60%,var(--color-chart-5)_78%,transparent_96%)] opacity-60 blur-[2px]"
              animate={reduce ? undefined : { rotate: 360 }}
              transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
              style={{ maskImage: "radial-gradient(closest-side, transparent 97%, black 98%)" }}
            />
            <div className="rounded-3xl border border-border bg-surface p-6 shadow-lg ring-1 ring-fg/5 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
                  <Sparkles className="size-4 text-primary" aria-hidden="true" /> Request beta access
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-2.5 py-0.5 text-[0.6875rem] font-medium text-success-fg">
                  <span className="relative flex size-1.5">
                    {!reduce && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />}
                    <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                  </span>
                  Accepting requests
                </span>
              </div>

              <ol className="relative mt-6 flex flex-col gap-5">
                <span aria-hidden="true" className="absolute top-2 bottom-2 left-[0.9375rem] w-px bg-border" />
                <motion.span
                  aria-hidden="true"
                  className="absolute top-2 left-[0.9375rem] w-px origin-top bg-primary"
                  initial={{ scaleY: reduce ? 1 : 0 }}
                  whileInView={{ scaleY: 1 }}
                  viewport={{ once: true, margin: "-20% 0px" }}
                  transition={{ duration: reduce ? 0 : 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                  style={{ bottom: "0.5rem" }}
                />
                {STEPS.map((s, i) => (
                  <motion.li
                    key={s.title}
                    className="relative flex gap-4"
                    initial={reduce ? false : { opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-20% 0px" }}
                    transition={{ duration: 0.5, delay: 0.25 + i * 0.35 }}
                  >
                    <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface text-primary shadow-xs">
                      <s.icon className="size-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-fg">{s.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-fg-muted">{s.body}</p>
                    </div>
                  </motion.li>
                ))}
              </ol>

              <div className="mt-7 flex flex-col gap-3">
                <CtaLink href={ACCESS_HREF} size="lg" className="w-full">
                  <Mail aria-hidden="true" /> Email for access
                </CtaLink>
                <CopyEmail />
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

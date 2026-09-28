"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  Clock,
  Inbox,
  Megaphone,
  Menu,
  Sparkles,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FEATURE_GROUPS, MORE_LINKS, type FeatureIcon } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { Container, CtaLink, ctaClasses } from "./primitives";

const ICONS: Record<FeatureIcon, LucideIcon> = {
  wallet: Wallet,
  megaphone: Megaphone,
  clock: Clock,
  workflow: Workflow,
  chart: BarChart3,
  inbox: Inbox,
};

const TOP_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#beta", label: "Beta access" },
] as const;

const triggerClass = (open: boolean) =>
  ctaClasses("ghost", "sm", cn("group font-normal", open && "bg-bg-subtle text-fg"));

/** Features mega menu: opens on hover (with a short close delay) or click, closes on Escape / outside click. */
function FeaturesMenu() {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const reduce = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const openNow = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  return (
    <div ref={wrapRef} className="relative" onPointerEnter={openNow} onPointerLeave={closeSoon}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="features-menu"
        onClick={() => setOpen((v) => !v)}
        className={triggerClass(open)}
      >
        Features
        <ChevronDown aria-hidden="true" className={cn("transition-transform duration-200", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id="features-menu"
            initial={reduce ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-full left-0 z-50 pt-2"
          >
            <div className="grid w-[46rem] grid-cols-[1fr_1fr_14rem] gap-1 overflow-hidden rounded-2xl border border-border bg-surface p-2 shadow-lg ring-1 ring-fg/5">
              {FEATURE_GROUPS.map((group) => (
                <div key={group.label} className="p-1">
                  <p className="px-3 pt-2 pb-1.5 font-mono text-[0.6875rem] tracking-wider text-fg-subtle uppercase">
                    {group.label}
                  </p>
                  <ul className="flex flex-col">
                    {group.links.map((l) => {
                      const Icon = ICONS[l.icon];
                      const current = pathname === l.href;
                      return (
                        <li key={l.href}>
                          <Link
                            href={l.href}
                            onClick={() => setOpen(false)}
                            aria-current={current ? "page" : undefined}
                            className="group/item flex gap-3 rounded-xl px-3 py-2.5 outline-none transition-colors hover:bg-bg-subtle focus-visible:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-bg text-fg-muted transition-colors group-hover/item:border-primary/30 group-hover/item:bg-primary/10 group-hover/item:text-primary">
                              <Icon className="size-4" aria-hidden="true" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-fg">{l.label}</span>
                              <span className="mt-0.5 block text-xs leading-snug text-fg-muted">{l.description}</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              <Link
                href="/budget-planner"
                onClick={() => setOpen(false)}
                className="group/card relative isolate m-1 flex flex-col justify-between overflow-hidden rounded-xl bg-linear-to-br from-primary/15 via-primary/5 to-transparent p-4 outline-none ring-1 ring-primary/15 transition-shadow hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div aria-hidden="true" className="absolute -right-10 -bottom-10 -z-10 size-36 rounded-full bg-primary/20 blur-2xl" />
                <div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[0.6875rem] font-medium text-primary-fg">
                    <Sparkles className="size-3" aria-hidden="true" /> New
                  </span>
                  <p className="mt-3 font-display text-base font-semibold tracking-tight text-fg">Budget planner</p>
                  <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                    Set one number for the month. Adwise paces it daily, splits it across campaigns and moves unused
                    budget to what&rsquo;s working.
                  </p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  See how it works
                  <ArrowRight className="size-3.5 transition-transform group-hover/card:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MoreMenu() {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className={ctaClasses("ghost", "sm", "group font-normal data-[state=open]:bg-bg-subtle data-[state=open]:text-fg")}>
        More
        <ChevronDown aria-hidden="true" className="transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-64 p-1.5">
        {MORE_LINKS.map((l) => (
          <DropdownMenuItem key={l.href} asChild className="cursor-pointer flex-col items-start gap-0.5 rounded-md px-3 py-2">
            <Link href={l.href}>
              <span className="text-sm font-medium text-fg">{l.label}</span>
              <span className="text-xs text-fg-muted">{l.description}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const mobileLinkClass =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-base text-fg outline-none hover:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-ring";

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b transition-colors duration-300",
        scrolled
          ? "border-border bg-bg/80 backdrop-blur-lg supports-[backdrop-filter]:bg-bg/70"
          : "border-transparent bg-transparent",
      )}
    >
      <Container className="flex h-16 items-center gap-6">
        <Link href="/" aria-label="Adwise home" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            <li>
              <FeaturesMenu />
            </li>
            {TOP_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={ctaClasses("ghost", "sm", "font-normal")}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <MoreMenu />
            </li>
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <CtaLink href="/#beta" size="sm" className="hidden sm:inline-flex">
            Request access
          </CtaLink>

          <Sheet>
            <SheetTrigger className={ctaClasses("ghost", "sm", "md:hidden size-9 px-0")} aria-label="Open menu">
              <Menu />
            </SheetTrigger>
            <SheetContent side="right" className="w-[88vw] max-w-sm border-border bg-bg">
              <SheetHeader className="border-b border-border">
                <SheetTitle className="text-left">
                  <Logo />
                </SheetTitle>
                <SheetDescription className="sr-only">Site navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="overflow-y-auto px-2">
                {FEATURE_GROUPS.map((group) => (
                  <div key={group.label} className="py-2">
                    <p className="px-3 pb-1 font-mono text-[0.6875rem] tracking-wider text-fg-subtle uppercase">{group.label}</p>
                    <ul className="flex flex-col">
                      {group.links.map((l) => {
                        const Icon = ICONS[l.icon];
                        return (
                          <li key={l.href}>
                            <SheetClose asChild>
                              <Link href={l.href} className={mobileLinkClass}>
                                <Icon className="size-4 text-fg-muted" aria-hidden="true" />
                                {l.label}
                              </Link>
                            </SheetClose>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                <div className="border-t border-border py-2">
                  <ul className="flex flex-col">
                    {[...TOP_LINKS, ...MORE_LINKS].map((l) => (
                      <li key={l.href}>
                        <SheetClose asChild>
                          <Link href={l.href} className={mobileLinkClass}>
                            {l.label}
                          </Link>
                        </SheetClose>
                      </li>
                    ))}
                  </ul>
                </div>
              </nav>
              <div className="mt-auto flex flex-col gap-2 border-t border-border p-4">
                <CtaLink href="/#beta" size="lg">
                  Request access
                </CtaLink>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </Container>
    </header>
  );
}

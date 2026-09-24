"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { Container, CtaLink, ctaClasses } from "./primitives";

export const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#dayparting", label: "Dayparting" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const;

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
        <Link
          href="/"
          aria-label="Adwise home"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo />
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className={ctaClasses("ghost", "sm", "font-normal")}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <CtaLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Log in
          </CtaLink>
          <CtaLink href="/signup" size="sm" className="hidden sm:inline-flex">
            Get started
          </CtaLink>

          <Sheet>
            <SheetTrigger
              className={ctaClasses("ghost", "sm", "md:hidden size-9 px-0")}
              aria-label="Open menu"
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-sm border-border bg-bg">
              <SheetHeader className="border-b border-border">
                <SheetTitle className="text-left">
                  <Logo />
                </SheetTitle>
                <SheetDescription className="sr-only">Site navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="px-2">
                <ul className="flex flex-col">
                  {NAV_LINKS.map((l) => (
                    <li key={l.href}>
                      <SheetClose asChild>
                        <a
                          href={l.href}
                          className="flex rounded-md px-3 py-3 text-base text-fg outline-none hover:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {l.label}
                        </a>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="mt-auto flex flex-col gap-2 border-t border-border p-4">
                <CtaLink href="/login" variant="secondary" size="lg">
                  Log in
                </CtaLink>
                <CtaLink href="/signup" size="lg">
                  Get started
                </CtaLink>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </Container>
    </header>
  );
}

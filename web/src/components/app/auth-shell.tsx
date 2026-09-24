import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/theme-toggle";

interface AuthShellProps {
  children: React.ReactNode;
  illustration: React.ReactNode;
  asideTitle: string;
  asideBody: string;
  asidePoints?: string[];
}

/** Split-screen layout for auth / onboarding: form on the left, visual on the right. */
export function AuthShell({ children, illustration, asideTitle, asideBody, asidePoints }: AuthShellProps) {
  return (
    <div className="grid min-h-dvh flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label="Adwise home"
          >
            <Logo />
          </Link>
          <ThemeToggle />
        </header>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
        <footer className="text-center text-xs text-fg-subtle lg:text-left">
          © {new Date().getFullYear()} Adwise. Built for performance marketers.
        </footer>
      </div>

      <aside
        aria-label="About Adwise"
        className="relative hidden overflow-hidden border-l border-border bg-bg-subtle lg:flex lg:flex-col lg:justify-between lg:p-12"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,var(--color-fg)_30%,transparent_75%)] opacity-70"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 -right-40 size-[32rem] rounded-full bg-primary/15 blur-3xl"
        />
        <div className="relative mx-auto mt-6 w-full max-w-md">{illustration}</div>
        <div className="relative max-w-md">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-balance text-fg">
            {asideTitle}
          </h2>
          <p className="mt-3 text-fg-muted">{asideBody}</p>
          {asidePoints && (
            <ul className="mt-6 grid gap-2.5">
              {asidePoints.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-sm text-fg">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

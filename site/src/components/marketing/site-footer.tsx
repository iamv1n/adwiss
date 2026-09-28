import Link from "next/link";
import { CONTACT_HREF, CONTACT_EMAIL, FEATURE_LINKS, LEGAL_LINKS } from "@/lib/site";
import { Logo } from "./logo";
import { Container } from "./primitives";

const COLUMNS = [
  {
    title: "Features",
    links: FEATURE_LINKS.map(({ href, label }) => ({ href, label })),
  },
  {
    title: "Resources",
    links: [
      { label: "Learn", href: "/learn" },
      { label: "Changelog", href: "/changelog" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Beta access", href: "/#beta" },
      { label: "Safety & audit", href: "/#safety" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Adwise",
    links: [
      { label: "Contact", href: CONTACT_HREF },
      ...LEGAL_LINKS,
      
    ],
  },
];

const linkClass =
  "rounded-sm text-sm text-fg-muted transition-colors outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-bg-subtle">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="flex max-w-xs flex-col gap-3">
          <Link href="/" aria-label="Adwise home" className="self-start rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo />
          </Link>
          <p className="text-sm leading-relaxed text-fg-muted">
            Find wasted spend, back the hours that convert, and act safely with previews, approvals and a full audit trail.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-xs font-semibold tracking-wider text-fg uppercase">{col.title}</h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.href.startsWith("/") ? (
                    <Link href={l.href} className={linkClass}>
                      {l.label}
                    </Link>
                  ) : (
                    <a href={l.href} className={linkClass}>
                      {l.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <Container className="flex flex-col gap-2 border-t border-border py-6 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} Adwise · an independent app ·{" "}
          <a href={CONTACT_HREF} className="underline-offset-2 hover:text-fg hover:underline">
            {CONTACT_EMAIL}
          </a>
        </p>
        <p>
          Meta and Google Ads are trademarks of their respective owners. Adwise is not affiliated with or endorsed by
          them.
        </p>
      </Container>
    </footer>
  );
}

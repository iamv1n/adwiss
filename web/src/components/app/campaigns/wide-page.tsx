/**
 * Lets the Campaigns pages use the full width of the app shell's <main>
 * (normally max-w-6xl) and trims its top/bottom padding, like Ads Manager.
 * Scoped with :has() so no other page is affected.
 */
const CSS = `#main:has([data-campaigns-wide]){max-width:none;padding-top:1rem;padding-bottom:1rem}`;

export function WidePage({ children }: { children: React.ReactNode }) {
  return (
    <div data-campaigns-wide="" className="min-w-0">
      <style href="adwise-campaigns-wide" precedence="default">
        {CSS}
      </style>
      {children}
    </div>
  );
}

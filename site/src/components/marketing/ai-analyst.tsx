import { Check, Sparkles, Wrench } from "lucide-react";
import { AiAnswersIllustration } from "./illustrations/ai-answers";
import { Container, Provider, SectionHeader, WindowFrame } from "./primitives";
import { Reveal } from "./reveal";

const WASTE = [
  { name: "Late-night · Advantage+", provider: "Meta", spend: "₹18,700", conv: 2, roas: "0.41×" },
  { name: "Generic Search · Broad", provider: "Google", spend: "₹14,250", conv: 3, roas: "0.63×" },
  { name: "Lookalike 3% · Video", provider: "Meta", spend: "₹9,980", conv: 1, roas: "0.29×" },
] as const;

const TOOLS = ["get_campaign_metrics", "compare_periods", "get_hourly_performance"];

export function AiAnalyst() {
  return (
    <section aria-labelledby="ai-title" className="relative py-24 sm:py-32">
      <Container className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="flex flex-col gap-8">
          <SectionHeader
            id="ai-title"
            align="left"
            eyebrow="AI analyst"
            title="Ask it like you’d ask your best analyst."
            description="The AI analyst answers from structured tools over your own ad data, shows its working, and proposes actions. It never makes a change on its own. You approve, and the approval lands in the audit log."
          />
          <ul className="grid gap-2 text-sm text-fg-muted sm:grid-cols-2">
            {[
              "Why did ROAS drop yesterday?",
              "What are my best-performing hours?",
              "Compare this week vs last week",
              "Which campaigns spend without converting?",
            ].map((q) => (
              <li key={q} className="rounded-lg border border-border bg-surface px-3 py-2">
                “{q}”
              </li>
            ))}
          </ul>
          <AiAnswersIllustration className="hidden h-44 w-auto self-start lg:block" />
        </div>

        <Reveal>
          <WindowFrame title="Adwise · AI analyst">
            <div className="flex flex-col gap-4 p-4 sm:p-5">
              <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-fg">
                Which campaigns wasted the most money yesterday?
              </p>

              <div className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">Adwise AI:</span>
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-3 text-sm">
                  <p className="flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-fg-subtle">
                    <Wrench className="size-3" aria-hidden="true" />
                    {TOOLS.map((t) => (
                      <code key={t} className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono">
                        {t}
                      </code>
                    ))}
                  </p>
                  <p className="text-fg">
                    Three campaigns spent <strong className="font-semibold">₹42,930</strong> yesterday and
                    returned only ₹19,540, a <strong className="font-semibold">0.46× ROAS</strong>. 71% of that
                    spend landed between 23:00 and 05:00 IST.
                  </p>

                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <caption className="sr-only">Campaigns with the most wasted spend yesterday</caption>
                      <thead className="bg-bg-subtle text-fg-subtle">
                        <tr>
                          <th scope="col" className="px-3 py-2 text-left font-medium">Campaign</th>
                          <th scope="col" className="px-2 py-2 text-right font-medium">Spend</th>
                          <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Conv.</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">ROAS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {WASTE.map((w) => (
                          <tr key={w.name}>
                            <th scope="row" className="w-full max-w-0 px-3 py-2 text-left font-normal">
                              <span className="flex items-center gap-1.5">
                                <Provider name={w.provider} />
                                <span className="truncate text-fg">{w.name}</span>
                              </span>
                            </th>
                            <td className="px-2 py-2 text-right font-mono text-fg tabular-nums">{w.spend}</td>
                            <td className="hidden px-2 py-2 text-right font-mono text-fg-muted tabular-nums sm:table-cell">{w.conv}</td>
                            <td className="px-3 py-2 text-right font-mono font-medium text-danger-fg tabular-nums">{w.roas}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                    <p className="text-xs font-medium text-fg">Suggested action</p>
                    <p className="mt-1 text-xs text-fg-muted">
                      Add a night pause (Mon–Sun 23:00–05:00 IST) to these 3 campaigns. Dry-run: 3 campaigns, 2
                      accounts, no conflicts.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-fg shadow-sm">
                        <Check className="size-3.5" aria-hidden="true" /> Approve action
                      </span>
                      <span className="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium text-fg">
                        Review details
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </WindowFrame>
        </Reveal>
      </Container>
    </section>
  );
}

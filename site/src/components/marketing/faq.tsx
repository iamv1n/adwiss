import { CONTACT_HREF } from "@/lib/site";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Container, SectionHeader } from "./primitives";

const FAQS = [
  {
    q: "Which ad platforms does Adwise support?",
    a: "Meta Ads (Facebook and Instagram ad accounts) and Google Ads. Adwise syncs campaigns, ad sets or ad groups, ads and creatives along with hourly performance data.",
  },
  {
    q: "Do I have to connect both platforms?",
    a: "No. Either one works on its own. Connect only Meta Ads or only Google Ads and every feature is available for it, and you can add the other platform later if you want.",
  },
  {
    q: "Will Adwise change my campaigns without asking?",
    a: "No. Connecting an account is read-only until you enable a rule or schedule. Every rule shows a dry-run preview first, and AI suggestions always need a human to approve them. Every action that does run is written to the audit log.",
  },
  {
    q: "How does dayparting work across time zones?",
    a: "Schedules are timezone-aware. You set a timezone per rule (for example Asia/Kolkata), and the dayparting engine checks the current time in that zone, compares desired and current campaign state, and only sends a change when one is needed.",
  },
  {
    q: "What happens if a dayparting schedule and an automation rule disagree?",
    a: "Adwise checks for conflicts between schedules, automation rules, manual changes and budget limits before it acts. Precedence is deterministic, and a blocked action is logged with the reason so you can see what happened.",
  },
  {
    q: "How fresh is the data?",
    a: "Performance data syncs hourly, including hour-level breakdowns where the provider supports them. Recent hours can still be revised by Meta or Google, so Adwise re-pulls a trailing window to keep numbers aligned with the platforms.",
  },
  {
    q: "Where do the AI analyst's answers come from?",
    a: "The analyst calls a fixed set of structured tools over your synced ad data, such as campaign metrics, period comparisons, hourly performance and recent actions, instead of writing arbitrary queries. It shows which tools it used, and any change it proposes goes through approval.",
  },
  {
    q: "Can agencies manage multiple clients?",
    a: "Yes. Each workspace has roles (Owner, Admin, Member), and every change is recorded with who made it. Create a workspace per client to keep schedules, rules and history separate.",
  },
  {
    q: "How do I get access?",
    a: "Adwise is in a closed beta. Email for an invite with a line about your business and ad spend. The beta is free, includes every feature, and you can connect real accounts and run dry-runs straight away.",
  },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 border-t border-border py-24 sm:py-32">
      <Container className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <SectionHeader
          id="faq-title"
          align="left"
          eyebrow="FAQ"
          title="Questions, answered."
          description={
            <>
              Something else on your mind?{" "}
              <a
                href={CONTACT_HREF}
                className="font-medium text-fg underline decoration-border-strong underline-offset-4 outline-none hover:decoration-fg focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                Get in touch
              </a>
              .
            </>
          }
        />
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((f, i) => (
            <AccordionItem key={f.q} value={`item-${i}`} className="border-border">
              <AccordionTrigger className="py-5 text-left text-base font-medium text-fg hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-sm leading-relaxed text-fg-muted">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Container>
    </section>
  );
}

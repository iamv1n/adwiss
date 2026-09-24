import type { Metadata } from "next";
import { AiAnalyst } from "@/components/marketing/ai-analyst";
import { Dayparting } from "@/components/marketing/dayparting";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Pricing } from "@/components/marketing/pricing";
import { Safety } from "@/components/marketing/safety";

const title = "Adwise: stop wasting ad spend and back the hours that pay";
const description =
  "Find wasted ad spend, see the hours your ads actually convert, catch budget and performance problems early, and act with dayparting schedules, rules and an AI analyst. Dry-runs, approvals and a full audit trail included. Works with Meta Ads and Google Ads.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  openGraph: {
    title,
    description,
    type: "website",
    siteName: "Adwise",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <Features />
      <Dayparting />
      <HowItWorks />
      <AiAnalyst />
      <Safety />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}

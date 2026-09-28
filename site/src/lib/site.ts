/** Adwise is an independent app, not a company. One contact address for everything. */
export const CONTACT_EMAIL = "vineet.likhitkar@gmail.com";
export const CONTACT_HREF = `mailto:${CONTACT_EMAIL}`;

export type FeatureLink = { href: string; label: string; description: string; icon: FeatureIcon };
export type FeatureIcon = "wallet" | "megaphone" | "clock" | "workflow" | "chart" | "inbox";

/** What Adwise does, grouped the way the Features menu shows it. */
export const FEATURE_GROUPS: { label: string; links: FeatureLink[] }[] = [
  {
    label: "Spend & budgets",
    links: [
      { href: "/budget-planner", label: "Budget planner", description: "One budget for the month, paced and split for you.", icon: "wallet" },
      { href: "/dayparting", label: "Dayparting", description: "Run ads in the hours that convert, pause the rest.", icon: "clock" },
      { href: "/campaigns", label: "Campaigns & spend", description: "Budgets, spend caps and status in one place.", icon: "megaphone" },
    ],
  },
  {
    label: "Automate & measure",
    links: [
      { href: "/automation", label: "Automation rules", description: "Pause, scale and notify when numbers cross a line.", icon: "workflow" },
      { href: "/analytics", label: "Analytics", description: "Trends, breakdowns and the wasted-spend finder.", icon: "chart" },
      { href: "/results", label: "Results & leads", description: "Leads into a pipeline, with cost per lead.", icon: "inbox" },
    ],
  },
];

export const FEATURE_LINKS = FEATURE_GROUPS.flatMap((g) => g.links);

export const MORE_LINKS = [
  { href: "/learn", label: "Learn", description: "Plain-English guides to running Meta and Google ads." },
  { href: "/#faq", label: "FAQ", description: "Answers to common questions." },
  { href: CONTACT_HREF, label: "Contact", description: CONTACT_EMAIL },
] as const;

export const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
] as const;

/** Adwise is in closed beta: access is requested by email. */
export const ACCESS_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Adwise beta access")}&body=${encodeURIComponent(
  "Hi,\n\nI'd like access to the Adwise beta.\n\nName:\nBusiness / website:\nAd platforms (Meta, Google):\nApprox. monthly ad spend:\n\nThanks!",
)}`;

/**
 * Ready-to-use brand copy for the Brand kit. Lead with what Adwise does for
 * someone's ads (stop waste, find what works, turn leads into sales); the
 * platforms are a supporting detail, not the pitch. No invented numbers or
 * customer claims: everything here is true of the product today.
 */

export interface CopyItem {
  text: string;
  /** Platform character limit, when there is one. */
  limit?: number;
  note?: string;
}

export interface CopyGroup {
  id: string;
  title: string;
  description?: string;
  /** Items can be used as the banner headline (short lines). */
  headline?: boolean;
  items: CopyItem[];
}

export const COPY_GROUPS: CopyGroup[] = [
  {
    id: "taglines",
    title: "Taglines",
    description: "Short lines for banners, headers and the top of posts.",
    headline: true,
    items: [
      { text: "Ads that pay off." },
      { text: "Stop paying for ads that don't work." },
      { text: "Every rupee of ad spend, working." },
      { text: "Know what's working. Fix what isn't." },
      { text: "Smarter ads, on autopilot." },
      { text: "From clicks to customers." },
      { text: "Less guessing. More growing." },
      { text: "Your ads, finally making sense." },
    ],
  },
  {
    id: "one-liners",
    title: "One-liners",
    description: "What Adwise is, in one sentence. Good for bios, intros and meta descriptions.",
    items: [
      { text: "Adwise shows which ads make you money, stops the ones that don't, and scales the ones that do." },
      { text: "Adwise is the ads co-pilot for growing businesses: clear results, automatic fixes, and leads you can track to real sales." },
      { text: "See every campaign's real results, cut wasted spend automatically, and learn to run ads like a pro, all in Adwise." },
      { text: "Adwise helps businesses spend less on ads that don't work and more on the ones that do.", limit: 160, note: "Fits a meta description" },
    ],
  },
  {
    id: "pitch",
    title: "Elevator pitch",
    description: "For intros, cold messages, pitch decks and the About section.",
    items: [
      {
        text: "Most businesses running ads can't tell which ones actually make money, so they keep paying for the ones that don't. Adwise connects your Meta and Google ad accounts, shows what each campaign really earns, and fixes problems for you: it pauses campaigns that spend without results, scales the winners, and turns ads off at hours that never convert.",
        note: "30 seconds",
      },
      {
        text: "Adwise is an ads co-pilot for growing businesses. It pulls in your Meta and Google campaigns and shows what's really working, down to the ad and the hour of the day. Automation rules pause wasted spend and scale winners, with a dry run first so nothing changes until you trust it. Recommendations suggest the next best change, which you apply in one click and can undo any time. And for lead businesses like real estate, education and services, Adwise tracks each lead to the sale, so you finally see your cost per deal and real return, not just cost per lead.",
        note: "60 seconds",
      },
    ],
  },
  {
    id: "bios",
    title: "Profile bios",
    description: "Sized for each platform. The counter turns red if a line runs over.",
    items: [
      { text: "Ads that pay off. Adwise finds your winning ads, stops wasted spend and tracks leads to real sales, for Meta and Google Ads.", limit: 160, note: "X (Twitter) bio" },
      { text: "Ads that pay off 📈\nStop wasted spend. Scale what works.\nMeta + Google ads, made simple 👇", limit: 150, note: "Instagram bio" },
      { text: "Ads that pay off: analytics, automation and lead tracking for Meta and Google Ads.", limit: 120, note: "LinkedIn company tagline" },
      { text: "Adwise helps businesses stop wasting ad spend: clear results, automatic fixes and leads tracked to sales.", limit: 139, note: "WhatsApp Business \"About\"" },
      { text: "Adwise helps businesses get more from their Meta and Google ads. See which campaigns really make money, pause wasted spend automatically, and track every lead to the sale.", limit: 255, note: "Facebook Page intro" },
    ],
  },
  {
    id: "about",
    title: "About / boilerplate",
    description: "The standard company description for LinkedIn About, press, directories and partner pages.",
    items: [
      {
        text: "Adwise is an advertising co-pilot for growing businesses. It connects Meta and Google ad accounts and turns their data into clear answers and actions: which campaigns make money, which waste it, and what to change next.\n\nWith Adwise, teams can:\n• See real results for every campaign, ad and hour of the day\n• Pause wasted spend and scale winners automatically, with safe dry runs first\n• Turn ads off at hours that never convert (dayparting)\n• Apply recommended fixes in one click, and undo any change\n• Track leads from ad to sale, with cost per deal and real ROAS\n• Get alerts when spend spikes, results drop or a campaign stops running\n• Learn to run great ads with built-in lessons for Meta and Google\n\nAdwise is built for founders, marketers and agencies who want every rupee of ad spend to work.",
        limit: 2000,
        note: "LinkedIn About (2,000 max)",
      },
    ],
  },
  {
    id: "features",
    title: "Feature lines",
    description: "One benefit per line, for carousels, landing pages and ads.",
    items: [
      { text: "See which ads actually make money, not just which ones get clicks." },
      { text: "Pause campaigns that spend without results, automatically." },
      { text: "Scale your winners in safe 20% steps." },
      { text: "Turn ads off at the hours that never convert." },
      { text: "Every automation starts in dry run, so nothing changes until you're sure." },
      { text: "One-click recommendations, and one-click undo." },
      { text: "Leads land in Adwise the moment someone fills your form." },
      { text: "Mark a lead won and see your real cost per sale." },
      { text: "Get an alert before a bad day becomes a bad month." },
      { text: "Spot tired ads before your audience tunes them out." },
    ],
  },
  {
    id: "posts",
    title: "Post templates",
    description: "Starting points for social posts. Replace anything in [brackets].",
    items: [
      {
        text: "Most ad accounts have a leak.\n\nA campaign that spends every day and never converts. An ad people have seen 6 times and stopped clicking. Ads running at 3am for a business that sells at noon.\n\nAdwise finds these and fixes them for you, automatically, with a dry run first so you stay in control.\n\nStop paying for ads that don't work → [link]",
        note: "Problem → solution",
      },
      {
        text: "Cost per lead: ₹150. Looks great.\n\nBut if only 1 in 40 leads buys, your cost per sale is ₹6,000.\n\nAdwise tracks every lead from your ad to the sale, so you see the number that actually matters: what each customer costs you.\n\nTry it → [link]",
        note: "Lead businesses (example numbers)",
      },
      {
        text: "New in Adwise: [feature name] ✨\n\n[One sentence on what it does.]\n\nWhy it matters: [the problem it solves].\n\nAvailable now for everyone → [link]",
        note: "Feature launch",
      },
      {
        text: "Ad tip #[n]: [tip in one line]\n\n[Two or three sentences explaining why, with a simple ₹ example.]\n\nWant more? Adwise has free lessons on Meta and Google ads, built right into the app → [link]",
        note: "Weekly tip",
      },
      {
        text: "Your Meta ads just exited the learning phase. Don't touch them.\n\nBig budget jumps, new audiences or new creatives reset it, and your costs spike again.\n\nScale in ~20% steps every few days instead. Adwise can do it for you, safely → [link]",
        note: "Educational",
      },
    ],
  },
  {
    id: "ctas",
    title: "Calls to action",
    items: [
      { text: "Start free" },
      { text: "Connect your ad account" },
      { text: "See what your ads really earn" },
      { text: "Find your wasted spend" },
      { text: "Stop paying for ads that don't work" },
      { text: "Try Adwise free" },
    ],
  },
  {
    id: "hashtags",
    title: "Hashtags",
    items: [
      { text: "#Adwise #AdsThatPayOff", note: "Brand" },
      { text: "#PerformanceMarketing #DigitalMarketing #PPC #MetaAds #GoogleAds #ROAS", note: "Topic" },
      { text: "#SmallBusinessIndia #D2CIndia #StartupIndia #MarketingTips", note: "India" },
    ],
  },
];

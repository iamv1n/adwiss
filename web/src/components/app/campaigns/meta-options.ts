import type { Attribution, BidStrategy, CallToAction, MetaObjective } from "@/lib/manage-api";

/** Meta objectives in plain words. */
export const OBJECTIVES: { value: MetaObjective; label: string; description: string }[] = [
  { value: "OUTCOME_AWARENESS", label: "Awareness", description: "Show ads to the most people likely to remember them." },
  { value: "OUTCOME_TRAFFIC", label: "Traffic", description: "Send people to your website or app." },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement", description: "Get more likes, comments, shares and video views." },
  { value: "OUTCOME_LEADS", label: "Leads", description: "Collect sign-ups and enquiries for your business." },
  { value: "OUTCOME_APP_PROMOTION", label: "App promotion", description: "Find people to install and use your app." },
  { value: "OUTCOME_SALES", label: "Sales", description: "Find people likely to buy your product or service." },
];

export interface GoalOption {
  value: string;
  label: string;
  destination?: string;
}

/**
 * Optimization goals that work without a pixel or app setup, per objective.
 * The first entry is the default.
 */
export const GOALS: Record<MetaObjective, GoalOption[]> = {
  OUTCOME_AWARENESS: [
    { value: "REACH", label: "Reach (most people)" },
    { value: "IMPRESSIONS", label: "Impressions" },
    { value: "AD_RECALL_LIFT", label: "Ad recall lift" },
    { value: "THRUPLAY", label: "ThruPlay (video views)" },
  ],
  OUTCOME_TRAFFIC: [
    { value: "LINK_CLICKS", label: "Link clicks", destination: "WEBSITE" },
    { value: "LANDING_PAGE_VIEWS", label: "Landing page views", destination: "WEBSITE" },
    { value: "REACH", label: "Reach", destination: "WEBSITE" },
    { value: "IMPRESSIONS", label: "Impressions", destination: "WEBSITE" },
  ],
  OUTCOME_ENGAGEMENT: [
    { value: "POST_ENGAGEMENT", label: "Post engagement", destination: "ON_POST" },
    { value: "THRUPLAY", label: "ThruPlay (video views)", destination: "ON_VIDEO" },
    { value: "IMPRESSIONS", label: "Impressions", destination: "ON_POST" },
  ],
  OUTCOME_LEADS: [
    { value: "LEAD_GENERATION", label: "Leads (instant form)", destination: "ON_AD" },
    { value: "LANDING_PAGE_VIEWS", label: "Landing page views", destination: "WEBSITE" },
    { value: "LINK_CLICKS", label: "Link clicks", destination: "WEBSITE" },
  ],
  OUTCOME_APP_PROMOTION: [
    { value: "APP_INSTALLS", label: "App installs", destination: "APP" },
    { value: "LINK_CLICKS", label: "Link clicks", destination: "APP" },
  ],
  OUTCOME_SALES: [
    { value: "OFFSITE_CONVERSIONS", label: "Conversions", destination: "WEBSITE" },
    { value: "LANDING_PAGE_VIEWS", label: "Landing page views", destination: "WEBSITE" },
    { value: "LINK_CLICKS", label: "Link clicks", destination: "WEBSITE" },
  ],
};

export function goalsFor(objective: string | undefined): GoalOption[] {
  return GOALS[objective as MetaObjective] ?? GOALS.OUTCOME_TRAFFIC;
}

export const CTAS: { value: CallToAction; label: string }[] = [
  { value: "LEARN_MORE", label: "Learn more" },
  { value: "SHOP_NOW", label: "Shop now" },
  { value: "SIGN_UP", label: "Sign up" },
  { value: "CONTACT_US", label: "Contact us" },
  { value: "DOWNLOAD", label: "Download" },
  { value: "GET_OFFER", label: "Get offer" },
  { value: "BOOK_TRAVEL", label: "Book now" },
  { value: "SUBSCRIBE", label: "Subscribe" },
];

export const SPECIAL_CATEGORIES: { value: string; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "HOUSING", label: "Housing" },
  { value: "EMPLOYMENT", label: "Employment" },
  { value: "FINANCIAL_PRODUCTS_SERVICES", label: "Financial products and services" },
  { value: "ISSUES_ELECTIONS_POLITICS", label: "Social issues, elections or politics" },
];

/** ISO 3166-1 alpha-2 codes Meta accepts for country targeting. */
const CODES =
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CD CF CG CH CI CK CL CM CN CO CR CV CW CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IS IT JE JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW";

let names: Intl.DisplayNames | null | undefined;
export function countryName(code: string): string {
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames(undefined, { type: "region" });
    } catch {
      names = null;
    }
  }
  try {
    return names?.of(code) ?? code;
  } catch {
    return code;
  }
}

let sorted: { code: string; name: string }[] | null = null;
export function countries(): { code: string; name: string }[] {
  if (!sorted)
    sorted = CODES.split(" ")
      .map((code) => ({ code, name: countryName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}

export const AGES = Array.from({ length: 65 - 13 + 1 }, (_, i) => 13 + i);

/** Pixel events for Sales ad sets (promoted_object.custom_event_type). */
export const PIXEL_EVENTS: { value: string; label: string }[] = [
  { value: "PURCHASE", label: "Purchase" },
  { value: "ADD_TO_CART", label: "Add to cart" },
  { value: "INITIATE_CHECKOUT", label: "Initiate checkout" },
  { value: "ADD_PAYMENT_INFO", label: "Add payment info" },
  { value: "CONTENT_VIEW", label: "View content" },
  { value: "LEAD", label: "Lead" },
  { value: "COMPLETE_REGISTRATION", label: "Complete registration" },
];

/** Objectives whose ad sets need a promoted_object. */
export const NEEDS_PROMOTED_OBJECT = new Set(["OUTCOME_SALES", "OUTCOME_LEADS", "OUTCOME_APP_PROMOTION"]);

/** Where ads can show, by platform (Meta position ids → labels). */
export const PLACEMENTS: {
  platform: "facebook" | "instagram" | "messenger" | "audience_network";
  label: string;
  key: "facebook_positions" | "instagram_positions" | "messenger_positions" | "audience_network_positions";
  positions: { value: string; label: string }[];
}[] = [
  {
    platform: "facebook",
    label: "Facebook",
    key: "facebook_positions",
    positions: [
      { value: "feed", label: "Feed" },
      { value: "profile_feed", label: "Profile feed" },
      { value: "story", label: "Stories" },
      { value: "facebook_reels", label: "Reels" },
      { value: "facebook_reels_overlay", label: "Ads on Reels" },
      { value: "video_feeds", label: "Video feeds" },
      { value: "instream_video", label: "In-stream videos" },
      { value: "marketplace", label: "Marketplace" },
      { value: "search", label: "Search results" },
      { value: "right_hand_column", label: "Right column" },
      { value: "notification", label: "Notifications" },
    ],
  },
  {
    platform: "instagram",
    label: "Instagram",
    key: "instagram_positions",
    positions: [
      { value: "stream", label: "Feed" },
      { value: "profile_feed", label: "Profile feed" },
      { value: "story", label: "Stories" },
      { value: "reels", label: "Reels" },
      { value: "profile_reels", label: "Profile reels" },
      { value: "explore", label: "Explore" },
      { value: "explore_home", label: "Explore home" },
      { value: "ig_search", label: "Search results" },
    ],
  },
  {
    platform: "messenger",
    label: "Messenger",
    key: "messenger_positions",
    positions: [
      { value: "messenger_home", label: "Inbox" },
      { value: "story", label: "Stories" },
      { value: "sponsored_messages", label: "Sponsored messages" },
    ],
  },
  {
    platform: "audience_network",
    label: "Audience Network",
    key: "audience_network_positions",
    positions: [
      { value: "classic", label: "Native, banner and interstitial" },
      { value: "rewarded_video", label: "Rewarded videos" },
    ],
  },
];

export const BID_STRATEGIES: { value: BidStrategy; label: string; hint: string }[] = [
  { value: "LOWEST_COST_WITHOUT_CAP", label: "Highest volume", hint: "Get the most results for the budget. No cost control." },
  { value: "COST_CAP", label: "Cost per result goal", hint: "Keep the average cost per result around your goal." },
  { value: "LOWEST_COST_WITH_BID_CAP", label: "Bid cap", hint: "Never bid more than this in any auction. Can limit delivery." },
  { value: "LOWEST_COST_WITH_MIN_ROAS", label: "ROAS goal", hint: "Keep return on ad spend above a minimum. Needs purchase value tracking." },
];

export const ATTRIBUTIONS: { value: Attribution; label: string }[] = [
  { value: "7d_click_1d_view", label: "7-day click or 1-day view (default)" },
  { value: "7d_click", label: "7-day click" },
  { value: "1d_click_1d_view", label: "1-day click or 1-day view" },
  { value: "1d_click", label: "1-day click" },
];

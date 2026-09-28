/**
 * Public Learn guides. Condensed from the in-app course into self-contained articles.
 * Inline text supports **bold** and `code`.
 */

export type GuideTrack = "foundations" | "meta" | "google";

export type GuideBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: { title: string; text: string }[] }
  | { type: "terms"; items: { term: string; def: string }[] }
  | { type: "callout"; tone: "tip" | "warning"; title: string; text: string };

export type GuideSection = { id: string; heading: string; blocks: GuideBlock[] };

export type Guide = {
  slug: string;
  track: GuideTrack;
  title: string;
  summary: string;
  minutes: number;
  sections: GuideSection[];
};

export const TRACKS: { id: GuideTrack; label: string; description: string }[] = [
  {
    id: "foundations",
    label: "Foundations",
    description: "The numbers behind every ad account, whichever platform you use.",
  },
  {
    id: "meta",
    label: "Meta ads",
    description: "Facebook and Instagram: from a clean setup to scaling what works.",
  },
  {
    id: "google",
    label: "Google Ads",
    description: "Search campaigns, conversion tracking and cutting wasted clicks.",
  },
];

export const GUIDES: Guide[] = [
  {
    slug: "target-cpa-and-roas",
    track: "foundations",
    title: "Set a target CPA and ROAS from your margins",
    summary: "Work out what a sale or a lead is actually worth to you before judging any campaign.",
    minutes: 5,
    sections: [
      {
        id: "why",
        heading: "There is no universal good number",
        blocks: [
          {
            type: "p",
            text: "Is a cost per acquisition (CPA) of ₹400 good? Is a return on ad spend (ROAS) of 3x good? It depends entirely on how much money you keep from each sale. You can calculate your own targets in a few minutes.",
          },
          {
            type: "terms",
            items: [
              { term: "CPA", def: "Cost per acquisition: ad spend divided by the number of results (sales, leads)." },
              { term: "ROAS", def: "Return on ad spend: revenue from ads divided by ad spend. 3x means ₹3 back for every ₹1 spent." },
              { term: "AOV", def: "Average order value: what a customer pays on an average order." },
            ],
          },
        ],
      },
      {
        id: "break-even",
        heading: "Find your break-even",
        blocks: [
          {
            type: "p",
            text: "Take your AOV and subtract every cost of fulfilling the order: product, packaging, shipping, payment gateway fees and any marketplace or COD charges. What is left is your **profit per sale before ads**.",
          },
          {
            type: "p",
            text: "If a ₹1,500 order leaves you ₹700, then paying ₹700 in ads to get it means you make exactly nothing. That is your **break-even CPA**. Break-even ROAS is AOV divided by it: ₹1,500 ÷ ₹700 ≈ **2.14x**. Any week below that loses money, however good it looks.",
          },
        ],
      },
      {
        id: "target",
        heading: "Leave room for profit",
        blocks: [
          {
            type: "steps",
            items: [
              { title: "Profit per sale before ads", text: "AOV minus product, shipping, packaging and fees." },
              { title: "Set break-even", text: "Break-even CPA equals that profit. Break-even ROAS is AOV divided by it." },
              { title: "Choose the profit you want to keep", text: "Subtract it from break-even CPA to get your target CPA. Keeping ₹300 of ₹700 gives a ₹400 target." },
              { title: "Convert to ROAS if you prefer", text: "Target ROAS = AOV ÷ target CPA. Here, ₹1,500 ÷ ₹400 = 3.75x." },
            ],
          },
        ],
      },
      {
        id: "adjust",
        heading: "Adjust for returns, COD and leads",
        blocks: [
          {
            type: "callout",
            tone: "warning",
            title: "Cash on delivery and returns",
            text: "If a share of COD orders is refused at the door, you pay shipping both ways and earn nothing. Work out profit on **delivered** orders. If only 80 of 100 orders are delivered, a ₹400 target per delivered order is roughly ₹320 per order placed, which is what the ad platform reports.",
          },
          {
            type: "p",
            text: "If customers reliably order again, you can afford to pay more for the first sale. Only do this with real repeat-purchase data, not hope.",
          },
          {
            type: "p",
            text: "For leads the idea is the same. If 1 in 10 leads becomes a customer worth ₹8,000 in profit, each lead is worth about ₹800 to you, so a cost per lead comfortably under that is healthy.",
          },
        ],
      },
    ],
  },
  {
    slug: "reading-results-without-overreacting",
    track: "foundations",
    title: "Read your results without over-reacting",
    summary: "Daily noise, incomplete recent data and attribution: why numbers jump and never quite match.",
    minutes: 5,
    sections: [
      {
        id: "noise",
        heading: "Daily numbers are noisy",
        blocks: [
          {
            type: "p",
            text: "An unchanged campaign can show a cost per purchase that swings widely from one day to the next. A single bad day is rarely a signal. Judge on at least **3 to 7 days** of data, and compare like with like: this week against last week, not Monday against Saturday.",
          },
          {
            type: "callout",
            tone: "tip",
            title: "Changes have a cost too",
            text: "Every significant edit can send a campaign back into a learning period, where results are usually more expensive. Make fewer, planned changes and give each one a few days.",
          },
          {
            type: "p",
            text: "Recent data is also incomplete. Conversions are often credited back to the day of the click, so yesterday's numbers tend to improve over the next few days.",
          },
        ],
      },
      {
        id: "attribution",
        heading: "Why the numbers never match",
        blocks: [
          {
            type: "p",
            text: "Meta, Google, Google Analytics and your store each count conversions differently. Each platform uses its own **attribution window** (how long after a click or view a sale still counts) and each tends to claim credit for sales the others also claim.",
          },
          {
            type: "p",
            text: "Add them up and you will usually get more sales than you actually made. A 3x ROAS in a platform dashboard might be break-even in real life.",
          },
          {
            type: "steps",
            items: [
              { title: "Pick one source of truth", text: "Your store, CRM or bank account decides what really happened." },
              { title: "Measure blended results", text: "Total revenue divided by total ad spend across every platform, week by week." },
              { title: "Use platform numbers for comparisons inside the platform", text: "They are good for choosing between two ads, less good for judging total profit." },
              { title: "Keep windows consistent", text: "Don't change attribution settings mid-comparison." },
            ],
          },
        ],
      },
      {
        id: "problems",
        heading: "Three problems worth spotting",
        blocks: [
          {
            type: "list",
            items: [
              "**Wasted spend**: ad sets, keywords or placements that spend steadily with no results.",
              "**Fatigue**: frequency climbing week by week while click-through rate falls.",
              "**Timing**: results clustered in some hours of the day while spend runs around the clock. Look at at least 30 days of hourly data before cutting any hours.",
            ],
          },
          {
            type: "p",
            text: "Adwise surfaces these in its analytics (spend without results, hour-by-day heatmaps), but the same checks work by hand in any ads manager.",
          },
        ],
      },
    ],
  },
  {
    slug: "meta-business-setup",
    track: "meta",
    title: "Set up your Meta business the right way",
    summary: "Business portfolio, Page, Instagram, ad account, payments and access, before you spend anything.",
    minutes: 6,
    sections: [
      {
        id: "portfolio",
        heading: "One Business portfolio that you own",
        blocks: [
          {
            type: "p",
            text: "Meta calls the home for your business assets a **Business portfolio** (it used to be called Business Manager). Think of it as a folder that belongs to your business: your Facebook Page, Instagram account, ad account, Pixel and the people who work on them all sit inside it. If an employee or agency leaves, the folder stays with you.",
          },
          {
            type: "terms",
            items: [
              { term: "Facebook Page", def: "Your business's public profile. Every Meta ad runs from a Page, even if you mostly care about Instagram." },
              { term: "Instagram professional account", def: "A business or creator account. Linking it shows your Instagram name on ads and lets you reply to comments." },
              { term: "Ad account", def: "Where campaigns live and billing happens. It has its own currency, time zone and payment method." },
            ],
          },
          {
            type: "steps",
            items: [
              { title: "Create the Business portfolio", text: "Log in with your personal Facebook profile (Meta requires a real person behind every business) and create a portfolio with your business name and work email." },
              { title: "Add your Facebook Page", text: "If an agency or ex-employee created it, ask them to transfer ownership instead of making a new one." },
              { title: "Connect Instagram", text: "Switch Instagram to a professional account, then connect it to your Page and portfolio." },
              { title: "Create the ad account", text: "Create it inside the portfolio. Choose currency and time zone carefully (see below)." },
            ],
          },
          {
            type: "callout",
            tone: "warning",
            title: "Own your assets",
            text: "A common problem: a freelancer creates the Page and ad account under their own portfolio, then disappears. Make sure **your** portfolio owns the Page, Instagram and ad account, and give agencies partner access instead.",
          },
        ],
      },
      {
        id: "ad-account",
        heading: "Currency, time zone and payments",
        blocks: [
          {
            type: "p",
            text: "Treat **currency** and **time zone** as permanent. Changing them later generally means a new ad account and your reporting history split in two. The time zone also decides how daily budgets reset and how hourly reports line up.",
          },
          {
            type: "p",
            text: "Depending on your country, you can pay by card, UPI or net banking. Some methods charge you after you spend (a **billing threshold**); others are **prepaid funds** you top up first, and ads stop when the balance runs out. If you are GST registered in India, add your GSTIN in payment settings so invoices show it.",
          },
          {
            type: "callout",
            tone: "tip",
            title: "Set an account spending limit",
            text: "An overall spending limit on the ad account is a safety net: no mistake in a campaign budget can spend beyond it.",
          },
        ],
      },
      {
        id: "access",
        heading: "Access and security",
        blocks: [
          {
            type: "p",
            text: "People get access at two levels: to the portfolio itself and to each asset (Page, ad account, Pixel). Give each person the smallest access they need.",
          },
          {
            type: "p",
            text: "Turn on two-factor authentication for every admin. Hacked personal profiles are one of the most common ways businesses lose their ad accounts. Meta may also ask you to verify the business with registration documents later; it isn't always needed to start, but helps with spending limits and some features.",
          },
        ],
      },
    ],
  },
  {
    slug: "meta-pixel-and-conversions-api",
    track: "meta",
    title: "Meta Pixel and Conversions API, explained",
    summary: "If Meta can't see your sales or leads, it can only optimize for clicks. Here's how to fix that.",
    minutes: 5,
    sections: [
      {
        id: "why",
        heading: "Why tracking comes first",
        blocks: [
          {
            type: "p",
            text: "If Meta cannot see what happens after someone clicks your ad, it can only optimize for clicks. To optimize for sales or leads, it needs to know when those happen. That is what the Pixel and the Conversions API do.",
          },
          {
            type: "terms",
            items: [
              { term: "Meta Pixel", def: "A small piece of code on your website that runs in the visitor's browser and reports actions (events) back to Meta." },
              { term: "Conversions API (CAPI)", def: "A way for your server or store platform to send the same events to Meta directly, without relying on the browser." },
              { term: "Event", def: "An action such as `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase` or `Lead`." },
              { term: "Deduplication", def: "When Pixel and CAPI both send an event, a shared event ID lets Meta count it once, not twice." },
            ],
          },
          {
            type: "p",
            text: "Why both? Ad blockers, browser privacy settings and iPhone tracking limits stop some Pixel events from arriving. CAPI fills those gaps from your server, so Meta sees more of your real sales, which improves both reporting and optimization.",
          },
        ],
      },
      {
        id: "setup",
        heading: "Setting it up",
        blocks: [
          {
            type: "steps",
            items: [
              { title: "Create a dataset", text: "In Events Manager, create a Pixel (Meta groups Pixel and CAPI data as a dataset) inside your Business portfolio." },
              { title: "Use your platform's integration", text: "Shopify, WooCommerce, Wix and many store builders have a Meta integration that installs the Pixel and CAPI for you. This is the easiest route." },
              { title: "Or add it by hand", text: "Paste the Pixel base code on every page and fire `Purchase` or `Lead` on the thank-you page. Ask a developer to set up CAPI from your server, with matching event IDs." },
              { title: "Test it", text: "Use the test events tool in Events Manager, place a test order or enquiry, and check the event arrives with the right value." },
            ],
          },
          {
            type: "callout",
            tone: "tip",
            title: "Always send value and currency",
            text: "Send the purchase value and currency with every purchase (for example `value: 1499, currency: INR`). Without it Meta can't show ROAS or optimize for high-value orders.",
          },
          {
            type: "p",
            text: "Finally, verify your domain in business settings (usually a DNS TXT record or a meta tag). It proves you own the site, protects your links from misuse and lets you control which events matter most for your domain.",
          },
        ],
      },
    ],
  },
  {
    slug: "first-meta-campaign",
    track: "meta",
    title: "Launch your first Meta campaign (and avoid the Traffic trap)",
    summary: "Objectives, budgets, audiences, placements and creative for a first campaign that can actually learn.",
    minutes: 7,
    sections: [
      {
        id: "structure",
        heading: "Campaigns, ad sets and ads",
        blocks: [
          {
            type: "p",
            text: "Meta ads have three levels. The **campaign** holds the objective (and optionally a shared budget). The **ad set** holds budget, schedule, audience, placements and the conversion event. The **ad** holds the creative, text and link. Knowing which setting lives where saves a lot of confusion in Ads Manager.",
          },
        ],
      },
      {
        id: "objective",
        heading: "Pick the objective you want to pay for",
        blocks: [
          {
            type: "p",
            text: "The objective is not a label; it changes who Meta shows your ad to. A Traffic campaign finds people who click a lot. A Sales campaign finds people likely to buy.",
          },
          {
            type: "callout",
            tone: "warning",
            title: "The Traffic trap",
            text: "Beginners often pick Traffic because clicks look cheap. But Meta then finds people who click, not people who buy. If you want sales or leads, choose **Sales** or **Leads** even if the cost per click is higher.",
          },
          {
            type: "p",
            text: "For most small businesses: an online store picks **Sales**, a service business picks **Leads**, and a business that closes deals in chat often picks **Engagement** with a messaging goal, or **Leads**.",
          },
        ],
      },
      {
        id: "budget-audience",
        heading: "Budget, audience and placements",
        blocks: [
          {
            type: "terms",
            items: [
              { term: "Daily budget", def: "The average you spend per day. Meta may spend a bit more on good days and less on others; it evens out over the week." },
              { term: "Lifetime budget", def: "A total for a fixed period. Needed if you want Meta's built-in ad scheduling by hour." },
              { term: "Advantage campaign budget", def: "One campaign-level budget that Meta shares across ad sets, moving money to whatever performs best." },
            ],
          },
          {
            type: "p",
            text: "Aim for a daily budget that can buy several results a week. If a sale costs about ₹400 to win, ₹500 a day buys roughly 8 or 9 sales a week: enough to learn from, if slowly.",
          },
          {
            type: "p",
            text: "Start the audience with the basics: location, age and language if it matters. **Don't over-narrow.** A tiny audience with five stacked interests leaves Meta little room to find buyers; for most businesses, location plus Advantage+ audience beats a clever hand-built mix.",
          },
          {
            type: "p",
            text: "With Advantage+ placements your ad can appear in Feed, Stories, Reels and more. Upload both a square or 4:5 version (Feed) and a 9:16 version (Stories and Reels) so it looks right everywhere.",
          },
        ],
      },
      {
        id: "creative",
        heading: "Creative, tracking links and review",
        blocks: [
          {
            type: "p",
            text: "On Meta, creative matters more than almost any setting, because it decides who stops scrolling. Add **UTM tags** in the ad's URL parameters field so your analytics tool knows which ad sent each visit; Meta can fill campaign and ad names in dynamically.",
          },
          {
            type: "p",
            text: "Every new or edited ad goes through review, usually within hours, sometimes up to a day. If it's rejected, fix the cause shown in Ads Manager or Account Quality. Repeatedly re-uploading the same rejected ad can restrict your account.",
          },
          {
            type: "callout",
            tone: "tip",
            title: "Leave it alone in week one",
            text: "Avoid editing the ad set every day in the first week. Significant edits can restart Meta's learning phase.",
          },
        ],
      },
    ],
  },
  {
    slug: "meta-lead-form-ads",
    track: "meta",
    title: "Lead form ads that bring real enquiries",
    summary: "Instant forms collect leads without a website. Here's how to trade volume for quality on purpose.",
    minutes: 4,
    sections: [
      {
        id: "what",
        heading: "What an instant form is",
        blocks: [
          {
            type: "p",
            text: "An **instant form** (lead form) opens inside Facebook or Instagram when someone taps your ad. Name, phone and email are pre-filled from their profile, so filling it takes seconds, and you don't need a website.",
          },
          {
            type: "p",
            text: "They suit service businesses: coaching institutes, clinics, real estate, insurance, interior designers and B2B software.",
          },
        ],
      },
      {
        id: "volume-vs-intent",
        heading: "More volume or higher intent",
        blocks: [
          {
            type: "p",
            text: "Meta lets you choose a form type built for **more volume** (fastest to submit) or **higher intent** (adds a review step before submitting). Custom questions, such as budget, timeline or location, slow people down but filter out casual taps.",
          },
          {
            type: "callout",
            tone: "tip",
            title: "Judge by cost per qualified lead",
            text: "More volume gives cheaper leads but more junk numbers. Higher intent may cost double per lead, yet more of those people pick up the phone. Compare cost per **qualified** lead, not cost per lead.",
          },
        ],
      },
      {
        id: "follow-up",
        heading: "Speed of follow-up decides the result",
        blocks: [
          {
            type: "list",
            items: [
              "Get leads out of Meta quickly: download them from the Page's lead centre, or connect a CRM or tool that pulls them automatically.",
              "Call or message while the person still remembers your ad, ideally the same day.",
              "Track each lead's stage (contacted, qualified, won) so you know which campaigns bring customers, not just form fills.",
            ],
          },
          {
            type: "p",
            text: "Adwise can pull lead form submissions into a simple pipeline with stages and deal values, so cost per lead sits next to what those leads were actually worth.",
          },
        ],
      },
    ],
  },
  {
    slug: "meta-learning-fatigue-scaling",
    track: "meta",
    title: "Meta's learning phase, creative fatigue and scaling",
    summary: "Why new ad sets are expensive, when ads wear out, and how to spend more without breaking what works.",
    minutes: 7,
    sections: [
      {
        id: "learning",
        heading: "The learning phase",
        blocks: [
          {
            type: "p",
            text: "When an ad set starts, Meta doesn't yet know who will respond, so it experiments with people, placements and times. During this **learning phase** results are usually more expensive and jumpy. Meta generally needs around 50 optimization events within a week to exit it.",
          },
          {
            type: "callout",
            tone: "tip",
            title: "Fixing Learning limited",
            text: "Do the maths: 50 events a week at ₹400 each needs about ₹20,000 a week. If that's too much, combine ad sets, widen the audience, or optimize for an earlier, more frequent event (like AddToCart) until volume grows. Learning limited isn't failure: if costs are fine, leave it.",
          },
        ],
      },
      {
        id: "auction-testing",
        heading: "The auction and creative testing",
        blocks: [
          {
            type: "p",
            text: "Every scroll triggers an **auction**. The highest bid doesn't automatically win: Meta combines your bid, how likely this person is to take your action, and ad quality. Ads people like win more auctions at lower cost, which is why creative matters so much.",
          },
          {
            type: "p",
            text: "The simplest test: put 3 to 5 genuinely different creatives in one ad set (a customer video, a product photo with price, a carousel) and let Meta spend on the winners. Treat CTR as a clue, not a verdict; sometimes a lower-CTR ad brings better buyers.",
          },
        ],
      },
      {
        id: "fatigue",
        heading: "Creative fatigue",
        blocks: [
          {
            type: "p",
            text: "Even great ads wear out. When the same people see an ad too often, **frequency** climbs, CTR falls and cost per result rises.",
          },
          {
            type: "p",
            text: "Add 2 or 3 new creatives every couple of weeks instead of waiting for results to crash, and batch your additions, since adding ads can restart learning.",
          },
        ],
      },
      {
        id: "scaling",
        heading: "Scaling, overlap and pausing",
        blocks: [
          {
            type: "list",
            items: [
              "**Raise budgets in steady steps** (for example around 20% every few days) rather than one big jump, which can knock an ad set back into learning.",
              "**Duplicate** a winning ad set to test a new audience or a much larger budget without disturbing the original.",
              "**Avoid overlap**: ad sets that target the same people compete in the same auctions and split learning. Fewer, broader ad sets usually win.",
              "**Pause weak ads, not whole ad sets**, and judge on 3 to 7 days of data, never one bad day.",
            ],
          },
          {
            type: "p",
            text: "Once your Pixel records a steady flow of purchases and you have several solid creatives, try an **Advantage+ sales campaign** next to your best manual campaign with a similar budget, and compare cost per purchase. If you can, tell Meta who your existing customers are so you can see how much spend goes to people who would have bought anyway.",
          },
          {
            type: "p",
            text: "Rules like \"pause an ad after it spends X with no results\" are exactly what Adwise automation is for, and it starts every rule in dry run so you can see what it would have done first.",
          },
        ],
      },
    ],
  },
  {
    slug: "google-ads-setup-and-conversion-tracking",
    track: "google",
    title: "Google Ads setup and conversion tracking",
    summary: "Create the account in Expert mode, pick settings you can't change later, and track conversions before launch.",
    minutes: 7,
    sections: [
      {
        id: "account",
        heading: "Create the account (in Expert mode)",
        blocks: [
          {
            type: "p",
            text: "Sign-up may steer you into a simplified flow (Smart campaigns). It's easy, but you can't see which searches triggered your ads or use most bidding strategies. Look for **Switch to Expert mode**, and if possible create the account **without a campaign**, then build the first campaign once tracking is in place.",
          },
          {
            type: "callout",
            tone: "warning",
            title: "Double-check before you submit",
            text: "Billing country, **time zone** and **currency** are locked once the account exists. The time zone controls when daily budgets reset and how reports line up by hour; a wrong one makes daily and hourly reports misleading forever.",
          },
          {
            type: "p",
            text: "Payment options vary by country. In India, accounts usually run on manual payments (prepay): you add money first and ads stop when the balance runs out.",
          },
          {
            type: "p",
            text: "Working with an agency? Create the account yourself and **invite** their manager account (MCC). You keep ownership and history if you change agencies.",
          },
        ],
      },
      {
        id: "tracking",
        heading: "Track conversions with the Google tag",
        blocks: [
          {
            type: "p",
            text: "A **conversion** is an action you care about: a purchase, a form submission, a call, a chat click. Without tracking, Google only knows you got clicks, and smart bidding has nothing to learn from.",
          },
          {
            type: "p",
            text: "The **Google tag** is a snippet that goes on every page. **Google Tag Manager** holds all your tags in one container you install once. Many store platforms have an official integration that does this for you.",
          },
          {
            type: "terms",
            items: [
              { term: "Primary conversion", def: "Counted in the Conversions column and used for bidding. Keep only real business goals here." },
              { term: "Secondary conversion", def: "Reported for observation only. Page views and button clicks belong here, or Google will optimize for cheap, useless actions." },
              { term: "Enhanced conversions", def: "Sends a hashed (one-way encoded) email or phone from the conversion so Google can match more conversions despite cookie limits." },
            ],
          },
        ],
      },
      {
        id: "offline",
        heading: "Offline conversions and linking",
        blocks: [
          {
            type: "p",
            text: "If your sales team closes deals days after the form fill, Google only sees the form. **Offline conversion import** tells it which leads actually paid, so it looks for more people like those, not the ones who never picked up.",
          },
          {
            type: "p",
            text: "Each ad click adds a **gclid** to the landing page URL. Save it with the lead in your CRM, then upload which gclids became customers. If that's hard, enhanced conversions for leads matches on hashed email or phone instead.",
          },
          {
            type: "p",
            text: "Also link Google Analytics and (if you sell products) Merchant Center under Linked accounts or Data manager. You need admin access on both sides.",
          },
        ],
      },
    ],
  },
  {
    slug: "google-search-campaign",
    track: "google",
    title: "Build your first Google Search campaign",
    summary: "Campaign types, ad groups, keyword match types, negatives, responsive search ads and bidding.",
    minutes: 8,
    sections: [
      {
        id: "type",
        heading: "Start with Search",
        blocks: [
          {
            type: "p",
            text: "The **campaign type** decides where your ad shows. Search catches people at the moment of need, like `ac repair near me`, and is the easiest type to understand, measure and control. Add Performance Max or Shopping once conversions are flowing.",
          },
          {
            type: "p",
            text: "Group keywords by theme into **ad groups**, so the ad matches the search. A dental clinic might have one campaign with ad groups for root canal, teeth whitening and braces. A small budget needs one or two campaigns, not dozens; splitting it thin starves every part of data.",
          },
        ],
      },
      {
        id: "keywords",
        heading: "Keywords, match types and negatives",
        blocks: [
          {
            type: "p",
            text: "Keywords tell Google the **meaning** you want to show for. The actual queries people type are **search terms**. All match types now include close variants (plurals, misspellings, same meaning).",
          },
          {
            type: "terms",
            items: [
              { term: "Exact match [keyword]", def: "Searches with the same meaning as the keyword. Most control, least reach." },
              { term: "Phrase match \"keyword\"", def: "Searches that include the meaning of the keyword, possibly with more words around it." },
              { term: "Broad match", def: "Related searches, using signals like your landing page. Most reach; pairs best with smart bidding and plenty of conversions." },
            ],
          },
          {
            type: "callout",
            tone: "tip",
            title: "A sensible start",
            text: "Begin with phrase and exact match while you have little conversion data. Test broad match once you have a steady flow of conversions and use Maximize conversions or Target CPA.",
          },
          {
            type: "p",
            text: "A **negative keyword** stops your ad showing for searches that contain it. An interior designer doesn't want `interior design course`, `jobs` or `free app`. Negatives are your main defence against wasted spend.",
          },
        ],
      },
      {
        id: "ads",
        heading: "Ads and assets",
        blocks: [
          {
            type: "p",
            text: "The standard ad is the **responsive search ad**: up to 15 headlines (30 characters) and 4 descriptions (90 characters), which Google combines per search. **Pin** a headline only when you must (legal text, brand name); every pin reduces the combinations Google can test.",
          },
          {
            type: "p",
            text: "Add assets: at least 4 sitelinks, 4 callouts, and a call asset if phone calls matter. They take more space on the page and usually lift click-through rate.",
          },
        ],
      },
      {
        id: "bidding",
        heading: "Bidding, budget and location",
        blocks: [
          {
            type: "p",
            text: "A common path: start on **Maximize conversions**, then add a **Target CPA** once you have a month of steady conversions. Set it close to what you already pay, not a dream number.",
          },
          {
            type: "p",
            text: "The daily budget is an average: Google may spend up to twice it on a busy day, but won't charge more than about 30.4 times the daily budget over a month.",
          },
          {
            type: "p",
            text: "Target where your customers are (a city, radius or postcodes), and in location options choose people **in or regularly in** those places, not merely interested in them.",
          },
          {
            type: "callout",
            tone: "warning",
            title: "Don't tinker daily",
            text: "Each big change to bids, budgets or keywords makes Google relearn. Make small, planned changes and give them a few days.",
          },
        ],
      },
    ],
  },
  {
    slug: "google-ads-optimization",
    track: "google",
    title: "Optimize Google Ads: Quality Score, search terms and scaling",
    summary: "How Ad Rank works, the report that cuts the most waste, impression share, Performance Max and safe scaling.",
    minutes: 7,
    sections: [
      {
        id: "quality",
        heading: "Ad Rank and Quality Score",
        blocks: [
          {
            type: "p",
            text: "Google doesn't sell the top spot to the highest bidder. **Ad Rank** combines your bid, ad and landing page quality, expected impact of assets and the search context. A more relevant advertiser can beat a bigger bidder and pay less.",
          },
          {
            type: "p",
            text: "**Quality Score** (1 to 10 per keyword) is a diagnostic, built from expected CTR, ad relevance and landing page experience. Don't chase 10 everywhere; focus on high-spend keywords scoring 5 or below. Most clicks come from phones, so a fast mobile page matters.",
          },
        ],
      },
      {
        id: "search-terms",
        heading: "The search terms report",
        blocks: [
          {
            type: "p",
            text: "Your keywords are what you chose; **search terms** are what people typed. The search terms report shows each with clicks, cost and conversions, and it is the single most useful report for cutting waste. Review it weekly and add irrelevant terms as negatives.",
          },
          {
            type: "callout",
            tone: "warning",
            title: "Broken tracking breaks bidding",
            text: "If your conversion tag stops firing, smart bidding thinks your ads stopped working and cuts bids. Check conversion counts weekly. After a bidding strategy change, expect a learning period of 1 to 2 weeks, longer with few conversions.",
          },
        ],
      },
      {
        id: "impression-share",
        heading: "Impression share and Performance Max",
        blocks: [
          {
            type: "p",
            text: "**Search impression share** is how often your ad showed out of all the times it was eligible. Two more columns tell you why you missed the rest: **lost to budget** or **lost to rank**. Budget losses on a profitable campaign are a signal to scale; rank losses call for better ads, pages or bids.",
          },
          {
            type: "p",
            text: "**Performance Max** runs across Search, Shopping, YouTube, Display, Discover, Gmail and Maps from one campaign. It's only as good as your conversion tracking: count low-value actions and it will find lots of them cheaply. Many advertisers keep Search for their key terms alongside it.",
          },
        ],
      },
      {
        id: "scale",
        heading: "Scale safely",
        blocks: [
          {
            type: "p",
            text: "When a campaign hits your target cost per conversion and is losing impression share to budget, raise the budget in steps of about **15 to 20% every few days**. For example ₹1,000 → ₹1,200 → ₹1,450 → ₹1,750 over two weeks, checking the cost per lead holds.",
          },
          {
            type: "p",
            text: "Review **auto-applied recommendations** in settings and turn off anything you want to decide yourself, such as adding keywords or raising budgets.",
          },
        ],
      },
    ],
  },
  {
    slug: "dayparting",
    track: "foundations",
    title: "Dayparting: run ads in the hours that convert",
    summary: "Use your own hourly data to decide when ads should run, without cutting hours too early.",
    minutes: 4,
    sections: [
      {
        id: "what",
        heading: "What dayparting is",
        blocks: [
          {
            type: "p",
            text: "Dayparting means running (or bidding up) ads during the hours and days that produce results, and pausing or bidding down during the ones that don't. A store whose purchases cluster in the evening may be paying for clicks at 3 a.m. that rarely convert.",
          },
        ],
      },
      {
        id: "data",
        heading: "Use your own data",
        blocks: [
          {
            type: "steps",
            items: [
              { title: "Look at 30+ days by hour and day", text: "A heatmap of conversions and cost per result by hour of the week shows patterns a single day never will." },
              { title: "Check your time zone", text: "Hours are reported in the ad account's time zone. If it's wrong, the heatmap is shifted." },
              { title: "Cut only clear losers", text: "Pause hours with steady spend and consistently no results, not hours that just had one slow week." },
              { title: "Re-check monthly", text: "Seasons, sales and new creatives shift when people buy." },
            ],
          },
          {
            type: "callout",
            tone: "warning",
            title: "Don't cut hours too early",
            text: "People often click in one hour and buy in another. Cutting the browsing hours can quietly reduce sales that are credited to later hours.",
          },
        ],
      },
      {
        id: "how",
        heading: "How to apply a schedule",
        blocks: [
          {
            type: "p",
            text: "Google Ads has a built-in **ad schedule** with bid adjustments per hour. Meta's built-in scheduling only works with lifetime budgets. Adwise lets you draw a weekly grid for either platform, then pauses and resumes campaigns on schedule, with a dry-run mode to preview what it would change before it changes anything.",
          },
        ],
      },
    ],
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function guidesByTrack(track: GuideTrack): Guide[] {
  return GUIDES.filter((g) => g.track === track);
}

/** Guides in reading order (track order, then list order), for prev/next links. */
export const ORDERED_GUIDES: Guide[] = TRACKS.flatMap((t) => guidesByTrack(t.id));

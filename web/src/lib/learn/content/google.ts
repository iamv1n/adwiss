import type { Module } from "../types";

export const GOOGLE_MODULES: Module[] = [
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "google-setup",
    track: "google",
    title: "Get set up on Google Ads",
    summary:
      "Create your Google Ads account the right way, set up billing, and make sure every sale and lead is tracked before you spend a rupee.",
    lessons: [
      {
        id: "create-your-account",
        title: "Create your Google Ads account",
        minutes: 5,
        summary:
          "Open a Google Ads account in Expert mode, pick the right currency and time zone, and set up billing without surprises.",
        blocks: [
          {
            type: "p",
            text: "Google Ads is where you buy ads on Google Search, YouTube, Gmail, Maps and millions of partner websites. You only need a Google account (a Gmail address or your work Google Workspace email) to start. The setup takes about 15 minutes, but a few choices you make here **cannot be changed later**, so go slowly.",
          },
          { type: "h", text: "Skip Smart mode, use Expert mode" },
          {
            type: "p",
            text: "When you sign up, Google may guide you into a simplified flow often called **Smart mode** (Smart campaigns). It asks for your business, a budget and a few keywords, then runs everything for you. It is easy, but you cannot see which searches triggered your ads, cannot use most bidding strategies, and cannot fine-tune much.",
          },
          {
            type: "p",
            text: "Look for a link like **Switch to Expert mode** (the wording changes from time to time) during sign-up. Expert mode gives you the full Google Ads interface. You can also create an account without a campaign first and build the campaign yourself afterwards, which is what we recommend.",
          },
          {
            type: "callout",
            tone: "tip",
            title: "Create the account without a campaign",
            text: "If the sign-up flow pushes you to launch a campaign immediately, look for an option to skip or create the account only. It is much easier to build a clean first campaign once conversion tracking is in place.",
          },
          { type: "h", text: "Currency and time zone are permanent" },
          {
            type: "p",
            text: "You will choose a **billing country**, a **time zone** and a **currency**. For most Indian businesses that means India, `(GMT+05:30) India Standard Time` and Indian Rupee (INR). Once the account is created, the currency and time zone are locked. If you pick US dollars by mistake, the only fix is to create a new account and start again, losing all history.",
          },
          {
            type: "callout",
            tone: "warn",
            title: "Double-check before you click Submit",
            text: "The time zone controls when your daily budget resets and how your reports line up by day and hour. A wrong time zone makes dayparting and daily reports misleading forever.",
          },
          { type: "h", text: "Billing in India" },
          {
            type: "p",
            text: "In India, Google Ads accounts usually run on **manual payments (prepay)**: you add money first, for example ₹5,000, and ads stop when the balance runs out. Some accounts can use automatic payments with a card. You can pay by UPI, cards or net banking, depending on what Google offers your account.",
          },
          {
            type: "list",
            items: [
              "Enter your business name and address exactly as on your GST registration.",
              "Add your **GSTIN** if you have one, so the tax invoice is issued to your business and you can claim input tax credit.",
              "Google charges GST on top of your ad spend, so a ₹10,000 top-up does not mean ₹10,000 of ads. Check the breakdown on the payment screen.",
              "Keep a small buffer in the balance so a busy day does not pause your ads.",
            ],
          },
          { type: "h", text: "Manager accounts for agencies" },
          {
            type: "p",
            text: "A **manager account** (often called an **MCC**, short for My Client Center) is a special Google Ads account that holds no ads itself. It lets an agency or freelancer see and manage many client accounts from one login, with one set of users and permissions.",
          },
          {
            type: "terms",
            terms: [
              { term: "Expert mode", def: "The full Google Ads interface, with every campaign type, bidding option and report." },
              { term: "Manager account (MCC)", def: "An umbrella account used by agencies to manage many client Google Ads accounts from one login." },
              { term: "Prepay", def: "Paying for ads in advance. Ads run until the balance is spent." },
              { term: "GSTIN", def: "Your GST identification number, added in billing so invoices are issued to your business." },
            ],
          },
          {
            type: "callout",
            tone: "info",
            text: "If you are a business owner working with an agency, create the Google Ads account yourself and **invite** the agency's manager account. That way you always own the account and its history, even if you change agencies.",
          },
          {
            type: "quiz",
            question: "You created your account in US dollars by mistake. What can you do?",
            options: [
              "Change the currency in Billing settings",
              "Ask Google support to convert it",
              "Create a new Google Ads account with INR",
              "Nothing, you must use USD forever",
            ],
            answer: 2,
            explain: "Currency and time zone are fixed once an account is created. The fix is to open a new account with the right currency, ideally before you have built much history.",
          },
        ],
      },
      {
        id: "conversion-tracking",
        title: "Track conversions with the Google tag",
        minutes: 7,
        summary:
          "Install the Google tag or Google Tag Manager so Google Ads knows which clicks turned into sales, leads and calls.",
        blocks: [
          {
            type: "p",
            text: "A **conversion** is an action you care about: a purchase, a lead form submitted, a phone call, a WhatsApp click. Without conversion tracking, Google Ads only knows you got clicks. With it, Google knows which keywords and ads bring customers, and its automated bidding can learn to find more of them.",
          },
          {
            type: "callout",
            tone: "warn",
            title: "Set up tracking before you launch",
            text: "Running ads without conversion tracking is like running a shop without a till. You will spend money and have no idea what worked. Smart bidding also cannot work without conversion data.",
          },
          { type: "h", text: "Three ways to track" },
          {
            type: "table",
            columns: ["Method", "Best for", "Effort"],
            rows: [
              ["Google tag (gtag.js) pasted on the site", "Simple websites, Shopify or WordPress with a plugin", "Low"],
              ["Google Tag Manager (GTM)", "Sites with many tags, or teams who want changes without a developer", "Medium"],
              ["Import from Google Analytics 4 (GA4)", "Businesses already tracking key events well in GA4", "Low, if GA4 is set up"],
            ],
          },
          {
            type: "p",
            text: "The **Google tag** is one small snippet of code that goes on every page of your site. **Google Tag Manager** is a free tool that holds all your tags (Google, Meta, others) in one container, so you add the container once and manage everything from a dashboard. Many ecommerce platforms, like Shopify, have an official Google app that installs the tag for you.",
          },
          { type: "h", text: "Create a conversion action" },
          {
            type: "steps",
            steps: [
              { title: "Open Conversions", text: "In Google Ads, go to **Goals**, then **Conversions**, and choose to create a new conversion action." },
              { title: "Pick the source", text: "Choose **Website** for purchases and forms, **Phone calls** for calls from ads or your site, or import from GA4." },
              { title: "Describe the action", text: "Pick a category such as Purchase or Submit lead form, give it a clear name like `Lead - contact form`, and set a value. For ecommerce, use the actual order value." },
              { title: "Choose counting", text: "Use **Every** for purchases (each order counts) and **One** for leads (one person filling a form twice is still one lead)." },
              { title: "Install the tag", text: "Follow the on-screen instructions to add the Google tag or set it up in Tag Manager. The event fires on the thank-you page or on form success." },
              { title: "Test it", text: "Submit a test lead or order, then check the conversion status in Google Ads over the next day. Tag Assistant helps you see whether the tag fires." },
            ],
          },
          { type: "h", text: "Primary vs secondary conversions" },
          {
            type: "p",
            text: "Each conversion action can be **primary** (counted in the Conversions column and used for bidding) or **secondary** (reported only, for observation). Keep only your real business goals as primary. If you mark page views or button clicks as primary, Google will happily optimize for cheap, useless clicks.",
          },
          { type: "h", text: "Enhanced conversions" },
          {
            type: "p",
            text: "Browsers and privacy rules block some cookies, so some conversions go missing. **Enhanced conversions** fix part of this: when someone converts, the tag sends a hashed (scrambled, one-way encoded) version of their email or phone number, which Google matches to signed-in Google users. You turn it on in the conversion settings and accept Google's customer data terms. It usually recovers a noticeable share of lost conversions.",
          },
          {
            type: "diagram",
            id: "attribution",
            caption: "A click today can convert days later. Conversion tracking connects that later action back to the ad click.",
          },
          {
            type: "terms",
            terms: [
              { term: "Conversion", def: "A valuable action after an ad click, such as a sale, lead or call." },
              { term: "Google tag", def: "A snippet of code on your website that sends visits and conversions to Google Ads and GA4." },
              { term: "Google Tag Manager", def: "A free tool that manages all your website tags from one container." },
              { term: "Enhanced conversions", def: "Sends hashed customer details with conversions so Google can match more of them to ad clicks." },
              { term: "Cost per conversion (CPA)", def: "How much you spend, on average, for one conversion.", formula: "CPA = cost ÷ conversions" },
            ],
          },
          {
            type: "quiz",
            question: "You track lead forms and also page views as primary conversions. What is the likely problem?",
            options: [
              "Google will stop showing your ads",
              "Smart bidding will chase cheap page views instead of real leads",
              "Your cost per click will double",
              "Nothing, more conversions is always better",
            ],
            answer: 1,
            explain: "Primary conversions are what bidding optimizes toward. Page views are easy to get, so Google will find people who view pages rather than people who become leads. Keep page views as secondary.",
          },
        ],
      },
      {
        id: "offline-and-linking",
        title: "Offline conversions and linking accounts",
        minutes: 6,
        summary:
          "Send closed deals back to Google with the gclid, and link GA4, YouTube and Merchant Center so your data flows in one place.",
        blocks: [
          {
            type: "p",
            text: "Many Indian businesses do not sell on the website. A real estate developer, a coaching institute or a B2B supplier gets a lead online, then the sales team calls and closes the deal a week or a month later. Google only sees the form fill. It has no idea which leads actually paid.",
          },
          {
            type: "p",
            text: "If 100 leads cost ₹40,000 and only 6 turn into customers, you want Google to find more people like those 6, not more people like the 94 who never picked up the phone. **Offline conversion import** makes that possible.",
          },
          { type: "h", text: "How the gclid works" },
          {
            type: "p",
            text: "When someone clicks your ad, Google adds a **gclid** (Google Click Identifier) to the landing page URL, something like `?gclid=Cj0KCQ...`. It is a unique ID for that single click. If you save it with the lead in your CRM (customer relationship management system, where your team tracks leads), you can later tell Google: the click with this gclid became a customer worth ₹25,000.",
          },
          {
            type: "diagram",
            id: "lead-pipeline",
            caption: "Most leads drop off before becoming customers. Importing the later stages teaches Google which clicks really matter.",
          },
          {
            type: "steps",
            steps: [
              { title: "Turn on auto-tagging", text: "In account settings, make sure **auto-tagging** is on. This is what adds the gclid to your URLs. It is on by default in most accounts." },
              { title: "Capture the gclid", text: "Add a hidden field to your lead form that reads the gclid from the URL and saves it with the lead. Many form tools and CRMs support this directly." },
              { title: "Create an import conversion action", text: "In Conversions, create a new action with the source set to import from clicks, for example `Qualified lead` and `Won deal`." },
              { title: "Upload results", text: "Upload a file (or connect your CRM or use a scheduled upload) with the gclid, conversion name, time and value for each lead that progressed." },
              { title: "Upload regularly", text: "Upload at least weekly. Clicks older than 90 days cannot be imported, so do not wait too long." },
            ],
          },
          {
            type: "callout",
            tone: "tip",
            title: "Enhanced conversions for leads",
            text: "If capturing the gclid is hard, Google also supports matching offline results using hashed email or phone numbers captured on your form. It is a good option when your CRM stores contact details but not click IDs.",
          },
          { type: "h", text: "Link your other Google accounts" },
          {
            type: "table",
            columns: ["Link", "Why it helps"],
            rows: [
              ["Google Analytics 4", "Import GA4 key events as conversions, build audiences, and see what ad visitors did on the site."],
              ["YouTube channel", "Run video ads from your own videos, and build audiences of people who watched or subscribed."],
              ["Merchant Center", "Required for Shopping and for product ads in Performance Max. It holds your product feed: titles, prices, images, stock."],
              ["Google Business Profile", "Show your address and ratings with ads, and track store visits or direction requests where available."],
            ],
          },
          {
            type: "p",
            text: "Links live under the tools menu in a section usually called **Linked accounts** or **Data manager**. You need admin access on both sides. Link once, and the data keeps flowing.",
          },
          {
            type: "terms",
            terms: [
              { term: "gclid", def: "Google Click Identifier. A unique code added to your URL for every ad click." },
              { term: "Auto-tagging", def: "A setting that automatically adds the gclid to your landing page URLs." },
              { term: "Offline conversion import", def: "Uploading results that happened outside your website, like a closed sale, and tying them to the original click." },
              { term: "Merchant Center", def: "Google's tool for uploading your product catalogue, used by Shopping and Performance Max." },
            ],
          },
          {
            type: "quiz",
            question: "A coaching institute closes admissions by phone two weeks after a lead. How can Google learn which clicks led to admissions?",
            options: [
              "Increase the budget so Google gets more data",
              "Mark page views as conversions",
              "Save the gclid with each lead and upload admissions as offline conversions",
              "Switch to Maximize clicks",
            ],
            answer: 2,
            explain: "The gclid ties a later admission back to the exact ad click. Uploading it lets Google bid for people who actually enrol, not just people who fill forms.",
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "google-first-campaign",
    track: "google",
    title: "Launch your first Google campaign",
    summary:
      "Choose the right campaign type, structure it cleanly, pick keywords and bidding, and launch a small Search test step by step.",
    lessons: [
      {
        id: "campaign-types",
        title: "Campaign types and account structure",
        minutes: 6,
        summary:
          "Learn the seven Google campaign types, when to use each, and how an account is organised into campaigns, ad groups, keywords and ads.",
        blocks: [
          {
            type: "p",
            text: "Google Ads can show your ad in many places, and the **campaign type** decides where. Picking the wrong type is the most common beginner mistake: for example, choosing Display when your customers are actively searching for you.",
          },
          {
            type: "table",
            columns: ["Campaign type", "Where ads show", "Use it when"],
            rows: [
              ["Search", "Google search results as text ads", "People already search for what you sell. The best first campaign for most businesses."],
              ["Performance Max", "All Google channels from one campaign", "You have solid conversion tracking and want Google to find customers everywhere."],
              ["Shopping", "Product listings with image and price", "You sell physical products online and have a Merchant Center feed."],
              ["Display", "Banner and image ads on websites and apps", "You want cheap reach or remarketing to past visitors."],
              ["Demand Gen", "YouTube, Discover and Gmail feeds", "You want to create interest with visual ads, like on social media."],
              ["Video", "YouTube", "You have video and want reach, views or awareness."],
              ["App", "Search, Play, YouTube and more", "You want app installs or in-app actions."],
            ],
          },
          {
            type: "callout",
            tone: "tip",
            title: "Start with Search",
            text: "Search catches people at the moment of need, like someone typing `ac repair near me` or `ca for gst filing`. It is the easiest type to understand, measure and control. Add Performance Max or Shopping once you have conversions flowing.",
          },
          {
            type: "diagram",
            id: "funnel",
            caption: "Search and Shopping work best at the bottom of the funnel. Video, Demand Gen and Display build awareness higher up.",
          },
          { type: "h", text: "How an account is organised" },
          {
            type: "diagram",
            id: "google-structure",
            caption: "Account → campaigns → ad groups → keywords and ads.",
          },
          {
            type: "list",
            items: [
              "**Account**: your billing, time zone, users and conversion tracking.",
              "**Campaign**: the budget, bidding strategy, locations, languages and campaign type. One campaign per goal or product line is a good rule.",
              "**Ad group**: a tight theme inside a campaign. It holds a set of related keywords and the ads that match them.",
              "**Keywords and ads**: keywords decide which searches can trigger your ad; ads are what people read.",
            ],
          },
          {
            type: "p",
            text: "For example, a Pune dental clinic could have one Search campaign called `Dental - Pune` with a ₹800 daily budget, and ad groups for `Root canal`, `Teeth whitening` and `Braces`. Someone searching `root canal cost pune` sees an ad about root canals, not a generic clinic ad. That tight match improves clicks and lowers cost.",
          },
          {
            type: "callout",
            tone: "info",
            text: "Keep it simple. A small business with ₹20,000 to ₹50,000 a month usually needs one or two campaigns and a few ad groups, not dozens. Splitting a small budget too thin starves every part of data.",
          },
          {
            type: "terms",
            terms: [
              { term: "Campaign", def: "Holds the budget, bidding, targeting and campaign type." },
              { term: "Ad group", def: "A themed group of keywords and ads inside a campaign." },
              { term: "Keyword", def: "A word or phrase you choose so your ad can show for related searches." },
              { term: "Search term", def: "The actual words someone typed into Google before seeing your ad." },
            ],
          },
          {
            type: "quiz",
            question: "A plumber in Chennai wants calls from people who need a plumber today. Which campaign type should they start with?",
            options: ["Display", "Video", "Search", "Demand Gen"],
            answer: 2,
            explain: "People with an urgent need search for it. Search ads show right when they type `plumber near me`, which makes it the best first campaign.",
          },
        ],
      },
      {
        id: "keywords-and-match-types",
        title: "Keywords, match types and negatives",
        minutes: 7,
        summary:
          "Find the searches your customers use, choose broad, phrase or exact match, and block irrelevant searches with negative keywords.",
        blocks: [
          {
            type: "p",
            text: "Keywords are how you tell Google which searches your ad is relevant to. You are not buying the exact word; you are telling Google the **meaning** you want to show for. Google then matches your keyword to real searches, called **search terms**.",
          },
          { type: "h", text: "Keyword research" },
          {
            type: "steps",
            steps: [
              { title: "Start with your customer", text: "Write down 10 to 20 ways customers describe what they need, in their words. Include local terms, Hinglish and city names: `sofa repair bangalore`, `gst registration online`." },
              { title: "Use Keyword Planner", text: "Google's free **Keyword Planner** (in the tools menu) shows how often terms are searched and rough cost-per-click ranges. Enter your seed ideas and your website." },
              { title: "Look for buying intent", text: "Prefer words like `price`, `near me`, `buy`, `best`, `service`, `booking`. Skip pure research searches like `what is a root canal` at first." },
              { title: "Group by theme", text: "Put closely related keywords in the same ad group so each ad can speak directly to them." },
            ],
          },
          { type: "h", text: "The three match types" },
          {
            type: "diagram",
            id: "match-types",
            caption: "Broad match covers the most searches, phrase is narrower, exact is the tightest.",
          },
          {
            type: "table",
            columns: ["Match type", "How you write it", "Example keyword", "Can match"],
            rows: [
              ["Broad", "keyword", "interior designer mumbai", "home decor ideas mumbai, 2bhk interior cost, modular kitchen thane"],
              ["Phrase", "\"keyword\"", "\"interior designer mumbai\"", "best interior designer mumbai, interior designer in mumbai for flat"],
              ["Exact", "[keyword]", "[interior designer mumbai]", "interior designer mumbai, interior designers mumbai, mumbai interior designer"],
            ],
          },
          {
            type: "p",
            text: "Today all match types also match close variants: plurals, misspellings and searches with the same meaning. **Broad match** uses signals like your landing page and other keywords to find related searches, which gives the most reach but also the most irrelevant clicks when used without smart bidding.",
          },
          {
            type: "chart",
            title: "Cost per lead by match type (example, 30 days)",
            chart: {
              kind: "column",
              unit: "money",
              columns: [
                { label: "Broad + manual CPC", value: 1450 },
                { label: "Broad + smart bidding", value: 820 },
                { label: "Phrase", value: 760 },
                { label: "Exact", value: 640 },
              ],
            },
            caption: "Exact is often cheapest per lead but has limited volume. Broad only performs well when paired with smart bidding and good conversion data.",
          },
          {
            type: "callout",
            tone: "tip",
            title: "A sensible start",
            text: "Begin with **phrase and exact** match while you have little conversion data. Once you have roughly 30 or more conversions a month and use Maximize conversions or Target CPA, test **broad match**, which is Google's recommended pairing with smart bidding.",
          },
          { type: "h", text: "Negative keywords" },
          {
            type: "p",
            text: "A **negative keyword** stops your ad from showing for searches that contain it. They are your main defence against wasted spend. An interior designer does not want clicks from `interior design course`, `interior designer jobs` or `free interior design app`.",
          },
          {
            type: "list",
            items: [
              "Common negatives for service businesses: `jobs`, `salary`, `course`, `training`, `free`, `pdf`, `internship`, `diy`.",
              "Add competitor brand names as negatives if you do not want to bid on them.",
              "Save shared lists (a **negative keyword list**) and apply them to every campaign.",
              "Be careful: a negative on `cheap` will also block `cheap interior designer`, which may be a real customer.",
            ],
          },
          {
            type: "terms",
            terms: [
              { term: "Match type", def: "Controls how closely a search must relate to your keyword for your ad to show." },
              { term: "Close variant", def: "A search with the same meaning as your keyword, like a plural or misspelling." },
              { term: "Negative keyword", def: "A word that blocks your ad from searches containing it." },
              { term: "Keyword Planner", def: "Google's free tool for keyword ideas, search volumes and cost estimates." },
            ],
          },
          {
            type: "quiz",
            question: "Your keyword is \"yoga classes\" in phrase match. Which search is least likely to trigger it?",
            options: [
              "online yoga classes for beginners",
              "yoga classes near me",
              "yoga teacher training certification",
              "best yoga classes in indiranagar",
            ],
            answer: 2,
            explain: "Phrase match needs the meaning of `yoga classes` in the search. A teacher training certification is a different intent, so it is the least likely match. It is also a good candidate for a negative keyword.",
          },
        ],
      },
      {
        id: "ads-assets-bidding",
        title: "Ads, assets, bidding and budgets",
        minutes: 7,
        summary:
          "Write responsive search ads, add sitelinks, callouts and call assets, and choose a bidding strategy and budget that fit your data.",
        blocks: [
          { type: "h", text: "Responsive search ads" },
          {
            type: "p",
            text: "The standard Search ad is the **responsive search ad (RSA)**. You write up to 15 headlines (30 characters each) and up to 4 descriptions (90 characters each). Google mixes them to show the best combination for each search, usually 2 or 3 headlines and 1 or 2 descriptions. The old expanded text ads can no longer be created.",
          },
          {
            type: "list",
            items: [
              "Write at least 8 to 10 distinct headlines. Include the main keyword, a benefit, a price or offer, and a call to action.",
              "Example headlines for a Jaipur CA firm: `GST Filing From ₹999/Month`, `CA Firm In Jaipur`, `File In 24 Hours`, `Talk To A CA Today`.",
              "Make each headline able to stand alone, since any two may appear together.",
              "Aim for an **Ad strength** of Good or Excellent. It is a guide to variety, not a guarantee of results.",
            ],
          },
          {
            type: "callout",
            tone: "warn",
            title: "Pin sparingly",
            text: "**Pinning** fixes a headline to position 1, 2 or 3. It is useful for legal text or a brand name, but every pin reduces the combinations Google can test. Pin only what you must.",
          },
          { type: "h", text: "Assets make ads bigger" },
          {
            type: "table",
            columns: ["Asset", "What it adds", "Example"],
            rows: [
              ["Sitelinks", "Extra links to specific pages", "Pricing, Book a visit, Reviews, Contact"],
              ["Callouts", "Short benefit snippets", "Free home visit, 10-year warranty, EMI available"],
              ["Call asset", "A phone number or call button", "+91 98xxx xxxxx, shown during business hours"],
              ["Structured snippets", "A list under a header", "Services: GST, ITR, Audit, Payroll"],
              ["Image and business name/logo", "Visuals and brand next to the ad", "Your logo and a photo of your work"],
            ],
          },
          {
            type: "p",
            text: "Assets take more space on the page, which usually raises click-through rate at no extra cost per click. Add at least 4 sitelinks, 4 callouts and a call asset if phone calls matter to you.",
          },
          { type: "h", text: "Bidding strategies" },
          {
            type: "p",
            text: "Your **bidding strategy** tells Google what to optimize for. **Smart bidding** strategies use machine learning to set a bid for every single auction, based on signals like device, location, time and the search itself.",
          },
          {
            type: "table",
            columns: ["Strategy", "Optimizes for", "When to use", "Data needed"],
            rows: [
              ["Manual CPC", "You set each max bid", "Full control, or very small budgets while you learn", "None"],
              ["Maximize clicks", "Most clicks for the budget", "Brand-new account with no tracking yet, briefly", "None"],
              ["Maximize conversions", "Most conversions for the budget", "Tracking works and you want volume", "A few conversions helps; works from zero"],
              ["Target CPA", "Conversions at a target cost each", "Stable leads and you know your affordable CPA", "Roughly 15 to 30+ conversions a month"],
              ["Maximize conversion value / Target ROAS", "Revenue, or revenue at a target return", "Ecommerce with order values tracked", "Roughly 30 to 50+ conversions a month with values"],
            ],
          },
          {
            type: "callout",
            tone: "tip",
            text: "A common path: start on **Maximize conversions** (or Maximize clicks for a week if you truly have no tracking), then add a **Target CPA** once you have a month of steady conversions. Set the target close to what you are already paying, not a dream number.",
          },
          { type: "h", text: "Budgets, locations and languages" },
          {
            type: "p",
            text: "The **daily budget** is an average. Google may spend up to twice the daily budget on a busy day, but over a month it will not charge more than about 30.4 times your daily budget. A ₹500 daily budget means roughly ₹15,200 a month.",
          },
          {
            type: "p",
            text: "Set **locations** to where your customers are: a city, a radius around your shop, or pin codes. In location options, choose to target people **in or regularly in** your locations, not people merely interested in them. For **languages**, include English plus relevant local languages like Hindi or Tamil, since Google uses the user's settings and search language.",
          },
          {
            type: "quiz",
            question: "Your new ecommerce account has 4 conversions so far. Which bidding strategy is the most sensible starting point?",
            options: ["Target ROAS at 600%", "Maximize conversions", "Target CPA at ₹50", "Manual CPC at ₹1"],
            answer: 1,
            explain: "Target ROAS and Target CPA need a steady history of conversions to work well. Maximize conversions can learn from little data, and you can add a target later.",
          },
        ],
      },
      {
        id: "launch-search-campaign",
        title: "Launch a Search campaign, click by click",
        minutes: 6,
        summary:
          "Follow a step-by-step walkthrough to launch a Search campaign with a ₹500 a day test budget.",
        blocks: [
          {
            type: "p",
            text: "Let us launch a real Search campaign. Our example: a home cleaning service in Hyderabad, with a test budget of **₹500 a day** for two weeks (about ₹7,000). Conversion tracking for the booking form is already set up. The exact screen labels may differ slightly, but the flow is the same.",
          },
          {
            type: "steps",
            steps: [
              { title: "Start a new campaign", text: "Click **Create** (the plus button), then **Campaign**." },
              { title: "Choose the objective", text: "Pick **Leads** (or Sales for ecommerce). Make sure your booking conversion is selected as the goal, and remove any goals you do not care about." },
              { title: "Choose Search", text: "Select **Search** as the campaign type. Add your website and a campaign name like `Search - Cleaning - Hyderabad`." },
              { title: "Set bidding", text: "Choose **Conversions** as the focus, which gives Maximize conversions. Leave the target CPA empty for now." },
              { title: "Uncheck the networks", text: "Under networks, **untick Display Network**. It sends cheap, low-quality clicks to a Search campaign. Search partners can stay off for the first test too." },
              { title: "Set location and language", text: "Target Hyderabad (or a 15 km radius). In location options, choose people in or regularly in your location. Languages: English, Hindi and Telugu." },
              { title: "Skip broad AI features for now", text: "If offered options that auto-expand your ads or keywords, keep them off for this first test so you can learn what works." },
              { title: "Build the first ad group", text: "Name it `Deep cleaning`. Add 10 to 15 phrase and exact keywords like `\"deep cleaning services hyderabad\"` and `[home deep cleaning]`." },
              { title: "Write the ad", text: "Final URL: your deep cleaning page, not the home page. Add 10+ headlines and 4 descriptions, such as `Deep Cleaning From ₹2,999` and `Trained, Verified Staff`." },
              { title: "Add assets", text: "Add 4 sitelinks, 4 callouts and your phone number as a call asset." },
              { title: "Set the budget", text: "Enter ₹500 as the average daily budget." },
              { title: "Review and publish", text: "Fix any warnings, click **Publish**, and add your first negative keyword list (jobs, training, salary, free)." },
            ],
          },
          {
            type: "callout",
            tone: "info",
            title: "Ads go through review",
            text: "New ads are reviewed by Google, usually within a day. Status will show as under review, then eligible. If an ad is disapproved, the reason is shown and you can edit and resubmit.",
          },
          { type: "h", text: "What to check in the first two weeks" },
          {
            type: "list",
            ordered: true,
            items: [
              "Day 1 to 2: ads are approved and getting impressions. If there are none, check bids, budget and keyword volume.",
              "Every 2 to 3 days: open the search terms report and add negatives for irrelevant searches.",
              "Check that test bookings show up in Conversions. No conversions after 50+ clicks may mean a broken tag or a weak landing page.",
              "Day 14: look at cost per booking. With ₹7,000 spent and 5 bookings, your CPA is ₹1,400. Compare it with what a customer is worth to you.",
            ],
          },
          {
            type: "chart",
            title: "First 14 days: daily clicks and bookings (example)",
            chart: {
              kind: "line",
              unit: "number",
              x: ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13", "D14"],
              series: [
                { label: "Clicks", values: [6, 9, 11, 10, 12, 14, 13, 12, 15, 14, 16, 15, 17, 16] },
                { label: "Bookings", values: [0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1] },
              ],
            },
            caption: "A small budget gives few conversions per day. Judge results over the full two weeks, not day by day.",
          },
          {
            type: "callout",
            tone: "warn",
            text: "Do not change bids, budgets or keywords every day. Each big change makes Google relearn. Make small, planned changes and give them a few days.",
          },
          {
            type: "quiz",
            question: "Why should you untick the Display Network when creating a Search campaign?",
            options: [
              "Display ads cost more per click",
              "It often brings cheap, low-intent clicks that waste a Search budget",
              "Google does not allow it in India",
              "It stops your conversion tracking",
            ],
            answer: 1,
            explain: "Display inventory reaches people browsing websites and apps, not searching. Mixing it into a Search campaign spends money on low-intent clicks and muddies your data.",
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "google-optimize",
    track: "google",
    title: "Optimize Google ads",
    summary:
      "Improve Quality Score, clean up search terms, work with smart bidding, read impression share, use Performance Max and scale without breaking what works.",
    lessons: [
      {
        id: "quality-score-ad-rank",
        title: "Quality Score and Ad Rank",
        minutes: 6,
        summary:
          "Understand how Google ranks ads and how better relevance lets you pay less per click than competitors.",
        blocks: [
          {
            type: "p",
            text: "Google does not simply sell the top spot to the highest bidder. Every time someone searches, Google runs an **auction** and calculates an **Ad Rank** for each advertiser. Ad Rank decides whether your ad shows, in which position, and what you pay.",
          },
          {
            type: "diagram",
            id: "auction",
            caption: "Your bid matters, but so does how useful Google expects your ad to be.",
          },
          {
            type: "p",
            text: "Ad Rank combines your bid, the quality of your ad and landing page, the expected impact of your assets, and the context of the search (device, location, time). A more relevant advertiser can beat a bigger bidder and pay less for the same position.",
          },
          { type: "h", text: "Quality Score" },
          {
            type: "p",
            text: "**Quality Score** is a 1 to 10 rating shown for each keyword. It is a diagnostic tool, not a direct input to the auction, but it reflects the same things the auction cares about. It has three parts, each rated Below average, Average or Above average.",
          },
          {
            type: "terms",
            terms: [
              { term: "Expected CTR", def: "How likely people are to click your ad for this keyword, compared with other advertisers." },
              { term: "Ad relevance", def: "How closely your ad's message matches what the searcher wants." },
              { term: "Landing page experience", def: "How useful, relevant and fast your landing page is for the searcher." },
              { term: "CTR (click-through rate)", def: "The share of people who saw your ad and clicked it.", formula: "CTR = clicks ÷ impressions" },
            ],
          },
          {
            type: "chart",
            title: "Average CPC by Quality Score (example keyword, same position)",
            chart: {
              kind: "column",
              unit: "money",
              columns: [
                { label: "QS 3", value: 68 },
                { label: "QS 5", value: 45 },
                { label: "QS 7", value: 32 },
                { label: "QS 9", value: 24 },
              ],
            },
            caption: "Higher relevance usually means paying less per click for the same spot.",
          },
          { type: "h", text: "How to improve each part" },
          {
            type: "table",
            columns: ["Component", "If it is Below average, try"],
            rows: [
              ["Expected CTR", "Put the keyword in a headline, add an offer or price, add all relevant assets, remove keywords that rarely get clicks."],
              ["Ad relevance", "Split broad ad groups into tighter themes so each ad speaks to its keywords directly."],
              ["Landing page experience", "Send people to the matching page, not the home page. Make it load fast on mobile, show the price and a clear call or form."],
            ],
          },
          {
            type: "callout",
            tone: "tip",
            title: "Mobile speed matters in India",
            text: "Most of your clicks come from phones, often on patchy data. A page that takes 6 seconds to load loses many visitors before they see anything. Compress images and remove heavy sliders and pop-ups.",
          },
          {
            type: "callout",
            tone: "info",
            text: "Do not chase a 10 on every keyword. Focus on keywords with a lot of spend and a score of 5 or below. That is where improvements save the most money.",
          },
          {
            type: "quiz",
            question: "Your keyword has Above average expected CTR and ad relevance, but Below average landing page experience. What should you fix first?",
            options: [
              "Write new headlines",
              "Raise your bid",
              "Improve the landing page speed and relevance",
              "Change the match type to broad",
            ],
            answer: 2,
            explain: "The ad itself is fine; the weak part is where people land. A faster, more relevant page lifts Quality Score and conversions.",
          },
        ],
      },
      {
        id: "search-terms-and-smart-bidding",
        title: "Search terms, negatives and smart bidding",
        minutes: 7,
        summary:
          "Clean up what you pay for with the search terms report, and give smart bidding the time and conversions it needs to learn.",
        blocks: [
          { type: "h", text: "The search terms report" },
          {
            type: "p",
            text: "Your keywords are what you chose. **Search terms** are what people actually typed. The search terms report (under Insights and reports, or in the Keywords section) shows them with clicks, cost and conversions. It is the single most useful report for cutting waste.",
          },
          {
            type: "steps",
            steps: [
              { title: "Open the report", text: "Select the last 30 days and sort by cost, highest first." },
              { title: "Find the waste", text: "Look for terms with spend but no conversions and the wrong intent: jobs, free, DIY, other cities, competitor names you do not want." },
              { title: "Add negatives", text: "Tick the terms and add them as negative keywords, at the campaign level or to your shared negative list. Use phrase or exact match negatives for precision." },
              { title: "Find winners", text: "Terms that convert well but are not yet keywords can be added as exact or phrase keywords in the right ad group." },
              { title: "Repeat", text: "Do this weekly for new campaigns and every two weeks once things settle." },
            ],
          },
          {
            type: "callout",
            tone: "info",
            text: "Google hides search terms with very low volume for privacy, so you will not see every search. Still, the visible terms usually cover most of your spend.",
          },
          { type: "h", text: "The smart bidding learning period" },
          {
            type: "p",
            text: "When you switch to a smart bidding strategy, or make a big change to it, the strategy enters a **learning period**. Google tests bids to understand which auctions lead to conversions. Performance can be up and down during this time, usually for 1 to 2 weeks, and longer if you get few conversions.",
          },
          {
            type: "chart",
            title: "Cost per lead while Target CPA learns (example)",
            chart: {
              kind: "line",
              unit: "money",
              x: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7", "Day 8", "Day 9", "Day 10", "Day 11", "Day 12", "Day 13", "Day 14"],
              series: [
                { label: "Actual cost per lead", values: [1150, 1320, 980, 1240, 1090, 960, 1010, 890, 920, 850, 870, 810, 830, 800] },
                { label: "Target CPA", values: [800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800] },
              ],
            },
            caption: "The first week is noisy. By week two, cost per lead settles close to the target.",
          },
          {
            type: "list",
            items: [
              "**Feed it conversions.** Target CPA works best with about 30 or more conversions a month in the campaign; fewer means slower, noisier learning.",
              "**Do not panic early.** Judge results after the learning period, not on day 3.",
              "**Change targets gradually.** Move a Target CPA or Target ROAS by about 10 to 20% at a time.",
              "**Avoid big resets.** Large budget jumps, new conversion goals or major structure changes restart learning.",
              "**If conversions are rare**, optimize for an earlier step that happens more often, such as a qualified lead, then move deeper later.",
            ],
          },
          {
            type: "callout",
            tone: "warn",
            title: "Broken tracking breaks bidding",
            text: "If your conversion tag stops firing, smart bidding thinks your ads stopped working and cuts bids. Check your conversion counts weekly and fix gaps fast.",
          },
          {
            type: "terms",
            terms: [
              { term: "Search terms report", def: "A list of the real searches that triggered your ads, with their cost and results." },
              { term: "Learning period", def: "The time a smart bidding strategy needs to adjust after it starts or changes." },
              { term: "Target CPA", def: "A smart bidding strategy that aims for conversions at your chosen average cost each." },
            ],
          },
          {
            type: "quiz",
            question: "You set Target CPA to ₹800 and on day 3 your cost per lead is ₹1,300. What should you do?",
            options: [
              "Switch back to manual CPC immediately",
              "Lower the target to ₹400 to force it down",
              "Wait for the learning period to finish, while checking tracking and search terms",
              "Double the budget",
            ],
            answer: 2,
            explain: "Early numbers during learning are noisy. Big changes restart learning. Let it settle for 1 to 2 weeks and use that time to confirm tracking and clean search terms.",
          },
        ],
      },
      {
        id: "impression-share-and-pmax",
        title: "Impression share and Performance Max",
        minutes: 7,
        summary:
          "Read impression share to see whether budget or rank is holding you back, and learn how Performance Max and asset groups work.",
        blocks: [
          { type: "h", text: "Impression share" },
          {
            type: "p",
            text: "**Search impression share** is the percentage of times your ad showed out of all the times it was eligible to show. If it is 40%, you missed 60% of the chances. Google tells you why you missed them with two more columns.",
          },
          {
            type: "terms",
            terms: [
              { term: "Search impression share", def: "Impressions you got divided by the impressions you were eligible for.", formula: "IS = impressions ÷ eligible impressions" },
              { term: "Lost IS (budget)", def: "Share of chances missed because your budget ran out." },
              { term: "Lost IS (rank)", def: "Share of chances missed because your Ad Rank was too low: bid, quality or both." },
            ],
          },
          {
            type: "chart",
            title: "Where a campaign's impressions go (example, last 30 days)",
            chart: {
              kind: "column",
              unit: "percent",
              columns: [
                { label: "Impression share", value: 0.42 },
                { label: "Lost to budget", value: 0.38 },
                { label: "Lost to rank", value: 0.2 },
              ],
            },
            caption: "This campaign is mainly held back by budget. If its cost per lead is healthy, more budget should bring more leads.",
          },
          {
            type: "table",
            columns: ["What you see", "What it means", "What to do"],
            rows: [
              ["High lost IS (budget), good CPA", "Profitable, but running out of money", "Raise the budget gradually"],
              ["High lost IS (budget), poor CPA", "Spending fast on the wrong things", "Cut waste first: negatives, pause weak keywords"],
              ["High lost IS (rank)", "Ad Rank too low", "Improve Quality Score and ads, or raise bids/targets carefully"],
              ["IS above 85 to 90%", "You show for almost everything", "More budget will not help much; expand keywords or campaign types"],
            ],
          },
          { type: "h", text: "Performance Max basics" },
          {
            type: "p",
            text: "**Performance Max (PMax)** is a campaign type that runs across Search, Shopping, YouTube, Display, Discover, Gmail and Maps from one campaign. You give Google your goals, budget, creative and audience hints; Google decides where and to whom to show ads.",
          },
          {
            type: "list",
            items: [
              "**Asset groups** are PMax's version of ad groups. Each holds headlines, descriptions, images, logos and videos around one theme, like `Sofas` or `Dining tables`.",
              "**Audience signals** are hints, such as your customer list or website visitors, that help Google start in the right place. They are suggestions, not strict targeting.",
              "For ecommerce, link Merchant Center so PMax can show your products. **Listing groups** decide which products each asset group covers.",
              "Add brand exclusions and account-level negative keywords where available, so PMax does not simply take credit for people already searching your brand name.",
              "Add your own video if you can. If you do not, Google may generate one from your images, which often looks basic.",
            ],
          },
          {
            type: "callout",
            tone: "warn",
            title: "PMax needs good data",
            text: "Performance Max is only as good as your conversion tracking. If you count low-value actions as conversions, it will find lots of them cheaply on Display and YouTube. Use it once real sales or qualified leads are tracked.",
          },
          {
            type: "callout",
            tone: "tip",
            text: "Many advertisers run Search for their most important keywords alongside PMax. When a search exactly matches an exact-match keyword in your Search campaign, the Search campaign generally gets priority.",
          },
          {
            type: "quiz",
            question: "A campaign has a ₹650 cost per lead (your target is ₹900), 45% impression share, and 48% lost to budget. What is the best next step?",
            options: [
              "Pause the campaign",
              "Raise the budget in steps",
              "Lower bids to save money",
              "Add more negative keywords only",
            ],
            answer: 1,
            explain: "The campaign is beating its target and losing half its chances to budget. Raising the budget gradually should buy more leads at a good cost.",
          },
        ],
      },
      {
        id: "scaling-and-waste",
        title: "Scale safely and stop wasted spend",
        minutes: 6,
        summary:
          "Increase budgets in steady steps and spot the most common ways Google Ads budgets are wasted.",
        blocks: [
          { type: "h", text: "Scaling budgets safely" },
          {
            type: "p",
            text: "Once a campaign hits your target cost per conversion and is losing impression share to budget, it is time to scale. The safest way is to raise the budget in **steps of about 15 to 20% every few days**, not in one big jump.",
          },
          {
            type: "diagram",
            id: "scaling",
            caption: "Small, regular increases keep smart bidding stable. A sudden 3x jump often spikes cost per conversion.",
          },
          {
            type: "p",
            text: "Example: a campaign at ₹1,000 a day with a ₹700 cost per lead. Raise it to ₹1,200, wait 3 to 4 days, then ₹1,450, then ₹1,750. After about two weeks you are near ₹1,750 a day, and you can see if the cost per lead is holding.",
          },
          {
            type: "list",
            items: [
              "Expect cost per conversion to rise a little as you scale; you are buying less obvious clicks.",
              "Loosen targets slowly too. Raising Target CPA from ₹700 to ₹800 lets Google bid into more auctions.",
              "When budget stops being the limit, grow with new keywords, new ad groups, new locations or a new campaign type.",
              "Keep an eye on your sales team: more leads are only useful if you can call them back quickly.",
            ],
          },
          { type: "h", text: "Common wasted spend patterns" },
          {
            type: "table",
            columns: ["Pattern", "How to spot it", "Fix"],
            rows: [
              ["Display Network in Search campaigns", "Many clicks from websites and apps, few conversions", "Untick Display in campaign settings"],
              ["Irrelevant search terms", "Jobs, free, courses or other cities in the search terms report", "Add negatives weekly and use shared lists"],
              ["Wrong location setting", "Clicks from outside your service area", "Target people in or regularly in your location"],
              ["Broad match on manual bids", "High spend, vague search terms", "Use phrase/exact, or pair broad with smart bidding"],
              ["Home page as landing page", "Low conversion rate, weak landing page score", "Send each ad group to its matching page"],
              ["Counting the wrong conversions", "Lots of conversions but no real sales", "Keep only real goals as primary conversions"],
              ["Ads running when you cannot answer", "Calls and chats at night going unanswered", "Use an ad schedule for call-heavy campaigns"],
            ],
          },
          {
            type: "chart",
            title: "Monthly spend on wasted clicks after a cleanup (example)",
            chart: {
              kind: "line",
              unit: "money",
              x: ["Month 1", "Month 2", "Month 3", "Month 4"],
              series: [
                { label: "Wasted spend", values: [14200, 8600, 5100, 3900] },
                { label: "Spend on converting terms", values: [25800, 31400, 34900, 36100] },
              ],
            },
            caption: "Same ₹40,000 a month budget: weekly negatives and fixed settings move money from waste to searches that convert.",
          },
          {
            type: "callout",
            tone: "tip",
            title: "Review auto-applied recommendations",
            text: "Google can automatically apply some recommendations, such as adding keywords or raising budgets. Check the recommendations settings and turn off auto-apply for anything you want to decide yourself.",
          },
          {
            type: "quiz",
            question: "Your campaign spends ₹1,000 a day at a healthy cost per lead. What is the safest way to grow it?",
            options: [
              "Jump straight to ₹5,000 a day",
              "Raise it by about 20% every few days and watch cost per lead",
              "Create 10 copies of the campaign",
              "Switch to Maximize clicks to get more traffic",
            ],
            answer: 1,
            explain: "Gradual increases let smart bidding adjust without big swings, and you can stop if cost per lead starts rising too much.",
          },
        ],
      },
    ],
  },
];

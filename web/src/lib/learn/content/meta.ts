import type { Module } from "../types";

export const META_MODULES: Module[] = [
  {
    id: "meta-setup",
    track: "meta",
    title: "Get set up on Meta",
    summary:
      "Set up your Business portfolio, Page, Instagram, ad account, payments and tracking the right way before you spend a rupee.",
    lessons: [
      {
        id: "business-portfolio",
        title: "Business portfolio, Page and Instagram",
        minutes: 5,
        summary:
          "Put your Page, Instagram account and ad account inside one Business portfolio so your business, not a single person, owns them.",
        blocks: [
          {
            type: "p",
            text: "Before you can run ads on Facebook and Instagram, you need a few pieces in place. Meta calls the home for all of them a **Business portfolio** (it used to be called Business Manager). You manage it from **Meta Business Suite** or the business settings area.",
          },
          {
            type: "p",
            text: "Think of the Business portfolio as a folder that belongs to your business. Inside it sit your Facebook Page, your Instagram account, your ad account, your Pixel and the people who can work on them. If an employee or agency leaves, the folder stays with you.",
          },
          {
            type: "terms",
            terms: [
              {
                term: "Business portfolio",
                def: "The container that owns your business assets on Meta: Pages, Instagram accounts, ad accounts, Pixels and people.",
              },
              {
                term: "Facebook Page",
                def: "Your business's public profile on Facebook. Every Meta ad runs from a Page, so you need one even if you mostly care about Instagram.",
              },
              {
                term: "Instagram professional account",
                def: "A business or creator Instagram account. Linking it lets your ads show your Instagram name and lets you reply to comments on ads.",
              },
              {
                term: "Ad account",
                def: "Where campaigns live and where billing happens. It has its own currency, time zone and payment method.",
              },
            ],
          },
          { type: "h", text: "Setting it up" },
          {
            type: "steps",
            steps: [
              {
                title: "Create the Business portfolio",
                text: "Log in with your personal Facebook profile (Meta requires a real person behind every business) and create a portfolio with your business name and work email.",
              },
              {
                title: "Add or create your Facebook Page",
                text: "If you already have a Page, add it to the portfolio. If an agency or old employee created it, ask them to transfer ownership instead of making a new one.",
              },
              {
                title: "Connect your Instagram account",
                text: "Switch Instagram to a professional account first, then connect it to your Page and your portfolio.",
              },
              {
                title: "Create the ad account",
                text: "Create a new ad account inside the portfolio. You will pick its currency and time zone here, so read the next lesson before you click create.",
              },
            ],
          },
          {
            type: "callout",
            tone: "warn",
            title: "Own your assets",
            text: "A very common problem in India: a freelancer creates the Page and ad account under their own portfolio, then disappears. Always make sure **your** Business portfolio owns the Page, Instagram and ad account, and give agencies partner access instead.",
          },
          {
            type: "p",
            text: "Meta may ask you to verify your business later, for example with a GST certificate, a utility bill or a business registration document. Verification is not always needed to start, but it helps with higher spending limits and unlocking some features.",
          },
          {
            type: "quiz",
            question: "Why should your Business portfolio, rather than a freelancer's, own your ad account?",
            options: [
              "Ads get cheaper when you own the account",
              "So you keep the account, its history and data if the freelancer leaves",
              "Meta only shows ads from business-owned accounts on Instagram",
              "Freelancers cannot run ads in India",
            ],
            answer: 1,
            explain:
              "Ownership decides who controls the assets. If your portfolio owns them, you keep the ad account, Pixel data and history, and you simply remove the freelancer's access.",
          },
        ],
      },
      {
        id: "ad-account-payments-access",
        title: "Ad account, payments and access",
        minutes: 5,
        summary:
          "Choose currency and time zone carefully, add a payment method, and give people only the access they need.",
        blocks: [
          {
            type: "p",
            text: "Your ad account has two settings you should treat as permanent: **currency** and **time zone**. Changing them later generally means creating a new ad account and losing the old reporting history in one place.",
          },
          {
            type: "list",
            items: [
              "**Currency:** pick INR (₹) if you pay from an Indian card, UPI or net banking. All budgets and reports will be in rupees.",
              "**Time zone:** pick Asia/Kolkata. Daily budgets reset at midnight in this time zone, and ad schedules follow it, so the wrong one shifts everything by hours.",
            ],
          },
          { type: "h", text: "Adding a payment method" },
          {
            type: "p",
            text: "In India you can usually pay with a credit or debit card, UPI or net banking. Some methods charge you automatically after you spend (a **billing threshold**), while others work as **prepaid funds** that you top up first and ads stop when the balance runs out.",
          },
          {
            type: "table",
            columns: ["Payment type", "How it works", "Good for"],
            rows: [
              [
                "Automatic (card)",
                "Meta charges your card when you hit a billing threshold or on your monthly bill date.",
                "Steady spenders who don't want ads to stop unexpectedly.",
              ],
              [
                "Prepaid (UPI, net banking)",
                "You add money first, for example ₹2,000, and ads pause when it is used up.",
                "Beginners who want a hard limit on spend.",
              ],
            ],
          },
          {
            type: "callout",
            tone: "info",
            title: "GST on ad spend",
            text: "Meta adds GST to ad spend for Indian accounts. If you are GST registered, add your GSTIN in the payment settings so your invoices show it and you can claim input credit.",
          },
          {
            type: "callout",
            tone: "tip",
            title: "Set an account spending limit",
            text: "You can set an overall spending limit on the ad account, for example ₹10,000. It is a safety net: no mistake in a campaign budget can spend beyond it.",
          },
          { type: "h", text: "Roles and access" },
          {
            type: "p",
            text: "People get access at two levels: to the Business portfolio itself, and to each asset (Page, ad account, Pixel). Give each person the smallest access they need.",
          },
          {
            type: "table",
            columns: ["Who", "Suggested access"],
            rows: [
              ["You, the owner", "Full control of the portfolio and every asset. Add a second trusted admin so you are never locked out."],
              ["Marketing employee", "Employee access to the portfolio, with permission to manage campaigns on the ad account."],
              ["Agency", "Add their Business portfolio as a partner and share only the ad account, Page and Pixel they need."],
              ["Accountant", "View-only access to the ad account for invoices and reports."],
            ],
          },
          {
            type: "callout",
            tone: "warn",
            text: "Turn on two-factor authentication for every admin. Hacked Facebook profiles are one of the most common ways businesses lose their ad accounts.",
          },
          {
            type: "quiz",
            question: "You run a bakery in Pune. Which ad account settings should you choose?",
            options: [
              "USD currency and Pacific time, because Meta is American",
              "INR currency and Asia/Kolkata time zone",
              "INR currency and any time zone, since you can change it later",
              "It doesn't matter, Meta converts everything automatically",
            ],
            answer: 1,
            explain:
              "Pay and report in rupees, and use Indian time so budgets reset and schedules run at your midnight. Both are hard to change later.",
          },
        ],
      },
      {
        id: "pixel-and-conversions-api",
        title: "The Meta Pixel and Conversions API",
        minutes: 6,
        summary:
          "The Pixel and Conversions API tell Meta who bought or signed up, which is what lets Meta find more people like them.",
        blocks: [
          {
            type: "p",
            text: "If Meta cannot see what happens after someone clicks your ad, it can only optimize for clicks. To optimize for sales or leads, Meta needs to know when those happen. That is what the Pixel and the Conversions API do.",
          },
          {
            type: "terms",
            terms: [
              {
                term: "Meta Pixel",
                def: "A small piece of code on your website that runs in the visitor's browser and reports actions (events) back to Meta.",
              },
              {
                term: "Conversions API (CAPI)",
                def: "A way for your server (or your store platform) to send the same events to Meta directly, without relying on the browser.",
              },
              {
                term: "Event",
                def: "An action someone takes, such as `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase` or `Lead`.",
              },
              {
                term: "Deduplication",
                def: "When the Pixel and CAPI both send the same event, a shared event ID lets Meta count it once, not twice.",
              },
            ],
          },
          {
            type: "p",
            text: "Why both? Ad blockers, browser privacy settings and iPhone tracking limits stop some Pixel events from arriving. CAPI fills those gaps from your server. Using both usually means Meta sees more of your real sales, which improves both reporting and optimization.",
          },
          {
            type: "table",
            columns: ["Event", "When it fires", "Use it to optimize for"],
            rows: [
              ["PageView", "Any page loads", "Nothing, it is for building audiences"],
              ["ViewContent", "A product page is viewed", "Early testing when sales are rare"],
              ["AddToCart", "Item added to cart", "Stores with few purchases per week"],
              ["Purchase", "Order confirmed, with value like ₹1,499", "Sales campaigns for online stores"],
              ["Lead", "Form submitted or enquiry sent", "Leads campaigns for services"],
            ],
          },
          { type: "h", text: "Getting it installed" },
          {
            type: "steps",
            steps: [
              {
                title: "Create a dataset",
                text: "In Events Manager, create a Pixel (Meta groups Pixel and CAPI data together as a dataset) inside your Business portfolio.",
              },
              {
                title: "Use your platform's integration",
                text: "Shopify, WooCommerce, Wix and many Indian store builders have a Meta integration that installs the Pixel and CAPI for you. This is the easiest route.",
              },
              {
                title: "Or add it by hand",
                text: "Paste the Pixel base code into every page, and fire `Purchase` or `Lead` on the thank-you page. Ask a developer to set up CAPI from your server.",
              },
              {
                title: "Test it",
                text: "Use the test events tool in Events Manager, make a test enquiry or order, and check the event appears with the right value.",
              },
            ],
          },
          { type: "h", text: "Domain verification" },
          {
            type: "p",
            text: "Domain verification proves to Meta that you own your website, usually by adding a DNS TXT record or a meta tag. It helps protect your links from being misused by others and lets you control which events matter most for your domain. Do it once in your business settings.",
          },
          {
            type: "diagram",
            id: "attribution",
            caption:
              "Meta credits a result to your ad if it happens within the attribution window after a click or view. The default is 7 days after a click or 1 day after a view.",
          },
          {
            type: "callout",
            tone: "tip",
            text: "Always send the purchase **value** and currency (for example `value: 1499, currency: INR`). Without it, Meta cannot show you ROAS or optimize for high-value orders.",
          },
          {
            type: "quiz",
            question: "What is the main reason to add the Conversions API on top of the Pixel?",
            options: [
              "It makes your website load faster",
              "It is required to run any ad on Instagram",
              "It sends events from your server, recovering conversions the browser Pixel misses",
              "It replaces the need to choose an objective",
            ],
            answer: 2,
            explain:
              "Browsers and ad blockers drop some Pixel events. CAPI sends them from your server, so Meta sees more of your real results, with deduplication preventing double counting.",
          },
        ],
      },
    ],
  },
  {
    id: "meta-first-ad",
    track: "meta",
    title: "Launch your first Meta ad",
    summary:
      "Understand campaigns, ad sets and ads, pick the right objective, audience and creative, and publish a small test ad step by step.",
    lessons: [
      {
        id: "structure-and-objectives",
        title: "Campaigns, ad sets, ads and objectives",
        minutes: 6,
        summary:
          "Every Meta ad sits in a three-level structure, and the objective you pick tells Meta what result to hunt for.",
        blocks: [
          {
            type: "p",
            text: "Meta ads are organized in three levels. Knowing which setting lives at which level saves you a lot of confusion in Ads Manager, the tool where you create and manage ads.",
          },
          {
            type: "diagram",
            id: "meta-structure",
            caption: "One campaign holds one or more ad sets; each ad set holds one or more ads.",
          },
          {
            type: "list",
            items: [
              "**Campaign:** the goal. You choose the objective here, and optionally a shared budget.",
              "**Ad set:** who, where, when and how much. Audience, placements, schedule, budget and the conversion event live here.",
              "**Ad:** what people see. Image or video, text, headline, button and link.",
            ],
          },
          { type: "h", text: "Choosing an objective" },
          {
            type: "p",
            text: "Meta offers six objectives. The objective is not a label; it changes who Meta shows your ad to. A Traffic campaign finds people who click a lot. A Sales campaign finds people likely to buy. Pick the objective that matches the result you actually want to pay for.",
          },
          {
            type: "table",
            columns: ["Objective", "What Meta optimizes for", "When to use"],
            rows: [
              ["Awareness", "Reaching many people and ad recall", "New brand or local launch, e.g. a new café opening"],
              ["Traffic", "Link clicks or landing page views", "Sending people to a blog or page when you can't track sales yet"],
              ["Engagement", "Likes, comments, video views, messages", "WhatsApp or Messenger chats, growing post engagement"],
              ["Leads", "Form fills, calls or sign-ups", "Services: coaching, real estate, clinics, B2B"],
              ["App promotion", "App installs and in-app actions", "You have an app on Play Store or App Store"],
              ["Sales", "Purchases or other valuable conversions", "Online stores with the Pixel tracking Purchase"],
            ],
          },
          {
            type: "diagram",
            id: "funnel",
            caption: "Objectives map to funnel stages: Awareness at the top, Traffic and Engagement in the middle, Leads and Sales at the bottom.",
          },
          {
            type: "callout",
            tone: "warn",
            title: "The Traffic trap",
            text: "Many beginners pick Traffic because clicks look cheap, say ₹3 each. But Meta then finds people who click, not people who buy. If you want sales or leads, choose Sales or Leads even if the cost per click is higher.",
          },
          {
            type: "p",
            text: "For most small Indian businesses the choice is simple: an online store picks **Sales**, a service business picks **Leads**, and a business that closes deals on WhatsApp often picks **Engagement** with a messaging goal or **Leads**.",
          },
          {
            type: "quiz",
            question: "Where do you set the audience and placements for a Meta ad?",
            options: ["Campaign level", "Ad set level", "Ad level", "Business portfolio settings"],
            answer: 1,
            explain:
              "The ad set controls who sees the ad, where, when and with what budget. The campaign holds the objective, and the ad holds the creative.",
          },
        ],
      },
      {
        id: "budget-audience-placements",
        title: "Budget, audience and placements",
        minutes: 7,
        summary:
          "Decide how much to spend, who to reach and where your ads appear, and let Meta's Advantage+ options help where it makes sense.",
        blocks: [
          { type: "h", text: "Budget and schedule" },
          {
            type: "terms",
            terms: [
              {
                term: "Daily budget",
                def: "The average amount you spend per day, e.g. ₹500. Meta may spend a bit more on good days and less on others, but it evens out over the week.",
              },
              {
                term: "Lifetime budget",
                def: "A total for a fixed period, e.g. ₹7,000 from 1 to 14 October. Needed if you want to run ads only at certain hours.",
              },
              {
                term: "Advantage campaign budget",
                def: "One budget at the campaign level that Meta shares across ad sets, moving money to whichever performs best.",
              },
              {
                term: "Ad set budget",
                def: "Each ad set gets its own fixed budget, so you control exactly how much each one spends.",
              },
            ],
          },
          {
            type: "p",
            text: "For a first test, an ad set budget of ₹300 to ₹1,000 a day is realistic. Use Advantage campaign budget once you have several ad sets and trust Meta to split the money; use ad set budgets when you need to guarantee spend on a specific audience.",
          },
          { type: "h", text: "Audience" },
          {
            type: "p",
            text: "The audience is who can see your ad. Start with the basics: **location** (a country, state, city or a radius around your shop), **age** and **language** if it matters.",
          },
          {
            type: "list",
            items: [
              "**Advantage+ audience:** Meta's default. You can give it suggestions, like interests or an age range, and Meta uses them as a starting point but can go beyond them if it finds better people. It often works well for Sales and Leads.",
              "**Custom audience:** people who already know you, such as website visitors from the Pixel, your customer list (phone numbers or emails), or people who engaged with your Instagram.",
              "**Lookalike audience:** new people who resemble a custom audience, for example a 1% lookalike of your past buyers in India.",
            ],
          },
          {
            type: "callout",
            tone: "tip",
            text: "Don't over-narrow. An audience of 20,000 people in one pincode with five stacked interests leaves Meta little room to find buyers. For most businesses, the location plus Advantage+ audience beats a clever hand-built interest mix.",
          },
          {
            type: "callout",
            tone: "info",
            text: "Customer lists are hashed (scrambled) before matching, but only upload data your customers agreed to share with you.",
          },
          { type: "h", text: "Placements" },
          {
            type: "p",
            text: "Placements are the spots where your ad appears: Facebook and Instagram Feed, Stories, Reels, Messenger, the Audience Network of partner apps and more.",
          },
          {
            type: "table",
            columns: ["Option", "What happens", "Use when"],
            rows: [
              [
                "Advantage+ placements",
                "Meta shows your ad wherever it can get results at the lowest cost.",
                "Almost always, especially when starting out.",
              ],
              [
                "Manual placements",
                "You choose exactly where, e.g. only Instagram Feed and Reels.",
                "Your creative only fits one format, or a placement clearly brings junk results.",
              ],
            ],
          },
          {
            type: "p",
            text: "If you use Advantage+ placements, upload creatives in both square or 4:5 (for Feed) and 9:16 (for Stories and Reels) so the ad looks right everywhere.",
          },
          {
            type: "quiz",
            question: "You want your ads to run only between 10 am and 8 pm. Which budget type do you need?",
            options: [
              "Daily budget",
              "Lifetime budget",
              "Advantage campaign budget with a daily limit",
              "No budget, Meta decides",
            ],
            answer: 1,
            explain:
              "Ad scheduling (running only at certain hours or days) is available with a lifetime budget, because Meta needs a fixed total and end date to plan delivery.",
          },
        ],
      },
      {
        id: "creative-and-review",
        title: "Creative, tracking links and ad review",
        minutes: 6,
        summary:
          "Build ads that fit every placement, tag your links with UTMs, and avoid the policy issues that get ads rejected.",
        blocks: [
          {
            type: "p",
            text: "The creative is the part of the ad people actually see. On Meta, creative matters more than almost any setting, because it decides who stops scrolling.",
          },
          {
            type: "table",
            columns: ["Format", "Recommended size", "Tips"],
            rows: [
              ["Single image", "1080×1350 (4:5) for Feed, 1080×1920 (9:16) for Stories and Reels", "Keep text on the image short; product and price should be clear"],
              ["Video", "9:16 vertical, 15 to 30 seconds", "Hook in the first 3 seconds; add captions since many watch muted"],
              ["Carousel", "2 to 10 cards, 1080×1080 each", "Great for showing several products or steps"],
            ],
          },
          {
            type: "terms",
            terms: [
              { term: "Primary text", def: "The text above the image or video. The first line or two matter most, since the rest is hidden behind a see-more link." },
              { term: "Headline", def: "A short bold line near the button, e.g. 'Free delivery across India'." },
              { term: "Call to action (CTA)", def: "The button, such as Shop now, Learn more, Sign up or Send WhatsApp message." },
              {
                term: "UTM tags",
                def: "Labels added to your link so tools like Google Analytics know the visit came from this ad.",
                formula: "?utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}",
              },
            ],
          },
          {
            type: "callout",
            tone: "tip",
            text: "Ads Manager has a URL parameters field at the ad level where you can add UTMs once. Meta can fill in names like the campaign and ad name dynamically, so you don't type them by hand.",
          },
          { type: "h", text: "Ad review" },
          {
            type: "p",
            text: "Every new or edited ad goes through Meta's review, usually within a few hours, sometimes up to a day. If it is rejected, you'll see the reason in Ads Manager and in Account Quality, where you can fix the ad or request another review.",
          },
          {
            type: "list",
            items: [
              "**Personal attributes:** don't imply you know something about the viewer, e.g. 'Are you diabetic?' or 'Struggling with debt?'. Say 'Sugar-free sweets for everyone' instead.",
              "**Before-and-after images** for weight loss or skin care are usually rejected.",
              "**Unrealistic claims** like 'Earn ₹1 lakh a week from home' or 'guaranteed results'.",
              "**Restricted categories** such as alcohol, supplements, real-money gaming, finance and dating have extra rules or need permission.",
              "**Broken or mismatched landing pages:** the link must work and match what the ad promises.",
              "**Special ad categories:** ads about credit, employment, housing or social and political issues must be declared when you create the campaign and have fewer targeting options.",
            ],
          },
          {
            type: "callout",
            tone: "warn",
            text: "Repeated rejections can restrict your ad account. Fix the cause instead of re-uploading the same ad again and again.",
          },
          {
            type: "quiz",
            question: "Which primary text is most likely to be rejected by Meta?",
            options: [
              "Fresh homemade pickles, delivered across India",
              "Are you overweight? Lose 10 kg in 10 days!",
              "New batch of cotton kurtas, sizes S to XXL",
              "Book a free demo class this Saturday",
            ],
            answer: 1,
            explain:
              "It asserts a personal attribute ('Are you overweight?') and makes an unrealistic health claim. Both break Meta's advertising standards.",
          },
        ],
      },
      {
        id: "post-your-first-ad",
        title: "Post your first ad, click by click",
        minutes: 6,
        summary:
          "A step-by-step walkthrough of publishing a small ₹ test campaign in Ads Manager.",
        blocks: [
          {
            type: "p",
            text: "Let's post a real ad. Our example: an online saree shop that has the Pixel tracking purchases, testing with ₹500 a day for a week. The exact button names may shift a little as Meta updates Ads Manager, but the flow stays the same.",
          },
          {
            type: "steps",
            steps: [
              { title: "Open Ads Manager", text: "Go to Ads Manager from Meta Business Suite or adsmanager.facebook.com and check the correct ad account is selected at the top." },
              { title: "Click Create", text: "Click the green Create button to start a new campaign." },
              { title: "Pick the objective", text: "Choose **Sales** (use **Leads** if you are a service business). You may be offered an Advantage+ setup or a manual one; for your first campaign either works." },
              { title: "Name the campaign", text: "Use a clear name like `Sales | Sarees | Oct test`. Good names make reports readable later." },
              { title: "Set the budget", text: "Choose a daily budget of ₹500. For one ad set, it does not matter much whether it sits at campaign or ad set level." },
              { title: "Choose the conversion event", text: "In the ad set, pick Website as the conversion location, select your Pixel and choose `Purchase`." },
              { title: "Set the audience", text: "Location: India (or the states you ship to). Age: 22 to 55 for our example. Leave Advantage+ audience on and add a suggestion if you like." },
              { title: "Leave placements on Advantage+", text: "Keep Advantage+ placements so Meta can use Feed, Stories and Reels." },
              { title: "Pick your identity", text: "In the ad, select your Facebook Page and Instagram account." },
              { title: "Add creative", text: "Upload 2 or 3 images or short videos, write primary text, a headline and pick the Shop now button." },
              { title: "Add the link and UTMs", text: "Paste your product or collection URL and add UTM parameters." },
              { title: "Review and publish", text: "Check the preview for Feed, Stories and Reels, confirm the payment method, then click Publish. The ad goes into review and starts delivering once approved." },
            ],
          },
          {
            type: "callout",
            tone: "tip",
            title: "Budget rule of thumb",
            text: "Aim for a daily budget that can buy several results a week. If a sale costs about ₹400 to win, ₹500 a day gets you roughly 8 to 9 sales a week: enough to learn from, but slow to exit learning. Start there and raise it once results look good.",
          },
          { type: "h", text: "What to check in the first 3 days" },
          {
            type: "list",
            items: [
              "Status is Active, not In review or Rejected.",
              "The ad is spending close to ₹500 a day.",
              "Link clicks and landing page views are coming in, and your Pixel shows matching visits.",
              "Don't judge cost per purchase yet. Give it at least 3 to 7 days.",
            ],
          },
          {
            type: "callout",
            tone: "warn",
            text: "Avoid editing the ad set every day in the first week. Each significant edit can restart Meta's learning, which you'll learn about in the Optimize module.",
          },
          {
            type: "quiz",
            question: "Your saree shop's Pixel tracks purchases. Which conversion event should the ad set optimize for?",
            options: ["PageView", "Link clicks", "Purchase", "Post engagement"],
            answer: 2,
            explain:
              "Optimize for the result you want to pay for. With Purchase tracked, Meta looks for people likely to buy, not just visit or click.",
          },
        ],
      },
      {
        id: "lead-form-ads",
        title: "Lead form (instant form) ads",
        minutes: 6,
        summary:
          "Collect enquiries inside Facebook and Instagram with an instant form, then get those leads to your team fast.",
        blocks: [
          {
            type: "p",
            text: "An **instant form** (also called a lead form) opens inside Facebook or Instagram when someone taps your ad. Their name, phone and email are pre-filled from their profile, so filling it takes seconds. You don't need a website.",
          },
          {
            type: "p",
            text: "Instant forms suit service businesses: coaching institutes, clinics, real estate, insurance, interior designers and B2B software.",
          },
          {
            type: "steps",
            steps: [
              { title: "Create a Leads campaign", text: "Choose the Leads objective and, in the ad set, choose instant forms as the conversion location." },
              { title: "Create a new form", text: "In the ad, create a form. Choose **More volume** for easy, quick submissions, or **Higher intent**, which adds a review step before submitting." },
              { title: "Write the intro", text: "Add a headline and a line or two on what they get, e.g. 'Get a free home interior quote in 24 hours'." },
              { title: "Add questions", text: "Keep pre-filled fields to what you need (name, phone, city). Add one or two custom questions, like budget range or preferred course, to qualify leads." },
              { title: "Add a privacy policy", text: "A link to your privacy policy is required. It must be a real page on your website explaining how you use their data." },
              { title: "Finish with a thank-you screen", text: "Tell them what happens next and add a button to your website, WhatsApp or a call." },
            ],
          },
          {
            type: "callout",
            tone: "tip",
            title: "More volume vs higher intent",
            text: "More volume gives cheaper leads (say ₹60 each) but more junk numbers. Higher intent may cost ₹120 per lead, yet more of them pick up the phone. Judge by cost per qualified lead, not cost per lead.",
          },
          { type: "h", text: "Getting your leads" },
          {
            type: "list",
            items: [
              "**Download:** leads can be downloaded as a CSV from the Leads Center in Meta Business Suite or from the form library. Meta only keeps them available for download for a limited time, so don't leave them there.",
              "**Sync to a CRM:** connect your CRM or a tool like Zapier so leads flow automatically to your team or a Google Sheet.",
              "**Call fast:** leads contacted within 5 minutes convert far better than leads called the next day.",
            ],
          },
          {
            type: "diagram",
            id: "lead-pipeline",
            caption: "Not every lead becomes a customer. Track each stage so you know your true cost per sale.",
          },
          {
            type: "chart",
            title: "Leads per stage from ₹10,000 spent",
            chart: {
              kind: "column",
              unit: "number",
              columns: [
                { label: "Leads", value: 120 },
                { label: "Contacted", value: 84 },
                { label: "Qualified", value: 36 },
                { label: "Won", value: 9 },
              ],
            },
            caption: "At ₹83 per lead, each customer actually cost about ₹1,111. Faster calling lifts the Contacted and Won bars.",
          },
          {
            type: "quiz",
            question: "What must every Meta instant form include?",
            options: [
              "A discount code",
              "At least five custom questions",
              "A link to your privacy policy",
              "A video",
            ],
            answer: 2,
            explain:
              "Meta requires a privacy policy link because you are collecting personal data. Discounts, videos and extra questions are optional.",
          },
        ],
      },
    ],
  },
  {
    id: "meta-optimize",
    track: "meta",
    title: "Optimize Meta ads",
    summary:
      "Get through the learning phase, read delivery, test creatives, scale safely and know when to pause.",
    lessons: [
      {
        id: "learning-phase",
        title: "The learning phase",
        minutes: 6,
        summary:
          "New or heavily edited ad sets need about 50 results in 7 days to stabilize, so plan budgets and edits around it.",
        blocks: [
          {
            type: "p",
            text: "When an ad set starts, Meta doesn't yet know who will respond. It experiments with different people, placements and times. This exploring period is the **learning phase**, and results are usually more expensive and jumpy during it.",
          },
          {
            type: "diagram",
            id: "learning-phase",
            caption: "An ad set typically exits learning after about 50 optimization events within 7 days of its last significant edit.",
          },
          {
            type: "terms",
            terms: [
              { term: "Optimization event", def: "The result the ad set optimizes for, such as Purchase, Lead or Link click." },
              { term: "Learning", def: "The ad set is still exploring. Expect higher and unstable costs." },
              { term: "Learning limited", def: "Meta predicts the ad set won't get enough events to exit learning, often because the budget is too small, the audience too narrow or the event too rare." },
              { term: "Active", def: "Learning is complete and delivery has stabilized." },
            ],
          },
          {
            type: "chart",
            title: "Cost per purchase during and after learning",
            chart: {
              kind: "line",
              unit: "money",
              x: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7", "Day 8", "Day 9", "Day 10"],
              series: [
                { label: "Cost per purchase", values: [780, 640, 690, 520, 480, 450, 410, 380, 370, 365] },
                { label: "Target cost", values: [400, 400, 400, 400, 400, 400, 400, 400, 400, 400] },
              ],
            },
            caption: "Costs settle below target once learning ends around day 7. Pausing on day 2 would have killed a winner.",
          },
          { type: "h", text: "What resets learning" },
          {
            type: "list",
            items: [
              "Changing the targeting, placements or optimization event.",
              "Adding a new ad to the ad set, or editing the creative a lot.",
              "Pausing the ad set for about 7 days or more.",
              "A big budget change (roughly more than 20% at once) or a big bid change.",
            ],
          },
          {
            type: "callout",
            tone: "tip",
            title: "Fixing Learning limited",
            text: "Do the maths: 50 events a week at ₹400 each needs about ₹20,000 a week, or ₹2,850 a day. If that's too much, combine ad sets, widen the audience, or optimize for an earlier, more frequent event like AddToCart until sales volume grows.",
          },
          {
            type: "callout",
            tone: "info",
            text: "Learning limited doesn't mean the ad set is failing. If it's delivering at a cost you're happy with, it's fine to leave it.",
          },
          {
            type: "quiz",
            question: "Your ad set optimizes for Lead at about ₹150 per lead. Roughly what weekly budget helps it exit learning?",
            options: ["₹1,500", "₹3,500", "₹7,500", "₹75,000"],
            answer: 2,
            explain:
              "About 50 leads in 7 days × ₹150 per lead = ₹7,500 a week, or roughly ₹1,070 a day.",
          },
        ],
      },
      {
        id: "delivery-and-creative-testing",
        title: "Delivery, the auction and creative testing",
        minutes: 7,
        summary:
          "Understand how Meta's auction picks ads, read your delivery metrics, and test creatives before fatigue sets in.",
        blocks: [
          {
            type: "p",
            text: "Every time someone scrolls, Meta runs an **auction** to decide which ad to show. The highest bid doesn't automatically win. Meta picks the ad with the highest total value, combining your bid, how likely this person is to take your action, and ad quality.",
          },
          {
            type: "diagram",
            id: "auction",
            caption: "Total value = bid × estimated action rate × ad quality. Better creative can beat a bigger budget.",
          },
          {
            type: "p",
            text: "This is why creative matters so much. An ad people like gets a higher estimated action rate and quality, so it wins more auctions at a lower cost.",
          },
          { type: "h", text: "Reading delivery" },
          {
            type: "table",
            columns: ["Metric", "What it tells you", "Watch for"],
            rows: [
              ["Reach and impressions", "How many people saw it, and how many times", "Very low reach may mean a tiny audience or budget"],
              ["Frequency", "Average times each person saw your ad", "Above 3 to 4 in a week on cold audiences often means fatigue"],
              ["CPM", "Cost per 1,000 impressions", "Rising CPM means auction competition, e.g. during Diwali sales"],
              ["CTR (link)", "Share of impressions that became link clicks", "Below about 0.8% often means the creative isn't landing"],
              ["Cost per result", "What you pay for each purchase or lead", "Your main number; compare it to what a customer is worth"],
            ],
          },
          { type: "h", text: "Testing creatives" },
          {
            type: "p",
            text: "The simplest test: put 3 to 5 different creatives in one ad set and let Meta spend on the winners. Make them genuinely different (a customer video, a product photo with price, a carousel), not five colours of the same banner.",
          },
          {
            type: "chart",
            title: "Link CTR by creative after one week",
            chart: {
              kind: "column",
              unit: "percent",
              columns: [
                { label: "Customer video", value: 0.021 },
                { label: "Product + price", value: 0.014 },
                { label: "Carousel", value: 0.011 },
                { label: "Brand graphic", value: 0.006 },
              ],
            },
            caption: "The real-customer video clearly wins; the polished brand graphic is worth pausing.",
          },
          {
            type: "callout",
            tone: "info",
            text: "CTR is a clue, not the verdict. Check cost per purchase or lead too; sometimes a lower-CTR ad brings better buyers.",
          },
          { type: "h", text: "Creative fatigue" },
          {
            type: "p",
            text: "Even great ads wear out. When the same people see an ad too often, CTR falls and cost per result rises. That is **creative fatigue**.",
          },
          {
            type: "chart",
            title: "A fatiguing ad over 4 weeks",
            chart: {
              kind: "line",
              unit: "percent",
              x: ["Week 1", "Week 2", "Week 3", "Week 4"],
              series: [{ label: "Link CTR", values: [0.019, 0.016, 0.011, 0.008] }],
            },
            caption: "CTR more than halved as frequency climbed. Time to add fresh creative.",
          },
          {
            type: "callout",
            tone: "tip",
            text: "Add 2 or 3 new creatives every couple of weeks rather than waiting for results to crash. Remember that adding ads to an existing ad set can restart learning, so batch your additions.",
          },
          {
            type: "quiz",
            question: "Two advertisers bid the same amount. Why might one still win the auction more often?",
            options: [
              "They created their ad account earlier",
              "Their ad has a higher estimated action rate and quality",
              "They use a lifetime budget",
              "They picked manual placements",
            ],
            answer: 1,
            explain:
              "Meta ranks by total value, not bid alone. An ad people are more likely to act on, with better quality, wins more often and pays less.",
          },
        ],
      },
      {
        id: "scaling-and-pausing",
        title: "Scaling, overlap and when to pause",
        minutes: 6,
        summary:
          "Grow winning ad sets in small steps, avoid competing with yourself, and make calm pause-or-wait decisions.",
        blocks: [
          {
            type: "p",
            text: "Once an ad set delivers results at a good cost, you'll want more of them. There are two main ways to scale: raise the budget, or duplicate.",
          },
          {
            type: "diagram",
            id: "scaling",
            caption: "Raising budget by about 20% every 2 to 3 days keeps delivery stable; a sudden 3x jump can reset learning and spike costs.",
          },
          {
            type: "chart",
            title: "Daily budget: steady steps vs one jump",
            chart: {
              kind: "line",
              unit: "money",
              x: ["Day 1", "Day 3", "Day 5", "Day 7", "Day 9", "Day 11", "Day 13"],
              series: [
                { label: "20% steps", values: [1000, 1200, 1440, 1730, 2070, 2490, 2990] },
                { label: "One big jump", values: [1000, 3000, 3000, 3000, 3000, 3000, 3000] },
              ],
            },
            caption: "Both reach about ₹3,000 a day, but the stepped path gives Meta time to adjust.",
          },
          {
            type: "table",
            columns: ["Method", "How", "Pros", "Cons"],
            rows: [
              ["Vertical (raise budget)", "Increase the same ad set by ~20% every few days", "Keeps learning and history", "Slow; costs may rise as you reach less likely buyers"],
              ["Horizontal (duplicate)", "Copy a winning ad set with a new audience or bigger budget", "Fast; tests new audiences", "New ad set starts learning from zero; can overlap"],
            ],
          },
          { type: "h", text: "Audience overlap" },
          {
            type: "p",
            text: "If two of your ad sets target many of the same people, they compete in the same auctions and Meta has to choose between them. This can raise costs and split learning. Fewer, broader ad sets usually beat many small overlapping ones. Ads Manager has an audience overlap check for saved and custom audiences.",
          },
          { type: "h", text: "Pause or wait?" },
          {
            type: "table",
            columns: ["Situation", "What to do"],
            rows: [
              ["Day 2, in learning, costs 50% above target", "Wait. It's too early to judge."],
              ["Spent 2 to 3× your target cost per result with zero results", "Pause the ad or ad set and review creative and landing page."],
              ["Out of learning, cost steady and on target", "Leave it alone or scale by ~20%."],
              ["Frequency above 4, CTR falling for 2 weeks", "Add new creatives; pause the tired ones."],
              ["Rejected ad or broken landing page", "Pause and fix right away."],
            ],
          },
          {
            type: "callout",
            tone: "tip",
            text: "Pause individual weak ads rather than the whole ad set when possible, and judge on at least 3 to 7 days of data, never a single bad day.",
          },
          {
            type: "quiz",
            question: "A ₹1,000/day ad set is profitable and out of learning. What's the safest next step?",
            options: [
              "Raise it to ₹5,000 today",
              "Raise it to about ₹1,200 and check again in 2 to 3 days",
              "Duplicate it 5 times with the same audience",
              "Change the audience to find new people",
            ],
            answer: 1,
            explain:
              "Small steps of around 20% usually avoid resetting learning. Duplicating with the same audience causes overlap, and changing targeting restarts learning.",
          },
        ],
      },
      {
        id: "advantage-plus-sales",
        title: "Advantage+ sales campaigns",
        minutes: 5,
        summary:
          "Advantage+ sales campaigns hand targeting, placements and budget to Meta's automation, which works well once your tracking is solid.",
        blocks: [
          {
            type: "p",
            text: "**Advantage+ sales campaigns** (earlier called Advantage+ shopping campaigns) are Meta's automated way to run Sales campaigns. You provide the budget, the conversion event and lots of creatives; Meta decides who sees what and where.",
          },
          {
            type: "list",
            items: [
              "Audience is mostly automated: you set the country and a few controls, and Meta finds buyers.",
              "Placements are automatic across Facebook, Instagram and more.",
              "Budget sits at the campaign level and flows to the best ads.",
              "You can typically add many creatives in one campaign, including catalogue ads if you have a product catalogue.",
            ],
          },
          {
            type: "table",
            columns: ["", "Manual Sales campaign", "Advantage+ sales campaign"],
            rows: [
              ["Setup time", "Longer; you build audiences and ad sets", "Short; fewer settings"],
              ["Control", "High", "Lower; you mainly control budget and creative"],
              ["Best for", "Testing specific audiences or offers", "Stores with steady Purchase data"],
              ["Needs", "Any tracking", "Reliable Pixel + CAPI purchase tracking"],
            ],
          },
          {
            type: "callout",
            tone: "tip",
            title: "When to try it",
            text: "A good time is when your Pixel records at least a few dozen purchases a month and you have 5 or more solid creatives. Run it next to your best manual campaign with similar budgets, e.g. ₹1,500 a day each for two weeks, and compare cost per purchase and ROAS.",
          },
          {
            type: "callout",
            tone: "warn",
            text: "Automation can spend heavily on people who would have bought anyway, like existing customers. If you can, tell Meta who your existing customers are (via a customer list) and check how much spend goes to them, so you know the campaign is finding new buyers.",
          },
          {
            type: "p",
            text: "Advantage+ is not magic. Its results are only as good as the purchase data and creatives you feed it. Keep refreshing creatives and keep your tracking healthy, and it can become the backbone of an online store's Meta ads.",
          },
          {
            type: "quiz",
            question: "What is the most important requirement before relying on an Advantage+ sales campaign?",
            options: [
              "A very narrow interest audience",
              "Reliable purchase tracking with the Pixel and Conversions API",
              "Manual placements on Instagram only",
              "A lifetime budget",
            ],
            answer: 1,
            explain:
              "The automation learns from your purchase events. Without accurate Purchase data, it has nothing good to optimize towards.",
          },
        ],
      },
    ],
  },
];

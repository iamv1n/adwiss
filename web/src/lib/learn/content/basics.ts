import type { Module } from "../types";

export const BASICS_MODULES: Module[] = [
  {
    id: "ad-fundamentals",
    track: "basics",
    title: "Ad fundamentals",
    summary:
      "How paid ads actually work, how to pick a goal, the numbers every advertiser uses, and how to set a target cost that keeps you profitable.",
    lessons: [
      {
        id: "how-paid-ads-work",
        title: "How paid ads work",
        minutes: 5,
        summary:
          "Meta and Google sell your customers' attention through an auction, and your budget and bid decide how much of it you can buy.",
        blocks: [
          {
            type: "p",
            text: "When you run ads on Meta (Facebook and Instagram) or Google (Search, YouTube, Shopping and more), you are not buying a fixed spot like a newspaper ad. You are buying **attention**: a chance to show your ad to a person who is scrolling a feed, searching for something or watching a video.",
          },
          {
            type: "p",
            text: "There are far more advertisers than there are ad slots. So every time a slot opens up, the platform runs a tiny **auction** in a fraction of a second to decide which ad to show. This happens billions of times a day.",
          },
          { type: "h", text: "Who wins the auction" },
          {
            type: "p",
            text: "The highest bid does not automatically win. Both Meta and Google want people to keep using their apps, so they reward ads that people are likely to find useful. Roughly, the winner is the ad with the best combination of three things.",
          },
          {
            type: "list",
            items: [
              "**Your bid**: how much you are willing to pay for the result you asked for (a click, a lead, a sale).",
              "**Expected action rate**: how likely the platform thinks this person is to click or buy after seeing your ad.",
              "**Quality and relevance**: how useful and relevant your ad and landing page look for this person.",
            ],
          },
          {
            type: "diagram",
            id: "auction",
            caption:
              "The winner is not simply the highest bidder: bid, expected action rate and quality are combined.",
          },
          {
            type: "callout",
            tone: "tip",
            title: "Good ads are cheaper",
            text: "Because relevance is part of the score, a clear, eye-catching ad can beat a bigger brand's bid and pay less for the same slot. Improving your creative is often the cheapest way to lower your costs.",
          },
          { type: "h", text: "Budgets and bids, at a high level" },
          {
            type: "p",
            text: "You control two main levers. Your **budget** is how much you are willing to spend, usually per day (for example ₹1,000 a day) or over the whole campaign. Your **bid strategy** tells the platform how to spend it.",
          },
          {
            type: "p",
            text: "Most beginners should start with the automatic option: let the platform try to get the most results for your budget. Both Meta and Google also let you set a target, such as a target cost per result or a target return on ad spend, once you have enough data. You will learn how to pick those targets later in this module.",
          },
          {
            type: "terms",
            terms: [
              {
                term: "Budget",
                def: "The maximum you are willing to spend, per day or over a campaign's lifetime. Platforms may spend a bit more on some days and less on others, averaging out.",
              },
              {
                term: "Bid",
                def: "What you are willing to pay for a result. With automatic bidding the platform sets bids for you in each auction.",
              },
              {
                term: "Auction",
                def: "The instant contest that decides which ad fills an ad slot, based on bid, expected action rate and quality.",
              },
            ],
          },
          { type: "h", text: "Why prices change" },
          {
            type: "p",
            text: "Because it is an auction, prices move with competition. In India, costs usually climb in the festive season (Navratri, Diwali, big sale days) when every brand is advertising at once. Your ads did not get worse; the auction simply got more crowded.",
          },
          {
            type: "chart",
            title: "Cost per 1,000 impressions for a fashion store through the year",
            chart: {
              kind: "column",
              unit: "money",
              columns: [
                { label: "Jun", value: 95 },
                { label: "Jul", value: 90 },
                { label: "Aug", value: 105 },
                { label: "Sep", value: 130 },
                { label: "Oct", value: 185 },
                { label: "Nov", value: 170 },
                { label: "Dec", value: 120 },
              ],
            },
            caption:
              "The same ads cost almost twice as much to show in October, when Diwali competition peaks.",
          },
          {
            type: "callout",
            tone: "info",
            text: "You only pay for what you get. You are never charged your whole daily budget for nothing: you pay for impressions or clicks that actually happen.",
          },
          {
            type: "quiz",
            question: "Two shops bid for the same ad slot. Shop A bids more, but Shop B's ad is much more relevant and gets clicked far more. What usually happens?",
            options: [
              "Shop A always wins because it bid more",
              "Shop B can win and may even pay less, because relevance and expected action rate count too",
              "The platform shows both ads in the same slot",
              "Whoever launched their campaign first wins",
            ],
            answer: 1,
            explain:
              "Auctions combine bid, expected action rate and quality. A highly relevant ad can beat a higher bid, which is why good creative lowers your costs.",
          },
        ],
      },
      {
        id: "funnel-and-goals",
        title: "The funnel and choosing a goal",
        minutes: 5,
        summary:
          "Customers move from not knowing you to buying, and the goal you pick tells the platform which kind of person to find.",
        blocks: [
          {
            type: "p",
            text: "Very few people buy the first time they see a brand. Most go through stages: they notice you, they think about it, and then they act. Marketers call this the **funnel**, because many people enter at the top and fewer come out at the bottom.",
          },
          {
            type: "diagram",
            id: "funnel",
            caption:
              "Awareness, consideration and conversion, with the kind of goal and metric that fits each stage.",
          },
          {
            type: "terms",
            terms: [
              {
                term: "Awareness",
                def: "People learn that you exist. Success is measured by how many people saw you and how cheaply.",
              },
              {
                term: "Consideration",
                def: "People show interest: they click, watch a video, visit your site or message you.",
              },
              {
                term: "Conversion",
                def: "People take the action you care about most: buy, fill a lead form, call, or book an appointment.",
              },
            ],
          },
          { type: "h", text: "The goal is an instruction, not a label" },
          {
            type: "p",
            text: "When you create a campaign, Meta asks for an **objective** (such as Awareness, Traffic, Engagement, Leads, App promotion or Sales) and Google asks for a **goal** (such as Sales, Leads or Website traffic). This choice matters more than most beginners think.",
          },
          {
            type: "p",
            text: "The platform takes your goal literally. If you choose Traffic, it finds people who click a lot, who are often not people who buy. If you choose Sales, it looks for people who look like your past buyers. **You get what you optimise for.**",
          },
          {
            type: "callout",
            tone: "warn",
            title: "The classic beginner mistake",
            text: "A shop wants sales but runs a Traffic campaign because clicks look cheap (₹3 a click!). Thousands of visitors arrive, nobody buys, and the budget is gone. If you want sales, pick a sales goal and measure sales.",
          },
          { type: "h", text: "Which goal should you pick?" },
          {
            type: "table",
            columns: ["Your business wants", "Pick this goal", "Judge it by"],
            rows: [
              ["Online orders on your website", "Sales", "Cost per purchase, ROAS"],
              ["Enquiries, form fills, WhatsApp chats", "Leads", "Cost per lead, lead quality"],
              ["Phone calls or store visits", "Leads or local goals", "Cost per call, visits"],
              ["A new brand that nobody knows yet", "Awareness", "Reach, CPM, frequency"],
              ["People to watch a product video", "Engagement or video views", "Cost per view"],
            ],
          },
          {
            type: "p",
            text: "Conversion goals only work well when the platform can see the conversions. That means you need tracking set up: the Meta Pixel and Conversions API for Meta, and a Google tag with conversion tracking for Google. Without it, the platform is optimising blind.",
          },
          {
            type: "callout",
            tone: "tip",
            text: "Small budget? Start at the bottom of the funnel. With ₹500 to ₹2,000 a day, you usually get the best return from sales or leads campaigns aimed at people ready to act, and from retargeting people who already visited your site.",
          },
          {
            type: "quiz",
            question: "A salon wants more appointment bookings through its website form. Which goal fits best?",
            options: ["Awareness", "Traffic", "Leads", "Video views"],
            answer: 2,
            explain:
              "Bookings through a form are leads. A Leads goal tells the platform to find people likely to fill the form, not just people who click or watch.",
          },
        ],
      },
      {
        id: "key-metrics",
        title: "Every key metric, explained",
        minutes: 7,
        summary:
          "Impressions, reach, CTR, CPC, CPM, conversion rate, CPA and ROAS, with formulas and one worked ₹ example that ties them together.",
        blocks: [
          {
            type: "p",
            text: "Ad dashboards are full of short forms. The good news: they all describe one simple journey. People see your ad, some click, some of those buy, and the buyers bring in money. Each metric measures one step, or the cost of one step.",
          },
          {
            type: "diagram",
            id: "metrics-flow",
            caption:
              "Impressions become clicks, clicks become conversions, conversions become revenue. The ratios between steps are the metrics you watch.",
          },
          { type: "h", text: "Seeing the ad" },
          {
            type: "terms",
            terms: [
              {
                term: "Impressions",
                def: "The number of times your ad was shown. One person seeing it three times counts as three impressions.",
              },
              {
                term: "Reach",
                def: "The number of different people who saw your ad at least once.",
              },
              {
                term: "Frequency",
                def: "How many times, on average, each person saw your ad.",
                formula: "Frequency = Impressions ÷ Reach",
              },
              {
                term: "CPM (cost per mille)",
                def: "What you pay for 1,000 impressions. Mille is Latin for thousand. It tells you how expensive the auction is.",
                formula: "CPM = Spend ÷ Impressions × 1,000",
              },
            ],
          },
          { type: "h", text: "Clicking" },
          {
            type: "terms",
            terms: [
              {
                term: "Clicks",
                def: "How many times people clicked your ad. Meta also reports link clicks, which only count clicks that go to your site or app; those are the ones to watch.",
              },
              {
                term: "CTR (click-through rate)",
                def: "The share of impressions that became clicks. A quick signal of whether your ad grabs attention.",
                formula: "CTR = Clicks ÷ Impressions",
              },
              {
                term: "CPC (cost per click)",
                def: "What you paid, on average, for each click.",
                formula: "CPC = Spend ÷ Clicks",
              },
            ],
          },
          { type: "h", text: "Buying and earning" },
          {
            type: "terms",
            terms: [
              {
                term: "Conversion",
                def: "The valuable action you are tracking: a purchase, a lead, a call, a sign-up.",
              },
              {
                term: "Conversion rate (CVR)",
                def: "The share of clicks that turned into conversions. Mostly a measure of your website or landing page and your offer.",
                formula: "CVR = Conversions ÷ Clicks",
              },
              {
                term: "CPA (cost per acquisition) or cost per result",
                def: "What you paid, on average, for each conversion. Meta calls it cost per result; Google calls it cost per conversion.",
                formula: "CPA = Spend ÷ Conversions",
              },
              {
                term: "Revenue or conversion value",
                def: "The money brought in by the conversions the platform tracked, as reported by your tracking.",
              },
              {
                term: "ROAS (return on ad spend)",
                def: "How many rupees of revenue you got for each rupee spent on ads. Often written as 3x or 3.0.",
                formula: "ROAS = Revenue ÷ Spend",
              },
            ],
          },
          { type: "h", text: "A worked example" },
          {
            type: "p",
            text: "Priya sells handmade cotton kurtas online for ₹1,500 each. Last week she spent **₹10,000** on ads. Here is what her dashboard showed, and how each number is calculated.",
          },
          {
            type: "table",
            columns: ["Metric", "Calculation", "Result"],
            rows: [
              ["Impressions", "From the dashboard", "50,000"],
              ["Reach", "From the dashboard", "20,000 people"],
              ["Frequency", "50,000 ÷ 20,000", "2.5"],
              ["CPM", "₹10,000 ÷ 50,000 × 1,000", "₹200"],
              ["Clicks", "From the dashboard", "750"],
              ["CTR", "750 ÷ 50,000", "1.5%"],
              ["CPC", "₹10,000 ÷ 750", "₹13.33"],
              ["Purchases", "From the dashboard", "15"],
              ["Conversion rate", "15 ÷ 750", "2%"],
              ["CPA", "₹10,000 ÷ 15", "₹667"],
              ["Revenue", "15 × ₹1,500", "₹22,500"],
              ["ROAS", "₹22,500 ÷ ₹10,000", "2.25x"],
            ],
          },
          { type: "h", text: "Revenue is not profit" },
          {
            type: "p",
            text: "A ROAS of 2.25x sounds great: ₹22,500 back for ₹10,000 spent. But revenue is what the customer paid, not what Priya keeps. Each kurta costs her ₹900 to make, pack and ship, so she keeps **₹600 per sale** before ads.",
          },
          {
            type: "p",
            text: "15 sales × ₹600 = ₹9,000 of gross profit. Subtract ₹10,000 of ad spend and she actually **lost ₹1,000** last week, even with a positive-looking ROAS.",
          },
          {
            type: "callout",
            tone: "warn",
            title: "Always ask: after costs, did I make money?",
            text: "Profit = Revenue − product and delivery costs − ad spend. A ROAS that looks good in the dashboard can still mean a loss if your margins are thin.",
          },
          {
            type: "quiz",
            question: "You spent ₹6,000 and got 300 clicks and 12 sales worth ₹18,000. What are your CPC, CPA and ROAS?",
            options: [
              "CPC ₹20, CPA ₹500, ROAS 3x",
              "CPC ₹50, CPA ₹20, ROAS 0.33x",
              "CPC ₹20, CPA ₹1,500, ROAS 3x",
              "CPC ₹500, CPA ₹20, ROAS 2x",
            ],
            answer: 0,
            explain:
              "CPC = ₹6,000 ÷ 300 = ₹20. CPA = ₹6,000 ÷ 12 = ₹500. ROAS = ₹18,000 ÷ ₹6,000 = 3x.",
          },
        ],
      },
      {
        id: "setting-targets",
        title: "Setting a target CPA and ROAS from your margins",
        minutes: 6,
        summary:
          "Work out the most you can pay for a customer from your own numbers, so you know when an ad is making or losing money.",
        blocks: [
          {
            type: "p",
            text: "Is a CPA of ₹400 good? Is a ROAS of 3x good? There is no universal answer. It depends entirely on how much money you keep from each sale. In this lesson you will calculate your own targets in a few minutes.",
          },
          { type: "h", text: "Step 1: find your profit per sale before ads" },
          {
            type: "p",
            text: "Take the average order value (AOV, what a customer pays on an average order) and subtract every cost of fulfilling it: the product, packaging, shipping, payment gateway fees and any marketplace or COD charges.",
          },
          {
            type: "table",
            columns: ["Item", "Amount"],
            rows: [
              ["Average order value", "₹1,500"],
              ["Product cost", "− ₹600"],
              ["Packaging and shipping", "− ₹150"],
              ["Payment gateway and other fees", "− ₹50"],
              ["Profit per sale before ads", "₹700"],
            ],
          },
          { type: "h", text: "Step 2: your break-even numbers" },
          {
            type: "p",
            text: "If you pay ₹700 in ads to get a ₹700-profit sale, you make exactly nothing. That is your **break-even CPA**. Pay less and you profit; pay more and you lose money.",
          },
          {
            type: "terms",
            terms: [
              {
                term: "Break-even CPA",
                def: "The most you can pay for one sale without losing money.",
                formula: "Break-even CPA = Profit per sale before ads",
              },
              {
                term: "Break-even ROAS",
                def: "The lowest ROAS at which ads pay for themselves.",
                formula: "Break-even ROAS = AOV ÷ Profit per sale before ads",
              },
            ],
          },
          {
            type: "p",
            text: "Here: break-even CPA is ₹700 and break-even ROAS is ₹1,500 ÷ ₹700 ≈ **2.14x**. Any week below 2.14x ROAS loses money, no matter how good it looks.",
          },
          { type: "h", text: "Step 3: leave room for profit" },
          {
            type: "p",
            text: "Break-even is the floor, not the goal. Decide how much profit you want to keep per order, then subtract it. If you want to keep ₹300 per order, your **target CPA** is ₹700 − ₹300 = ₹400, and your **target ROAS** is ₹1,500 ÷ ₹400 = 3.75x.",
          },
          {
            type: "steps",
            steps: [
              {
                title: "Calculate profit per sale before ads",
                text: "AOV minus product, shipping, packaging and fees.",
              },
              {
                title: "Set break-even",
                text: "Break-even CPA equals that profit. Break-even ROAS is AOV divided by it.",
              },
              {
                title: "Choose the profit you want to keep",
                text: "Subtract it from break-even CPA to get your target CPA.",
              },
              {
                title: "Convert to ROAS if you prefer",
                text: "Target ROAS = AOV ÷ target CPA.",
              },
            ],
          },
          { type: "h", text: "Adjust for Indian realities" },
          {
            type: "callout",
            tone: "warn",
            title: "Cash on delivery and returns",
            text: "If 20% of your COD orders are refused at the door (return to origin, or RTO), you pay shipping both ways and earn nothing on them. Work out profit on **delivered** orders only, and lower your target CPA to match.",
          },
          {
            type: "p",
            text: "For example, if only 80 of every 100 orders are delivered, each ad-driven order is worth 80% as much. A ₹400 target CPA per delivered order becomes roughly ₹320 per order placed, which is what the ad platform will report.",
          },
          {
            type: "callout",
            tone: "tip",
            title: "Repeat customers change the maths",
            text: "If customers typically order again, you can afford to pay more for the first sale. Only do this if you have real repeat-purchase data, not hope.",
          },
          {
            type: "p",
            text: "For leads, the same idea applies. If 1 in 10 leads becomes a customer worth ₹8,000 in profit, each lead is worth about ₹800 to you, so a cost per lead under that (with room for profit) is healthy.",
          },
          {
            type: "quiz",
            question: "Your AOV is ₹2,000 and your profit per sale before ads is ₹500. What is your break-even ROAS?",
            options: ["2x", "4x", "0.25x", "5x"],
            answer: 1,
            explain:
              "Break-even ROAS = AOV ÷ profit per sale = ₹2,000 ÷ ₹500 = 4x. Below 4x, your ads lose money.",
          },
        ],
      },
    ],
  },
  {
    id: "reading-results",
    track: "basics",
    title: "Reading your results",
    summary:
      "Know which numbers to watch for your goal, how to judge results without over-reacting, why platforms and your bank disagree, and how to spot problems early.",
    lessons: [
      {
        id: "metrics-by-goal",
        title: "Which metrics matter for your goal",
        minutes: 5,
        summary:
          "Different goals need different scorecards: judge sales campaigns by profit, lead campaigns by lead quality and awareness campaigns by reach.",
        blocks: [
          {
            type: "p",
            text: "A dashboard can show fifty columns. Most of them are **diagnostic**: they help explain a problem. Only one or two are your **main metric**, the number that says whether the campaign is doing its job. Your main metric depends on your goal.",
          },
          {
            type: "table",
            columns: ["Goal", "Main metric", "Helpful diagnostics"],
            rows: [
              ["Online sales", "ROAS or CPA vs your target", "CTR, CPC, conversion rate, AOV"],
              ["Leads", "Cost per qualified lead", "Cost per lead, CTR, form completion rate"],
              ["Awareness", "Reach and CPM", "Frequency, video watch time"],
            ],
          },
          { type: "h", text: "Online sales" },
          {
            type: "p",
            text: "Judge sales campaigns by **ROAS or CPA against the targets you calculated** from your margins. CTR and CPC are useful for finding out why results changed, but a campaign with an expensive ₹25 CPC and a 4x ROAS beats one with a cheap ₹5 CPC and a 1.2x ROAS every time.",
          },
          {
            type: "chart",
            title: "Daily spend vs revenue over 14 days",
            chart: {
              kind: "line",
              unit: "money",
              x: ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13", "D14"],
              series: [
                {
                  label: "Spend",
                  values: [2000, 2000, 2000, 2000, 2000, 2000, 2000, 2400, 2400, 2400, 2400, 2400, 2400, 2400],
                },
                {
                  label: "Revenue",
                  values: [5400, 7800, 4200, 6900, 8100, 9600, 6300, 7200, 9900, 6600, 8700, 10200, 7500, 9300],
                },
              ],
            },
            caption:
              "Revenue swings day to day while spend is steady. Over 14 days, ₹30,800 of spend brought ₹1,07,700 of revenue: a ROAS of about 3.5x.",
          },
          { type: "h", text: "Leads" },
          {
            type: "p",
            text: "For leads, a low cost per lead is only half the story. Instant forms on Meta can bring in very cheap leads that never pick up the phone. Track how many leads became **qualified** (they are real, reachable and interested) and how many became customers, then judge by cost per qualified lead.",
          },
          {
            type: "callout",
            tone: "tip",
            text: "Keep a simple sheet or CRM with each lead's source and outcome. Even a column of Yes/No for qualified will tell you which campaign really works.",
          },
          { type: "h", text: "Awareness" },
          {
            type: "p",
            text: "Awareness campaigns are not meant to sell directly, so do not judge them by ROAS. Look at how many of the right people you reached (reach), how cheaply (CPM), and whether frequency stays sensible, often around 1 to 3 per week for most small brands. Over time, look for more branded searches and more direct visits to your site.",
          },
          {
            type: "quiz",
            question: "Campaign A has a ₹6 CPC and 1.5x ROAS. Campaign B has a ₹22 CPC and 4x ROAS. Your break-even ROAS is 2.2x. Which is better for sales?",
            options: [
              "Campaign A, because its clicks are cheaper",
              "Campaign B, because it beats your break-even ROAS",
              "They are equal",
              "You cannot tell without CTR",
            ],
            answer: 1,
            explain:
              "For sales, the main metric is ROAS or CPA against your target. A is below break-even and losing money; B is profitable despite pricier clicks.",
          },
        ],
      },
      {
        id: "noise-and-periods",
        title: "Comparing periods without over-reacting",
        minutes: 6,
        summary:
          "Daily results bounce around by chance, so compare like with like and wait for enough data before changing anything.",
        blocks: [
          {
            type: "p",
            text: "Monday: 8 sales. Tuesday: 2 sales. Panic? Not yet. Small numbers bounce around a lot purely by chance. This random bounce is called **statistical noise**, and reacting to it is one of the most expensive habits in advertising.",
          },
          {
            type: "chart",
            title: "Daily cost per purchase for one unchanged campaign",
            chart: {
              kind: "line",
              unit: "money",
              x: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
              series: [
                {
                  label: "Daily CPA",
                  values: [310, 820, 450, 290, 540, 380, 610, 350, 470, 700, 330, 420, 390, 520],
                },
                {
                  label: "7-day average CPA",
                  values: [480, 480, 480, 480, 480, 480, 480, 470, 450, 485, 490, 470, 470, 455],
                },
              ],
            },
            caption:
              "Nothing changed in this campaign, yet the daily CPA ranged from ₹290 to ₹820. The 7-day average barely moved.",
          },
          { type: "h", text: "Why small numbers lie" },
          {
            type: "p",
            text: "If a campaign averages 5 sales a day, some days will have 2 and some will have 9, even though nothing changed. When you divide spend by a small number like 2 or 9, CPA swings wildly. The fewer conversions you have, the less any single day means.",
          },
          {
            type: "list",
            items: [
              "Judge on at least **7 days**, so every weekday is included once.",
              "Wait for roughly **20 to 50 conversions** before deciding a campaign or ad is a winner or loser.",
              "For a new ad with no conversions yet, wait until it has spent at least **2 to 3 times your target CPA** before pausing it.",
            ],
          },
          {
            type: "callout",
            tone: "warn",
            title: "Changes have a cost too",
            text: "Every big edit (new budget, new audience, new creative) can make the platform re-learn who to show your ads to. Editing every day because of noise keeps campaigns in a permanent state of relearning and usually makes results worse.",
          },
          { type: "h", text: "Compare like with like" },
          {
            type: "p",
            text: "When you compare two periods, make sure they are fair. A good default is **last 7 days vs the 7 days before**, or last 28 days vs the previous 28.",
          },
          {
            type: "table",
            columns: ["Unfair comparison", "Why it misleads", "Fairer version"],
            rows: [
              ["Saturday vs Monday", "Weekdays behave differently", "This week vs last week"],
              ["Diwali week vs a normal week", "Festive demand and prices", "Same week last year, or skip it"],
              ["Today (half a day) vs yesterday", "Today is not finished and data is still arriving", "Wait until tomorrow"],
              ["Salary week vs month-end", "Spending habits change across the month", "Full months, or 28-day windows"],
            ],
          },
          {
            type: "callout",
            tone: "info",
            title: "Recent data is incomplete",
            text: "Platforms keep adding conversions to past days for a while, because some people buy days after clicking. The last 1 to 3 days almost always look worse than they will end up. Leave them out of decisions.",
          },
          {
            type: "steps",
            steps: [
              { title: "Pick your main metric", text: "ROAS, CPA or cost per qualified lead." },
              { title: "Use a full window", text: "At least 7 complete days, ending yesterday." },
              { title: "Check the volume", text: "Are there enough conversions to trust the number?" },
              { title: "Compare fairly", text: "Against the previous equal-length period, with no festival skew." },
              { title: "Change one thing", text: "Then give it another week before judging." },
            ],
          },
          {
            type: "quiz",
            question: "A campaign that usually gets 4 sales a day had 1 sale yesterday. Nothing else changed. What should you do?",
            options: [
              "Pause it immediately",
              "Double the budget to make up for it",
              "Keep it running and judge on the last 7 days",
              "Replace every ad",
            ],
            answer: 2,
            explain:
              "One low day on small numbers is usually noise. Judge on a full week with enough conversions before making changes.",
          },
        ],
      },
      {
        id: "attribution",
        title: "Attribution: why the numbers never match",
        minutes: 7,
        summary:
          "Meta, Google and your bank all count sales differently, so learn how attribution windows work and how to adjust for over-counting.",
        blocks: [
          {
            type: "p",
            text: "You check Meta: 40 purchases. Google says 35. Your Shopify or bank shows 50 orders in total. Add Meta and Google and you get 75, more than you actually sold. Nobody is lying. They are just using different rules to decide who gets credit. That set of rules is called **attribution**.",
          },
          { type: "h", text: "Attribution windows" },
          {
            type: "p",
            text: "An **attribution window** is how long after someone interacts with an ad a sale still counts for that ad. There are two kinds of interaction.",
          },
          {
            type: "terms",
            terms: [
              {
                term: "Click-through attribution",
                def: "The person clicked your ad, then bought within the window. Meta's default is 7 days after the click.",
              },
              {
                term: "View-through attribution",
                def: "The person saw your ad without clicking, then bought within the window. Meta's default includes 1 day after viewing.",
              },
              {
                term: "Attribution model",
                def: "How credit is split when a person touched several ads. Google Ads uses data-driven attribution by default, sharing credit across the clicks along the way.",
              },
            ],
          },
          {
            type: "diagram",
            id: "attribution",
            caption:
              "A sale is credited to an ad only if it falls inside the click or view window after the ad was clicked or seen.",
          },
          { type: "h", text: "Why platforms over-count" },
          {
            type: "list",
            items: [
              "**Both take credit.** A customer clicks a Google search ad on Monday and a Meta ad on Wednesday, then buys. Both platforms may count the full sale.",
              "**View-throughs are generous.** Someone scrolls past your Instagram ad, then buys from you the next day anyway. Meta may count it, even if the ad played no real role.",
              "**Modelled conversions.** When people block tracking, platforms estimate some conversions. These are educated guesses, not confirmed sales.",
              "**Different days.** Platforms usually credit the sale to the day of the ad click or view, while your store records the day of the order.",
            ],
          },
          { type: "h", text: "The Indian twist: COD and returns" },
          {
            type: "p",
            text: "Ad platforms count a purchase the moment the order is placed. They do not know if a cash-on-delivery parcel was refused at the door, or if a product was returned a week later. In categories like fashion, RTO and return rates of 20% to 30% are common.",
          },
          {
            type: "table",
            columns: ["Step", "Orders", "Revenue"],
            rows: [
              ["Purchases reported by Meta", "100", "₹1,50,000"],
              ["After 25% COD refused (RTO)", "75", "₹1,12,500"],
              ["After 8% of delivered orders returned", "69", "₹1,03,500"],
              ["Real revenue vs reported", "69%", "Platform ROAS 3x becomes about 2.1x"],
            ],
          },
          {
            type: "callout",
            tone: "warn",
            title: "A 3x ROAS in the dashboard might be break-even in real life",
            text: "Always compare platform ROAS with real, delivered revenue from your store or bank. The ratio between them is your adjustment factor.",
          },
          { type: "h", text: "What to do about it" },
          {
            type: "steps",
            steps: [
              {
                title: "Pick one source of truth",
                text: "Your store, bank or CRM is the real total. Use it to check whether overall ad spend is paying off.",
              },
              {
                title: "Measure blended results",
                text: "Blended ROAS = total real revenue ÷ total ad spend across all platforms. It cannot double-count.",
              },
              {
                title: "Use platform numbers for comparisons inside the platform",
                text: "They are still good for telling which campaign or ad works better than another, because the same rules apply to all of them.",
              },
              {
                title: "Keep windows consistent",
                text: "Do not change attribution settings mid-way, or your before and after numbers will not match.",
              },
            ],
          },
          {
            type: "callout",
            tone: "tip",
            text: "Sending your real, delivered orders back to the platforms (for example through Meta's Conversions API or Google's offline conversion imports) helps them optimise for customers who actually pay.",
          },
          {
            type: "quiz",
            question: "Meta reports 60 sales and Google reports 45 sales this week. Your store shows 80 orders in total. What is the most likely explanation?",
            options: [
              "Your store is missing orders",
              "Some sales were counted by both platforms, and view-through credit adds more",
              "One of the platforms is broken",
              "The extra sales are from returns",
            ],
            answer: 1,
            explain:
              "Each platform credits any sale inside its own window, so the same customer can be counted by both. Your store total is the real number.",
          },
        ],
      },
      {
        id: "spotting-problems",
        title: "Spotting problems: waste, fatigue and timing",
        minutes: 7,
        summary:
          "Learn the warning signs of wasted spend, tired creatives and rising costs, and how time-of-day patterns reveal when your ads work best.",
        blocks: [
          {
            type: "p",
            text: "Most ad problems show up in the numbers before they hurt your bank balance. This lesson covers four common patterns and what each one usually means.",
          },
          { type: "h", text: "1. Wasted spend" },
          {
            type: "p",
            text: "**Wasted spend** is money that goes to ads, keywords, audiences or placements that bring no results. Small leaks add up: ₹300 a day on a useless keyword is ₹9,000 a month.",
          },
          {
            type: "list",
            items: [
              "Ads or ad sets that have spent 2 to 3 times your target CPA with zero conversions.",
              "Google search terms unrelated to what you sell (for example free, jobs, or DIY searches for a paid product).",
              "Placements, locations or age groups that take a big share of spend but few conversions.",
            ],
          },
          { type: "h", text: "2. Creative fatigue" },
          {
            type: "p",
            text: "**Creative fatigue** happens when the same people see the same ad too often. They stop noticing it, stop clicking, and costs rise. The tell-tale sign is **frequency going up while CTR goes down**.",
          },
          {
            type: "chart",
            title: "Frequency climbing week by week",
            chart: {
              kind: "line",
              unit: "ratio",
              x: ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"],
              series: [{ label: "Frequency", values: [1.4, 1.9, 2.5, 3.2, 3.9, 4.6] }],
            },
          },
          {
            type: "chart",
            title: "CTR falling over the same weeks",
            chart: {
              kind: "line",
              unit: "percent",
              x: ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"],
              series: [{ label: "CTR", values: [0.018, 0.017, 0.014, 0.011, 0.009, 0.007] }],
            },
            caption:
              "As the same audience sees the ad more often, fewer of them click. By week 6 the ad is clearly worn out.",
          },
          {
            type: "callout",
            tone: "tip",
            title: "The fix",
            text: "Refresh the creative: a new image, video, hook or offer. Keep a few new ads ready so you can rotate them in before fatigue sets in. Widening a small audience also helps.",
          },
          { type: "h", text: "3. Rising CPM" },
          {
            type: "p",
            text: "If CPM rises but CTR and conversion rate are steady, the auction is simply more crowded: think festive season, sale days or an election period. If CPM rises **and** CTR falls, the platform may be rating your ad as less relevant, which again points to fatigue or a weak creative.",
          },
          {
            type: "table",
            columns: ["What you see", "Likely cause", "What to try"],
            rows: [
              ["Frequency up, CTR down", "Creative fatigue", "New creatives, broader audience"],
              ["CPM up, CTR steady", "More competition", "Wait it out or accept it if still profitable"],
              ["CTR fine, conversion rate down", "Landing page, price or stock problem", "Check the site, offer and checkout"],
              ["Spend high, zero conversions", "Wasted spend or broken tracking", "Check tracking first, then pause"],
            ],
          },
          {
            type: "p",
            text: "When you do find a winner and want to spend more, raise the budget gradually. Big jumps often push costs up as the platform reaches for less likely buyers.",
          },
          {
            type: "diagram",
            id: "scaling",
            caption:
              "Raising budget in about 20% steps every few days is usually safer than one big jump.",
          },
          { type: "h", text: "4. Time-of-day patterns" },
          {
            type: "p",
            text: "People do not buy evenly through the day. Many Indian consumer businesses see more orders in the evening after work, while B2B leads often come during office hours. Looking at conversions by hour can reveal when your ads work best.",
          },
          {
            type: "chart",
            title: "Purchases by hour of day over 30 days (home decor store)",
            chart: {
              kind: "column",
              unit: "number",
              columns: [
                { label: "0", value: 9 },
                { label: "1", value: 5 },
                { label: "2", value: 2 },
                { label: "3", value: 1 },
                { label: "4", value: 1 },
                { label: "5", value: 2 },
                { label: "6", value: 4 },
                { label: "7", value: 8 },
                { label: "8", value: 12 },
                { label: "9", value: 15 },
                { label: "10", value: 18 },
                { label: "11", value: 20 },
                { label: "12", value: 22 },
                { label: "13", value: 24 },
                { label: "14", value: 19 },
                { label: "15", value: 17 },
                { label: "16", value: 18 },
                { label: "17", value: 21 },
                { label: "18", value: 26 },
                { label: "19", value: 31 },
                { label: "20", value: 38 },
                { label: "21", value: 42 },
                { label: "22", value: 33 },
                { label: "23", value: 18 },
              ],
            },
            caption:
              "Orders peak between 8 pm and 11 pm, with a smaller lunchtime bump. Very few happen between 2 am and 5 am.",
          },
          {
            type: "p",
            text: "**Dayparting** means adjusting your ads by time of day or day of week: for example, lowering bids or pausing ads in hours that rarely convert, and focusing spend on your strong hours. Google Ads supports ad schedules directly; on Meta, it usually needs a lifetime budget or rules.",
          },
          {
            type: "callout",
            tone: "warn",
            title: "Do not cut hours too early",
            text: "Hourly data is even noisier than daily data. Use at least 2 to 4 weeks, and remember someone may see your ad at 2 pm and buy at 9 pm. Start by trimming only the clearly weakest hours.",
          },
          {
            type: "quiz",
            question: "Over four weeks, an ad's frequency rose from 1.5 to 4.2 while its CTR fell from 1.6% to 0.7%. What is the most likely problem?",
            options: [
              "The budget is too low",
              "Creative fatigue: the same people have seen the ad too many times",
              "Attribution window is too short",
              "The auction has less competition",
            ],
            answer: 1,
            explain:
              "Frequency rising while CTR falls is the classic sign of creative fatigue. Refresh the creative or widen the audience.",
          },
        ],
      },
    ],
  },
];

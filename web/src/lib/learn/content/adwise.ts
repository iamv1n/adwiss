import type { Module } from "../types";

export const ADWISE_MODULES: Module[] = [
  {
    id: "adwise-start",
    track: "adwise",
    title: "Getting started with Adwise",
    summary: "Connect your ad accounts, keep data flowing, and use the Dashboard, Campaigns and Analytics pages to see what your money is doing.",
    lessons: [
      {
        id: "the-adwise-loop",
        title: "The Adwise loop",
        minutes: 5,
        summary: "Adwise works as a loop: connect, sync, analyze, decide, act and learn, then repeat.",
        blocks: [
          {
            type: "p",
            text: "Adwise is not a place you visit once. It works best as a habit: your ad data comes in, you look at what it says, you make a change, and then you check whether the change helped. We call this the **Adwise loop**.",
          },
          { type: "diagram", id: "adwise-loop", caption: "Connect → sync → analyze → decide → act → learn, then round again." },
          { type: "h", text: "The six steps" },
          {
            type: "terms",
            terms: [
              { term: "Connect", def: "Link your Meta and Google Ads accounts on the **Integrations** page. You do this once." },
              { term: "Sync", def: "Adwise pulls campaigns, ad sets, ads and their numbers from the platforms. You choose which ad accounts to sync." },
              { term: "Analyze", def: "The **Dashboard** and **Analytics** pages show spend, conversions, revenue and ROAS, compare periods and flag wasted spend." },
              { term: "Decide", def: "Pick what to change: pause a campaign that burns money, raise the budget of a winner, turn ads off at night." },
              { term: "Act", def: "Make the change by hand on **Campaigns**, or let **Dayparting** schedules and **Automations** rules do it for you." },
              { term: "Learn", def: "Every automatic change is written to the **Actions** log. The **Leads** page tells you which ads brought real buyers." },
            ],
          },
          {
            type: "p",
            text: "Each step feeds the next. A rule you create today (act) shows up in the Actions log tomorrow (learn), and the new numbers after the next sync tell you whether to keep it.",
          },
          { type: "h", text: "Where each step lives" },
          {
            type: "table",
            columns: ["Step", "Page in the sidebar", "What you do there"],
            rows: [
              ["Connect", "Integrations", "Connect Meta Ads and Google Ads, turn on sync per account"],
              ["Sync", "Integrations", "Sync now, watch the progress bar, reconnect when access expires"],
              ["Analyze", "Dashboard, Analytics", "Key metrics, spend vs revenue, wasted spend, hour of day"],
              ["Decide + act", "Campaigns, Dayparting, Automations", "Edit status and budgets, schedule hours, build rules"],
              ["Learn", "Actions, Leads", "See every change, revert it, track leads to deals"],
            ],
          },
          {
            type: "callout",
            tone: "tip",
            title: "A simple weekly rhythm",
            text: "Monday: open Analytics for **Last 7 days** and check wasted spend. Make one or two changes. Next Monday: see if they helped. Small, steady changes beat big random ones.",
          },
          {
            type: "p",
            text: "The rest of this module walks through the first half of the loop: connecting, syncing and reading your numbers. The next module covers acting and learning with automation and leads.",
          },
          {
            type: "quiz",
            question: "You created an automation rule last week. Where do you check what it actually did?",
            options: ["The Integrations page", "The Actions log", "The Dashboard setup checklist", "Nowhere, rules don't keep a record"],
            answer: 1,
            explain: "Every change from a rule or schedule, including dry runs and reverts, is written to the Actions log. That is the learn step of the loop.",
          },
        ],
      },
      {
        id: "connect-and-sync",
        title: "Connecting and syncing your accounts",
        minutes: 6,
        summary: "Connect Meta and Google on Integrations, turn on sync for the right accounts, and keep the connection healthy.",
        blocks: [
          {
            type: "p",
            text: "Adwise can only help with data it can see. The **Integrations** page is where you connect your ad platforms and then choose which ad accounts to sync.",
          },
          {
            type: "callout",
            tone: "info",
            title: "Who can connect",
            text: "Only owners and admins can connect ad platforms. If you are a member, ask an admin or owner of your organization to do it.",
          },
          { type: "h", text: "Connect a platform" },
          {
            type: "steps",
            steps: [
              { title: "Open Integrations", text: "Click **Integrations** in the sidebar. You will see a card for **Meta Ads** (Facebook and Instagram ad accounts) and one for **Google Ads**." },
              { title: "Click Connect", text: "You are sent to Meta or Google to sign in. Approve every permission Adwise asks for. If you skip one, Adwise will ask you to connect again and approve all of them." },
              { title: "Come back to Adwise", text: "The card now shows **Connected** and lists your ad accounts. If an account is missing, use **Refresh accounts**." },
              { title: "Turn on sync per account", text: "Each account has its own sync switch. Nothing is pulled until you switch it on; the row says **Syncing starts once enabled.** Turn on only the accounts you actually run ads from." },
            ],
          },
          { type: "h", text: "Sync now and the live progress bar" },
          {
            type: "p",
            text: "Adwise syncs on its own in the background, so your numbers stay fresh. When you want the latest data right away, for example after changing campaigns in Meta Ads Manager, click **Sync now**.",
          },
          {
            type: "p",
            text: "A **Sync progress** bar appears and updates live while the sync runs. It moves from **Sync queued** to running, where Adwise discovers your accounts and pulls campaigns and their reports, and ends at **Sync complete** or **Sync failed**. You can keep working on other pages meanwhile; the sync indicator in the app shell shows when it finishes.",
          },
          {
            type: "callout",
            tone: "tip",
            text: "If you see **A sync is already queued**, just wait. Clicking again won't make it faster. If it says **Turn on sync for at least one account first**, switch on an account's sync.",
          },
          { type: "h", text: "Connection states you may see" },
          {
            type: "table",
            columns: ["What the card says", "What it means", "What to do"],
            rows: [
              ["Connected / Synced", "All good", "Nothing"],
              ["Never synced / Waiting for first sync", "Connected, no data yet", "Turn on sync, then Sync now"],
              ["Needs reconnection / Access expired", "Meta or Google stopped accepting Adwise's access", "Click Reconnect and approve all permissions"],
              ["Last sync failed", "The last attempt hit an error", "Try Sync now; reconnect if it keeps failing"],
              ["Disconnected", "Someone disconnected it", "Connect again; synced data is kept"],
            ],
          },
          {
            type: "p",
            text: "Access can expire when a password changes, when the person who connected loses access to the ad account, or simply after time passes. Reconnecting takes a minute and your older synced data stays in place.",
          },
          {
            type: "callout",
            tone: "warn",
            text: "Disconnecting stops new data and stops any rules or schedules from changing that platform. Data that's already synced is kept.",
          },
          {
            type: "quiz",
            question: "You connected Meta Ads but the Dashboard is still empty. What is the most likely fix?",
            options: [
              "Disconnect and connect again",
              "Turn on sync for your ad account, then click Sync now",
              "Create a new campaign",
              "Wait a week",
            ],
            answer: 1,
            explain: "Connecting only links the platform. Adwise pulls data only for accounts whose sync switch is on. Turn it on and use Sync now to start straight away.",
          },
        ],
      },
      {
        id: "roles-dashboard-campaigns",
        title: "Roles, Dashboard and Campaigns",
        minutes: 6,
        summary: "Know who can change what, read the Dashboard, and edit or create campaigns from the Campaigns page.",
        blocks: [
          { type: "h", text: "Roles: owner, admin, member" },
          {
            type: "p",
            text: "Everyone in your organization has a role. You invite teammates from **Settings → Members**, and you can change a role or remove someone later.",
          },
          {
            type: "table",
            columns: ["Role", "Can see data", "Can change campaigns, connect platforms"],
            rows: [
              ["Owner", "Yes", "Yes"],
              ["Admin", "Yes", "Yes"],
              ["Member", "Yes", "No, read-only tables"],
            ],
          },
          {
            type: "callout",
            tone: "tip",
            text: "Give your agency or junior staff the **member** role while they learn. They see everything but can't change budgets. Buttons they can't use explain why: \"Only admins and owners can change campaigns.\"",
          },
          { type: "h", text: "The Dashboard" },
          {
            type: "p",
            text: "The Dashboard is your home screen. While you set up, it shows **Setup progress**: connect Meta or Google, create your first dayparting schedule, invite your team. Once data arrives it shows **Key metrics**, a **Spend vs revenue** chart and a performance by hour of day view. Glance at it daily; dig deeper on Analytics.",
          },
          { type: "h", text: "The Campaigns page" },
          {
            type: "p",
            text: "Campaigns lists everything you run, with tabs for campaigns, ad sets (or ad groups on Google) and ads, plus spend, conversions and ROAS for the chosen date range. Admins and owners can change things right from the table.",
          },
          {
            type: "steps",
            steps: [
              { title: "Pause or activate", text: "Use the row controls to pause a campaign that's losing money or switch one back on." },
              { title: "Change a budget", text: "Open the edit sheet, type the new daily budget (say from ₹1,000 to ₹1,200) and save. The change goes straight to Meta or Google." },
              { title: "Check the result", text: "The row updates, and a toast confirms the change or explains the error from the platform." },
            ],
          },
          { type: "h", text: "Meta vs Google: what you can change" },
          {
            type: "table",
            columns: ["Change", "Meta", "Google Ads"],
            rows: [
              ["Pause / activate", "Campaigns, ad sets, ads", "Campaigns only"],
              ["Daily budget", "Yes", "Campaigns only"],
              ["Name, schedule, spend cap, bid, archive", "Yes", "No"],
              ["Create new campaigns", "Yes", "No"],
            ],
          },
          {
            type: "p",
            text: "For Google Ads, Adwise can change only campaign status and daily budget. Everything else you still do inside Google Ads.",
          },
          { type: "h", text: "Creating a Meta campaign" },
          {
            type: "p",
            text: "On Meta you can build a full campaign in Adwise: choose the ad account, name the campaign, pick the objective, set a budget (a campaign budget that Meta spreads across ad sets, or one per ad set), choose countries, age and gender, then add the creative with a Facebook Page, image, headline and call to action. For lead ads you also choose the Facebook Page that collects the leads.",
          },
          {
            type: "callout",
            tone: "info",
            title: "Created paused",
            text: "New campaigns are created **paused**. Nothing spends until you turn it on, so you can check it in Meta Ads Manager first.",
          },
          {
            type: "quiz",
            question: "Which of these can you do for a Google Ads campaign from Adwise?",
            options: ["Rename it", "Change its daily budget", "Create a new one", "Change its bid strategy"],
            answer: 1,
            explain: "For Google Ads, Adwise supports only campaign status (pause/activate) and campaign daily budget. The rest is done in Google Ads.",
          },
        ],
      },
      {
        id: "analytics-page",
        title: "Reading the Analytics page",
        minutes: 6,
        summary: "Compare periods, find wasted spend and spot your best hours on the Analytics page.",
        blocks: [
          {
            type: "p",
            text: "Analytics lets you compare periods and break performance down by hour, device, geography and placement. Three parts matter most for beginners.",
          },
          { type: "h", text: "1. Period comparison" },
          {
            type: "p",
            text: "Choose a date range such as **Last 7 days**. Every key number shows a **vs prev.** change against the period just before it. If spend went up 20% but conversions went up only 5%, each result got more expensive.",
          },
          {
            type: "callout",
            tone: "tip",
            text: "If your accounts use several currencies, pick one in the currency control to see money metrics. Adwise won't add rupees and dollars together.",
          },
          { type: "h", text: "2. Wasted spend" },
          {
            type: "p",
            text: "The **Wasted spend** card answers \"What's spending without converting\". It lists campaigns that had no conversions, or a ROAS below 1×, in the range, sorted by the money that didn't pay back, and shows the total and its share of all spend.",
          },
          {
            type: "p",
            text: "Example: you spent ₹60,000 last month and the card shows ₹9,500 wasted, about 16% of spend. That's your to-do list: open each campaign, fix or pause it, or let a rule do it next time.",
          },
          {
            type: "callout",
            tone: "warn",
            text: "A new campaign with 2 days of data can look wasted just because it hasn't had time. Look at how long it has run and how much it spent before you pause it.",
          },
          { type: "h", text: "3. Hour of day" },
          {
            type: "p",
            text: "The hourly panel shows spend or conversions for each hour of the day. Most businesses find some hours bring buyers and others only spend.",
          },
          {
            type: "chart",
            title: "Conversions by hour, last 30 days (a Pune coaching institute)",
            chart: {
              kind: "column",
              unit: "number",
              columns: [
                { label: "0", value: 2 }, { label: "1", value: 1 }, { label: "2", value: 0 }, { label: "3", value: 0 },
                { label: "4", value: 0 }, { label: "5", value: 1 }, { label: "6", value: 3 }, { label: "7", value: 6 },
                { label: "8", value: 9 }, { label: "9", value: 12 }, { label: "10", value: 15 }, { label: "11", value: 16 },
                { label: "12", value: 14 }, { label: "13", value: 13 }, { label: "14", value: 12 }, { label: "15", value: 13 },
                { label: "16", value: 15 }, { label: "17", value: 17 }, { label: "18", value: 20 }, { label: "19", value: 22 },
                { label: "20", value: 21 }, { label: "21", value: 16 }, { label: "22", value: 9 }, { label: "23", value: 4 },
              ],
            },
            caption: "Almost nothing converts between midnight and 6am, but ads still spend then. That is the case for dayparting.",
          },
          {
            type: "p",
            text: "If the night hours still take 10% of your budget, turning ads off or lowering budgets then saves money for the evening peak. The next module shows how with Dayparting.",
          },
          {
            type: "quiz",
            question: "The Wasted spend card lists a campaign. What does that mean?",
            options: [
              "It was paused by Meta",
              "It had no conversions or a ROAS below 1× in the chosen range",
              "It has the highest CTR",
              "It's missing a pixel",
            ],
            answer: 1,
            explain: "Wasted spend flags campaigns with spend but no conversions, or a ROAS under 1×, ranked by the spend that didn't pay back.",
          },
        ],
      },
    ],
  },
  {
    id: "adwise-automate",
    track: "adwise",
    title: "Automate and grow with Adwise",
    summary: "Use dayparting, automation rules, the Actions log and Leads to act faster and see which ads really make you money.",
    lessons: [
      {
        id: "dayparting-schedules",
        title: "Dayparting schedules",
        minutes: 6,
        summary: "Paint a weekly grid to switch ads off or change budgets by hour, starting in dry run.",
        blocks: [
          {
            type: "p",
            text: "Dayparting means running your ads harder at good hours and softer, or not at all, at bad ones. In Adwise you do this on the **Dayparting** page with a weekly grid.",
          },
          { type: "h", text: "Build a schedule" },
          {
            type: "steps",
            steps: [
              { title: "Start a schedule", text: "Click to create a **New dayparting schedule**, or begin from a preset like **Business hours**, **Pause overnight** or **Evenings + weekends**." },
              { title: "Pick targets", text: "Choose the **Target level** (campaigns, or ad sets when budgets live on the ad sets in Meta) and the campaigns it applies to. Set the **Time zone**, for example Asia/Kolkata." },
              { title: "Paint the grid", text: "Choose a **Brush** and drag across the 7-day × 24-hour grid. Click a day or hour label to paint a whole row or column." },
              { title: "Preview", text: "Use **Preview now + 24 h** to see exactly what would change in the next day." },
              { title: "Save", text: "Click **Save & enable dry run**. Later, when the log looks right, switch to **Go live**." },
            ],
          },
          { type: "h", text: "The brushes" },
          {
            type: "table",
            columns: ["Brush", "What happens in that hour"],
            rows: [
              ["Off", "Pause"],
              ["On", "Normal budget"],
              ["50%", "Half budget"],
              ["75%", "Budget −25%"],
              ["125%", "Budget +25%"],
              ["150%", "Budget +50%"],
              ["200%", "Double budget"],
            ],
          },
          {
            type: "p",
            text: "Budget multipliers work on your normal budget. If a campaign runs at ₹2,000 a day and you paint 7–10pm at 150%, it runs at ₹3,000 during those hours and goes back to ₹2,000 after.",
          },
          {
            type: "callout",
            tone: "tip",
            title: "Use your own data",
            text: "The page shows a performance heatmap from your synced hours. Paint off hours where the heatmap is cold, and push budget where it's hot. Don't guess.",
          },
          {
            type: "callout",
            tone: "info",
            title: "Schedules win over rules",
            text: "If a dayparting schedule and an automation rule both want to change the same campaign in the same hour, the schedule wins. The rule's change is recorded as skipped in the Actions log, with the reason.",
          },
          {
            type: "callout",
            tone: "warn",
            text: "Pausing and unpausing often can hurt delivery on Meta. Keep off periods as long, simple blocks (like 23:00–06:00) rather than many one-hour gaps.",
          },
          {
            type: "quiz",
            question: "A campaign's budget is ₹1,500/day. You paint 8pm with the 200% brush. What happens at 8pm?",
            options: ["It pauses", "It runs at ₹3,000/day budget", "It runs at ₹750/day budget", "Nothing, brushes only affect ad sets"],
            answer: 1,
            explain: "200% means double budget for that hour, so ₹1,500 becomes ₹3,000. After that hour it returns to whatever the grid says next.",
          },
        ],
      },
      {
        id: "automation-rules",
        title: "Automation rules and dry run",
        minutes: 7,
        summary: "Build rules from templates using your target CPA and ROAS, and run them in dry run before going live.",
        blocks: [
          {
            type: "p",
            text: "An automation rule watches your campaigns and acts when numbers cross a line you set. It's like a teammate who checks the account every hour and never forgets.",
          },
          { type: "h", text: "What a rule is made of" },
          {
            type: "terms",
            terms: [
              { term: "Conditions", def: "One or more checks on a metric, such as spend ≥ ₹1,500 and conversions = 0. All must be true." },
              { term: "Lookback", def: "How many days of data each check looks at, for example the last 3 or 7 days." },
              { term: "Action", def: "What to do: pause, activate, raise or lower the budget by a percent, or only notify." },
              { term: "Cooldown per campaign", def: "How long Adwise waits before the same rule can touch the same campaign again. Stops a budget from being raised every hour." },
              { term: "Max changes per run", def: "A safety limit on how many campaigns one run can change." },
              { term: "Scope", def: "Which campaigns or ad sets it applies to, or the whole organization." },
            ],
          },
          { type: "h", text: "New rule from a template" },
          {
            type: "steps",
            steps: [
              { title: "Click New rule", text: "On **Automations**, click **New rule**. Pick a **Blank rule** or start from a template." },
              { title: "Set your targets", text: "Enter **Target CPA (₹)** and **Target ROAS (×)**. Templates fill their numbers from these. With a target CPA of ₹500, \"Spend with no results\" pauses at ₹1,500 spent with no conversions." },
              { title: "Pick a template", text: "Templates are grouped as **Stop wasting money**, **Put more behind what works**, **Keep ads fresh** and **Safety nets**." },
              { title: "Review and preview", text: "Adjust conditions and scope, then run the preview to see which campaigns would match today." },
              { title: "Save in dry run", text: "Save it in **Dry run**. It is checked on schedule and dry runs are logged in Actions." },
            ],
          },
          {
            type: "table",
            columns: ["Template", "What it does (target CPA ₹500, ROAS 2×)"],
            rows: [
              ["Spend with no results", "Pause after ₹1,500 in 3 days with no conversions"],
              ["CPA far over target", "Pause when CPA is above ₹1,000 over 7 days (after ₹1,500 spent)"],
              ["Losing money", "Cut budget 30% when ROAS is below 1× over 7 days (after ₹5,000 spent)"],
              ["Clicks but no sales", "Notify when 150+ clicks in 7 days bring no conversions"],
              ["Scale winners +20%", "Raise budget 20% when ROAS ≥ 3× with 10+ conversions over 7 days"],
              ["Cheap conversions +15%", "Raise budget 15% when CPA is under ₹350 with 5+ conversions"],
              ["Revive paused winners", "Activate paused campaigns with ROAS 2×+ and 5+ conversions over 14 days"],
              ["Audience fatigue", "Notify when frequency is 3.5+ and CTR is under 0.8%"],
              ["Daily spend cap", "Pause any campaign that spends ₹10,000 in a day"],
              ["Night-time pause", "Opens a dayparting schedule: off 23:00–06:00"],
            ],
          },
          { type: "diagram", id: "scaling", caption: "Scale winners raises budgets 20% at a time with a 3-day cooldown instead of one big jump." },
          { type: "h", text: "Dry run vs live" },
          {
            type: "p",
            text: "**Dry run** logs what the rule would change. Nothing is sent to Meta or Google. **Live** means pauses, activations and budgets really change on the ad platforms. Every new rule starts in dry run.",
          },
          {
            type: "callout",
            tone: "tip",
            title: "Why start in dry run",
            text: "Leave a rule in dry run for 3–7 days and read its entries in Actions. If it would have paused your best campaign, the threshold is wrong. Fix it, then go live. A mistake in dry run costs nothing.",
          },
          {
            type: "chart",
            title: "Average daily wasted spend on a ₹60,000/month account, with and without \"Spend with no results\"",
            chart: {
              kind: "line",
              unit: "money",
              x: ["Wk 1", "Wk 2", "Wk 3", "Wk 4"],
              series: [
                { label: "Spend on non-converting campaigns, no rule", values: [2400, 2600, 2500, 2700] },
                { label: "Same, with rule live", values: [2400, 900, 700, 600] },
              ],
            },
            caption: "Once the rule goes live in week 2, money stops leaking into campaigns that never convert.",
          },
          {
            type: "quiz",
            question: "Why set a cooldown on a \"Scale winners +20%\" rule?",
            options: [
              "So it only runs at night",
              "So the same campaign isn't raised again and again before new results come in",
              "So it runs in dry run",
              "Cooldown is only for notify actions",
            ],
            answer: 1,
            explain: "Without a cooldown, the rule could raise a budget every hour. The template uses a 3-day cooldown so each 20% step has time to show results.",
          },
        ],
      },
      {
        id: "actions-log",
        title: "The Actions log and reverting",
        minutes: 4,
        summary: "Read every change Adwise made or would have made, and undo a change with Revert.",
        blocks: [
          {
            type: "p",
            text: "The **Actions** page is the record of everything your schedules and rules did. Each row shows the time slot, the source (a rule, a schedule or a revert), the campaign or ad set, the change with before and after values, and the outcome.",
          },
          {
            type: "table",
            columns: ["Outcome", "Meaning"],
            rows: [
              ["Dry run", "What would have happened. Nothing was sent."],
              ["Executed", "The change was made on Meta or Google."],
              ["Skipped", "Not applied, with a reason, e.g. already in that state, or a schedule owns that hour."],
              ["Failed", "The platform returned an error, shown as the provider error."],
              ["Reverted", "Someone undid this change."],
            ],
          },
          { type: "h", text: "Reverting a change" },
          {
            type: "steps",
            steps: [
              { title: "Find the row", text: "Filter by source or status to find the change, for example a budget raised from ₹2,000 to ₹2,400." },
              { title: "Click Revert", text: "Adwise sets the value back to the before value (₹2,000) and logs the revert as its own action." },
              { title: "Fix the cause", text: "If a rule made a bad change, edit or disable the rule too, or it may do it again after the cooldown." },
            ],
          },
          {
            type: "callout",
            tone: "info",
            text: "Revert works for executed pauses, activations and daily budget changes on campaigns and ad sets. Dry runs, failures and notifications have nothing to undo.",
          },
          {
            type: "p",
            text: "Make a habit of scanning Actions each morning for a week after you go live with a new rule. It's the learn step of the loop.",
          },
          {
            type: "quiz",
            question: "A row in Actions shows \"Skipped\" because a dayparting schedule owns that hour. What happened?",
            options: [
              "The rule crashed",
              "The schedule took precedence and the rule's change wasn't applied",
              "Meta rejected the change",
              "The change was reverted",
            ],
            answer: 1,
            explain: "When a schedule and a rule touch the same entity in the same hour, the schedule wins and the rule's change is recorded as skipped with the reason.",
          },
        ],
      },
      {
        id: "leads-and-real-roas",
        title: "Leads, deals and real ROAS",
        minutes: 7,
        summary: "Import Meta leads, move them to Won with a deal value, and see cost per deal and real ROAS per campaign.",
        blocks: [
          {
            type: "p",
            text: "If you sell through enquiries, like a clinic, coaching class, real-estate project or service business, Meta's numbers stop at the lead. It can't tell a ₹50,000 admission from a wrong number. The **Leads** page closes that gap.",
          },
          { type: "h", text: "Step 1: lead setup" },
          {
            type: "p",
            text: "The first time, Adwise asks one question: **Kinds of ads you run**. Choose all that apply: Online sales, Lead form ads, WhatsApp, Messenger or call ads, Website sign-ups or bookings, Store visits, App installs, Awareness or video. This decides how Adwise counts your results and revenue.",
          },
          {
            type: "p",
            text: "If you pick lead form ads, Adwise asks you to **Let Adwise read your lead-form leads**. If Meta was connected before this permission existed, you'll see **Reconnect Meta**; do it once and approve everything.",
          },
          { type: "h", text: "Step 2: leads arrive with every sync" },
          {
            type: "p",
            text: "Leads from your Meta lead-form campaigns are imported on each sync, with name, phone, email and form answers, linked to the campaign and ad they came from. Leads from calls or walk-ins can be added with **Add lead**.",
          },
          { type: "diagram", id: "lead-pipeline", caption: "Every lead moves New → Contacted → Qualified → Won, and some drop out at each step." },
          { type: "h", text: "Step 3: update statuses" },
          {
            type: "table",
            columns: ["Status", "Use it when"],
            rows: [
              ["New", "Just arrived, nobody has called yet"],
              ["Contacted", "You called or messaged them"],
              ["Qualified", "Real interest and budget"],
              ["Won", "They paid. Enter the deal value."],
              ["Lost", "Not interested, wrong number, bought elsewhere"],
            ],
          },
          {
            type: "callout",
            tone: "tip",
            title: "Deal value is your income",
            text: "When you mark a lead **Won**, enter what the customer actually paid you, for example ₹42,000 for a course. That is the revenue Adwise ties back to the campaign.",
          },
          { type: "h", text: "Step 4: read cost per deal and real ROAS" },
          {
            type: "terms",
            terms: [
              { term: "Cost per lead", def: "Spend divided by leads.", formula: "spend ÷ leads" },
              { term: "Cost per deal", def: "Spend divided by won leads. What one paying customer costs you.", formula: "spend ÷ won" },
              { term: "Real ROAS", def: "Deal value divided by spend. What you earned per ₹1, from your own sales.", formula: "deal value ÷ spend" },
            ],
          },
          {
            type: "table",
            columns: ["Campaign", "Spend", "Leads", "Cost / lead", "Won", "Cost / deal", "Real ROAS"],
            rows: [
              ["Cheap leads form", "₹30,000", "300", "₹100", "3", "₹10,000", "1.2×"],
              ["Qualified leads form", "₹30,000", "120", "₹250", "9", "₹3,333", "3.6×"],
            ],
          },
          {
            type: "p",
            text: "The first campaign looks better on cost per lead but loses on what matters. Without marking deals, you'd scale the wrong one.",
          },
          {
            type: "callout",
            tone: "warn",
            text: "Real ROAS is only as good as your updates. Set aside 10 minutes a day to move leads along and mark wins with the right value.",
          },
          {
            type: "quiz",
            question: "A campaign spent ₹20,000 and brought 4 won deals worth ₹80,000 in total. What are its cost per deal and real ROAS?",
            options: ["₹5,000 and 4×", "₹20,000 and 1×", "₹4,000 and 5×", "₹5,000 and 0.25×"],
            answer: 0,
            explain: "Cost per deal = ₹20,000 ÷ 4 = ₹5,000. Real ROAS = ₹80,000 ÷ ₹20,000 = 4×.",
          },
        ],
      },
    ],
  },
];

-- +goose Up
-- Changelog / product updates (internal/changelog). Entries are written by
-- platform admins; published ones are public (marketing site) and shown in
-- the app's "What's new" panel. published_at NULL means draft.
CREATE TABLE changelog_entries (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug         text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    title        text NOT NULL,
    summary      text NOT NULL,
    body         text NOT NULL DEFAULT '',
    kind         text NOT NULL CHECK (kind IN ('new', 'improved', 'fixed')),
    tags         text[] NOT NULL DEFAULT '{}',
    link_path    text,
    link_label   text,
    image_url    text,
    published_at timestamptz,
    created_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX changelog_entries_published_idx ON changelog_entries (published_at DESC) WHERE published_at IS NOT NULL;

-- When each user last opened "What's new". No row = never opened.
CREATE TABLE changelog_reads (
    user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    seen_at timestamptz NOT NULL DEFAULT now()
);

-- What has shipped so far. Timestamps are staggered by a minute so the
-- published_at cursor orders them deterministically.
INSERT INTO changelog_entries (slug, title, summary, body, kind, tags, link_path, link_label, published_at) VALUES
('new-adwise-logo', 'A new Adwise logo',
 'Adwise has a fresh logo across the app, emails and the website.',
 'You''ll see the new mark in the app sidebar, on sign-in pages and in the emails we send.',
 'improved', '{brand}', NULL, NULL, now() - interval '7 minutes'),

('onboarding-checklist', 'Onboarding checklist',
 'A short checklist on the dashboard walks new workspaces through setup.',
 'The checklist covers the steps that get you value fastest:

- Connect Meta or Google
- Turn on sync for an ad account
- Tell us what kinds of ads you run
- Create your first rule in **dry run**
- Finish your first lesson

Each step links straight to the right page, and the checklist ticks itself off as you go.',
 'new', '{onboarding}', '/app/dashboard', 'Open dashboard', now() - interval '6 minutes'),

('creative-fatigue-detection', 'Creative fatigue detection',
 'Adwise spots ads people have seen too often and stopped clicking.',
 'Every hour Adwise compares each ad''s last week with the week before. When frequency climbs while click-through rate falls, the ad is flagged as fatigued and a **pause this ad** suggestion lands in your Recommendations inbox, with the numbers behind it.',
 'new', '{recommendations,creative}', '/app/recommendations', 'See recommendations', now() - interval '5 minutes'),

('recommendations-inbox', 'Recommendations inbox',
 'One place for suggested changes: scale winners, cut wasted spend, pause tired ads.',
 'Adwise reviews your synced campaigns against your targets and suggests concrete changes:

- Scale campaigns that are beating your targets
- Cut spend that isn''t bringing results
- Pause ads showing creative fatigue

Nothing changes on Meta or Google until someone accepts a suggestion. Accepted changes show in the actions log and can be reverted.',
 'new', '{recommendations}', '/app/recommendations', 'Open inbox', now() - interval '4 minutes'),

('alerts-email-and-in-app', 'Alerts by email and in-app',
 'Get told when spend spikes, ROAS drops or a campaign stops delivering.',
 'Adwise checks your synced data every hour and raises an alert for:

- Spend spikes
- ROAS drops
- Campaigns that stopped delivering
- Connections that need reconnecting
- Rules or changes that could not be applied

Choose which alerts you want by email in **Settings → Alerts**. Everything also appears in the app.',
 'new', '{alerts}', '/app/settings/alerts', 'Set up alerts', now() - interval '3 minutes'),

('instant-meta-leads', 'Instant Meta leads',
 'New Meta lead-form leads arrive in Adwise within seconds.',
 'Turn on instant leads from the Leads setup and each new lead-form submission is pushed to Adwise as it happens, instead of waiting for the regular import. The hourly import keeps running as a safety net, so no lead is missed.',
 'new', '{leads,meta}', '/app/leads', 'Set up instant leads', now() - interval '2 minutes'),

('leads-to-sales', 'Leads: track every lead to the sale',
 'Follow each lead from new to won or lost, and see which ads bring real deals.',
 'Leads from Meta Lead Ads are imported automatically, and you can add leads by hand. Move each one through **new → contacted → qualified → won / lost** and record the deal value.

Won deals count as revenue for the campaign and ad that produced them, so businesses that sell offline get cost per deal and real ROAS.',
 'new', '{leads}', '/app/leads', 'Open leads', now() - interval '1 minute'),

('learn-free-ads-course', 'Learn: a free ads course inside Adwise',
 'Short lessons on running Meta and Google ads, right where you manage them.',
 'Learn is a free course built into Adwise. Work through short lessons with diagrams and quick quizzes, track your progress and earn milestones along the way, from the basics to launching on Meta and Google.',
 'new', '{learn}', '/app/learn', 'Start learning', now());

-- +goose Down
DROP TABLE changelog_reads;
DROP TABLE changelog_entries;

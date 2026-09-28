import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/marketing/legal/prose";
import { PageHero } from "@/components/marketing/page-hero";
import { CONTACT_EMAIL, CONTACT_HREF } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What data Adwise collects, how it is used, and how to delete it.",
};

const META_PERMISSIONS: [string, string][] = [
  ["ads_read", "Read your campaigns, ad sets, ads, budgets and performance insights."],
  ["ads_management", "Pause, resume and change budgets and settings of your campaigns when you ask Adwise to."],
  ["business_management", "List the Business portfolios and ad accounts you can access, so you can choose which to connect."],
  ["leads_retrieval", "Retrieve submissions from your lead form (instant form) ads."],
  ["pages_show_list", "List the Facebook Pages you manage, so you can choose which to connect."],
  ["pages_read_engagement", "Read basic information about the Pages you connect."],
  ["pages_manage_metadata", "Subscribe your Page to lead notifications so new leads arrive promptly."],
  ["pages_manage_ads", "Access the lead forms and ads associated with your Page."],
];

export default function PrivacyPage() {
  return (
    <>
      <PageHero
        eyebrow="Legal"
        title="Privacy Policy"
        description="What Adwise collects, why, who it is shared with, and how to delete it."
        cta={false}
      />
      <LegalDocument updated="27 September 2026">
        <p>
          This Privacy Policy explains how Adwise, an independent app built and operated by an individual developer
          (&ldquo;the developer of Adwise&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), handles information when you use
          the Adwise website and web application (the &ldquo;Service&rdquo;). Questions or requests can go to{" "}
          <a href={CONTACT_HREF}>{CONTACT_EMAIL}</a>.
        </p>

        <h2 id="collect">1. Information we collect</h2>
        <h3>Account information</h3>
        <p>Your name, email address and password (stored only as a secure hash), and the workspace you create.</p>
        <p>
          <strong>Security information.</strong> If you add one, your mobile number (used to contact you about your
          account, verified by a text message). If you turn on two-step verification, an authenticator key (encrypted at
          rest) and one-time recovery codes (stored only as hashes). To protect your account, a record of sign-ins and
          security changes (time, IP address and browser), the devices you&rsquo;ve signed in from, and a device cookie
          that recognises a browser you&rsquo;ve used before. This is used only to detect unusual sign-ins, send you
          sign-in alerts and show you your recent security activity, and is kept for up to 180 days.
        </p>

        <h3>Connected ad account data</h3>
        <p>
          When you connect Meta or Google Ads through their official OAuth sign-in, we receive access tokens and, using
          them, read data from the ad accounts you choose: campaigns, ad sets / ad groups and ads, their status and
          settings, budgets, and performance metrics such as impressions, clicks, spend and conversions, including
          breakdowns by country, device, placement and hour of day.
        </p>

        <h3>Lead form data</h3>
        <p>
          If you connect a Facebook Page and use lead form (instant form) ads, we retrieve submissions to your forms:
          typically the names, email addresses, phone numbers and form answers of people who submitted them. For this
          data, <strong>you are the controller</strong> and Adwise processes it only on your behalf and on your
          instructions, to show and manage those leads for you. You are responsible for having a lawful basis and a
          privacy notice for the people who fill in your forms.
        </p>

        <h3>Action and audit logs</h3>
        <p>
          A record of changes made through Adwise (for example a campaign paused by a schedule, or a budget changed by
          a rule), including dry-run results, who or what triggered them, and when.
        </p>

        <h3>Session and technical data</h3>
        <p>
          A session cookie that keeps you signed in, and standard server logs (such as IP address, browser type and
          request times) used for security and troubleshooting.
        </p>

        <h2 id="permissions">2. Permissions we request</h2>
        <p>
          We ask only for the permissions needed for the features we offer. You grant them on Meta&rsquo;s or
          Google&rsquo;s own consent screen, and you can revoke them at any time.
        </p>
        <h3>Meta (Facebook and Instagram)</h3>
        <ul>
          {META_PERMISSIONS.map(([name, why]) => (
            <li key={name}>
              <code>{name}</code>: {why}
            </li>
          ))}
        </ul>
        <h3>Google Ads</h3>
        <ul>
          <li>
            <code>https://www.googleapis.com/auth/adwords</code>: read your Google Ads campaigns, ad groups, ads,
            budgets and performance reports, and make the changes you configure (such as pausing or resuming campaigns
            on a schedule).
          </li>
        </ul>

        <h2 id="use">3. How we use information</h2>
        <p>We use the information above only to provide and improve the features you use, namely to:</p>
        <ul>
          <li>show your campaigns, performance, analytics and leads inside Adwise;</li>
          <li>run the schedules and rules you set up, and record them in your action log;</li>
          <li>keep the Service secure, prevent abuse and fix problems;</li>
          <li>send you service messages, such as notifications from rules you configured or important account notices.</li>
        </ul>
        <p>
          We <strong>do not sell</strong> your data or your leads&rsquo; data, do not use it for advertising, and do not
          use it to train third-party AI models.
        </p>

        <h2 id="google-limited-use">4. Google API Services: Limited Use</h2>
        <p>
          Adwise&rsquo;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In particular, Google user data is used only to provide or improve
          user-facing features of Adwise, is not transferred to others except as needed to provide those features,
          comply with law or as part of a merger or acquisition with notice, is not used for advertising, and is not
          read by humans except with your consent, for security purposes, to comply with law, or when aggregated and
          anonymised for internal operations.
        </p>

        <h2 id="sharing">5. Sharing</h2>
        <p>We share information only with:</p>
        <ul>
          <li>
            <strong>The ad platforms themselves</strong> (Meta and Google), to carry out the actions you request, such
            as reading reports or pausing a campaign;
          </li>
          <li>
            <strong>Infrastructure providers</strong> that host and run the Service (such as cloud hosting, database and
            email delivery providers).
            They process data only on our instructions;
          </li>
          <li>authorities, where required by law.</li>
        </ul>

        <h2 id="retention">6. Retention and deletion</h2>
        <p>
          We keep your data while your account is active. When you <strong>disconnect an integration</strong>, we
          delete its stored access tokens and stop syncing; synced data from that account is deleted from our active
          systems within 30 days. When you <strong>delete your account</strong>, or email us asking for deletion, we
          delete your account, connected account data, leads and logs within 30 days, except where we must keep
          something to comply with law. Backups roll off on their normal schedule.
        </p>
        <h3 id="meta-data-deletion">Data deletion instructions for Meta</h3>
        <p>To delete the data Adwise holds from your Facebook or Instagram account:</p>
        <ul>
          <li>
            In Adwise, open <strong>Integrations</strong> and disconnect Meta; or email{" "}
            <a href={CONTACT_HREF}>{CONTACT_EMAIL}</a> with the subject &ldquo;Delete my data&rdquo; from the email on
            your Adwise account.
          </li>
          <li>
            You can also remove Adwise in Facebook under <strong>Settings &amp; privacy → Settings → Business
            integrations</strong> (or Apps and websites), then select Remove.
          </li>
        </ul>
        <p>We will confirm by email once deletion is complete.</p>

        <h2 id="security">7. Security</h2>
        <p>
          OAuth access and refresh tokens are <strong>encrypted at rest with AES-256-GCM</strong>. Data is transmitted
          over HTTPS, passwords are stored as salted hashes, and access to production systems is restricted. No system
          is perfectly secure, but we take reasonable measures to protect your data and will notify you of a breach
          affecting it as required by law.
        </p>

        <h2 id="cookies">8. Cookies and local storage</h2>
        <p>
          Adwise uses <strong>two essential cookies</strong>: a session cookie that keeps you signed in, and a device
          cookie that recognises a browser you&rsquo;ve signed in from before, so unusual sign-ins can be caught. Your theme preference (light
          or dark) is saved in your browser&rsquo;s local storage. We do not use advertising or cross-site tracking
          cookies.
        </p>

        <h2 id="rights">9. Your choices</h2>
        <p>
          You can access and update your account information in the app, revoke ad platform access at any time, and
          ask us for a copy of your data or for its correction or deletion by emailing{" "}
          <a href={CONTACT_HREF}>{CONTACT_EMAIL}</a>. Requests from people whose details were collected through your
          lead forms should go to you as the controller; we will help you respond.
        </p>

        <h2 id="children">10. Children</h2>
        <p>
          Adwise is a business tool for adults and is not directed at children. We do not knowingly collect personal
          data from anyone under 18.
        </p>

        <h2 id="changes">11. Changes to this policy</h2>
        <p>
          We may update this policy. We will change the date above and, for material changes, notify you by email or in
          the app before they take effect. See also our <Link href="/terms">Terms of Service</Link>.
        </p>

        <h2 id="contact">12. Contact</h2>
        <p>
          For any privacy question or request, email <a href={CONTACT_HREF}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalDocument>
    </>
  );
}

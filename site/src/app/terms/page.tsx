import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/marketing/legal/prose";
import { PageHero } from "@/components/marketing/page-hero";
import { CONTACT_EMAIL, CONTACT_HREF } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply when you use Adwise.",
};

export default function TermsPage() {
  return (
    <>
      <PageHero
        eyebrow="Legal"
        title="Terms of Service"
        description="The rules for using Adwise, written to be read. Please read them before connecting an ad account."
        cta={false}
      />
      <LegalDocument updated="27 September 2026">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Adwise, including the website and the web
          application (together, the &ldquo;Service&rdquo;). Adwise is an independent app built and operated by an
          individual developer (&ldquo;the developer of Adwise&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating
          an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service.
        </p>

        <h2 id="service">1. The Service</h2>
        <p>
          Adwise helps you manage advertising on third-party ad platforms such as Meta (Facebook and Instagram) and
          Google Ads. Features may include reading campaign and performance data, analytics, dayparting schedules,
          automation rules and lead management. Features may be added, changed or
          removed over time.
        </p>

        <h2 id="accounts">2. Your account</h2>
        <ul>
          <li>You must provide accurate information and keep your login credentials secure.</li>
          <li>You are responsible for all activity under your account, including by people you invite to it.</li>
          <li>You must be at least 18 years old and able to enter a binding agreement.</li>
          <li>Tell us promptly at <a href={CONTACT_HREF}>{CONTACT_EMAIL}</a> if you suspect unauthorised access.</li>
        </ul>

        <h2 id="ad-accounts">3. Your ad accounts and authorization</h2>
        <p>
          When you connect an ad account, you authorize Adwise, through the platform&rsquo;s official OAuth sign-in, to
          access that account and, where you use features that do so, to make changes on your behalf. You confirm that
          you own the ad accounts, Pages and other assets you connect, or are authorized by their owner to grant this
          access. You can revoke access at any time by disconnecting the integration in Adwise or removing Adwise from
          your Meta or Google account settings.
        </p>

        <h2 id="automation">4. Automated changes are your responsibility</h2>
        <p>
          Adwise can pause, resume and change budgets or other settings of your campaigns according to schedules and
          rules that you configure. New schedules and rules run in <strong>dry-run mode by default</strong>, which
          records what would have happened without changing anything. You decide when to switch to live mode.
        </p>
        <p>
          You are responsible for the schedules, rules and actions you configure or approve, and for the resulting
          ad spend and results. Review dry-run output and your ad accounts regularly. Ad platform APIs can be delayed,
          rate-limited or unavailable, so an automated action may run late or not at all; we do not guarantee that any
          action will be carried out at a particular time. Keep sensible spending limits in your ad accounts.
        </p>

        <h2 id="platform-terms">5. Ad platform terms apply</h2>
        <p>
          Your use of Meta, Google and other ad platforms remains subject to their own terms, policies and advertising
          guidelines. Adwise is not affiliated with, endorsed by or sponsored by Meta or Google. We are not responsible
          for ad platform decisions such as ad rejections, account restrictions or billing, or for changes those
          platforms make to their products or APIs.
        </p>

        <h2 id="acceptable-use">6. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>use the Service for anything unlawful, or to run ads that break the ad platforms&rsquo; policies;</li>
          <li>connect accounts or process personal data you are not authorized to;</li>
          <li>
            attempt to access other users&rsquo; data, probe or disrupt the Service, or bypass its limits or security;
          </li>
          <li>reverse engineer the Service, or resell it without written permission;</li>
          <li>use automated means to scrape the Service or place unreasonable load on it.</li>
        </ul>

        <h2 id="fees">7. Fees and plans</h2>
        <p>
          Adwise is currently in a closed beta and free to use during it. Paid plans may be introduced later with advance notice; prices, plan limits and features may change.
          We will give reasonable notice of changes to paid plans before they affect you. Fees you pay to ad platforms
          for advertising are separate and are always billed by those platforms, not by Adwise.
        </p>

        <h2 id="content">8. Your data</h2>
        <p>
          You keep all rights to the data you bring into Adwise, including ad account data and leads. You grant us
          permission to process it only as needed to provide the Service to you, as described in our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2 id="availability">9. Availability and no warranty</h2>
        <p>
          The Service is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>. To the fullest
          extent permitted by law, we disclaim all warranties, express or implied, including merchantability, fitness
          for a particular purpose and non-infringement. We do not guarantee that the Service will be uninterrupted,
          error-free or that data will be accurate or complete. Analytics, recommendations and AI-generated insights are
          informational only and are not financial or business advice; you decide what to act on.
        </p>

        <h2 id="liability">10. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, the developer of Adwise will not be liable for any indirect,
          incidental, special, consequential or punitive damages, or for any loss of profits, revenue, data, goodwill or
          ad spend, arising from your use of or inability to use the Service, including from automated actions. Our
          total liability for any claim relating to the Service is limited to the amount you paid us for the Service in
          the three months before the claim arose, or INR 5,000 if you paid nothing.
        </p>

        <h2 id="termination">11. Termination</h2>
        <p>
          You can stop using the Service and delete your account at any time. We may suspend or end your access if you
          breach these Terms, if required by law or by an ad platform, or if we discontinue the Service; where
          reasonable we will give notice. On termination, schedules and rules stop running, and your data is deleted as
          described in the Privacy Policy.
        </p>

        <h2 id="changes">12. Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. We will update the date above and, for material changes, let
          you know by email or in the app. Continuing to use the Service after changes take effect means you accept
          them.
        </p>

        <h2 id="law">13. Governing law</h2>
        <p>
          These Terms are governed by the laws of India. Courts in India have exclusive jurisdiction over any dispute
          arising from them, subject to any mandatory rights you have under the law of your place of residence.
        </p>

        <h2 id="contact">14. Contact</h2>
        <p>
          Questions about these Terms? Email <a href={CONTACT_HREF}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalDocument>
    </>
  );
}

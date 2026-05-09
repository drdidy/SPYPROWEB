import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "Privacy Policy · SPY Prophet",
  description:
    "How SPY Prophet collects, uses, and shares personal data, and your rights under GDPR/UK-GDPR/CCPA.",
};

// TODO(legal): the data-subject-rights section assumes a generic
// CCPA + GDPR overlap. If the company sells in the EEA at scale,
// counsel should add a controller/processor matrix and the appropriate
// SCC references for cross-border transfer. The retention table below
// is engineering's best estimate — confirm with counsel and the
// chosen email provider's DPA.

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      lastUpdated="2026-05-09"
    >
      <p>
        SPY Prophet (&quot;we&quot;) operates the website and workspace at
        spyprophet.app (the &quot;Service&quot;). This Privacy Policy
        explains what we collect, why, and your rights.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Waitlist email and name</strong>, if you provide them.
          Optional UTM parameters and referrer captured at form submission.
        </li>
        <li>
          <strong>Account data</strong> for beta users: email, display
          name, billing details (when paid tiers ship — currently none).
        </li>
        <li>
          <strong>Workspace activity</strong>: anonymized session metrics
          (route, viewport, basic event counts) used to debug and improve
          the Service. Not sold or shared with advertisers.
        </li>
        <li>
          <strong>Server logs</strong>: IP address, user agent, request
          path, timestamp. Retained 30 days for security and abuse
          response.
        </li>
        <li>
          <strong>Cookies</strong>: a strictly-necessary session cookie
          when authenticated; an analytics cookie only with your consent
          (deny by default in regions where consent is required).
        </li>
      </ul>

      <h2>Why we collect it</h2>
      <ul>
        <li>To operate the Service and provide it to you.</li>
        <li>To respond to support requests and security incidents.</li>
        <li>To improve the Service through aggregated, anonymized analysis.</li>
        <li>To communicate beta updates (you can unsubscribe at any time).</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>{/* TODO(legal): confirm retention against email-provider DPA. */}</p>
      <ul>
        <li>Waitlist email: until you unsubscribe or until the public launch + 12 months, whichever is sooner.</li>
        <li>Account data: for the life of your account, plus 90 days after deletion for backup expiry.</li>
        <li>Server logs: 30 days.</li>
        <li>Anonymized usage metrics: 24 months.</li>
      </ul>

      <h2>Sharing</h2>
      <p>
        We do not sell personal data. We share it only with: (a) infrastructure
        providers (hosting, email delivery, error tracking) under data
        processing agreements; (b) law enforcement when legally compelled;
        (c) successors in the event of a merger or acquisition.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li>Access, correction, deletion, and portability of your data.</li>
        <li>Withdrawal of consent for non-essential cookies at any time.</li>
        <li>To lodge a complaint with your local data-protection authority (UK ICO, your EU member-state DPA, or your state attorney general).</li>
      </ul>
      <p>
        To exercise any of these rights:{" "}
        <a href="mailto:privacy@spyprophet.app">privacy@spyprophet.app</a>.
      </p>

      <h2>International transfers</h2>
      <p>
        Our infrastructure is hosted in the United States. If you access
        the Service from outside the US, you understand that your data
        will be transferred to and processed in the US under appropriate
        safeguards.{" "}
        {/* TODO(legal): add SCC reference if EU traffic warrants. */}
      </p>

      <h2>Children</h2>
      <p>
        The Service is not intended for individuals under 18 and we do not
        knowingly collect data from them. If we learn we have, we will
        delete it.
      </p>

      <h2>Changes</h2>
      <p>
        Material changes to this Policy will be announced by email to
        registered users and posted here with a new &quot;Last updated&quot;
        date.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:privacy@spyprophet.app">privacy@spyprophet.app</a>{" "}
        for any privacy question.
      </p>
    </LegalPage>
  );
}

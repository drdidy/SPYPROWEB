import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "Contact · SPY Prophet",
  description: "Reach SPY Prophet — beta access, support, press.",
};

export default function ContactPage() {
  return (
    <LegalPage
      eyebrow="Contact"
      title="Reach us."
      lastUpdated="2026-05-09"
    >
      <p>
        We&apos;re a small team. The fastest way to reach us is by email.
      </p>

      <h3>Beta access</h3>
      <p>
        <a href="/#waitlist">Join the waitlist</a>. We open seats in small
        cohorts.
      </p>

      <h3>Support</h3>
      <p>
        Beta members: use the in-app feedback link in the workspace.
        Everyone else: <a href="mailto:hello@spyprophet.app">hello@spyprophet.app</a>.
      </p>

      <h3>Press</h3>
      <p>
        See <a href="/press">our press page</a>.
      </p>

      <h3>Legal / privacy</h3>
      <p>
        Privacy and data requests: <a href="mailto:privacy@spyprophet.app">privacy@spyprophet.app</a>.
        Security disclosures: <a href="/.well-known/security.txt">security.txt</a>.
      </p>
    </LegalPage>
  );
}

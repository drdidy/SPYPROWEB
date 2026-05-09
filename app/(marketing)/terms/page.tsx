import { LegalPage } from "@/components/marketing/LegalPage";

export const metadata = {
  title: "Terms of Service · SPY Prophet",
  description:
    "Terms governing use of SPY Prophet, a closed-beta decision-support workspace.",
};

// TODO(legal): every section below is engineering-drafted boilerplate.
// Counsel must review before public launch. Specifically: arbitration
// clause enforceability per state, dispute-resolution venue choice
// (currently Delaware), the indemnification scope, and the SAAS
// vs subscription characterization for sales-tax nexus.

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms of Service"
      lastUpdated="2026-05-09"
    >
      <p>
        These Terms of Service (the &quot;Terms&quot;) govern your access to
        and use of the SPY Prophet website at spyprophet.app and the
        associated workspace, dashboards, and APIs (collectively, the
        &quot;Service&quot;). By accessing or using the Service you agree to
        be bound by these Terms.
      </p>

      <h2>1. The Service</h2>
      <p>
        SPY Prophet is an educational workspace and decision-support tool.
        It is not a broker-dealer, registered investment adviser, futures
        commission merchant, commodity trading advisor, or commodity pool
        operator. The Service does not place orders, hold customer funds,
        or solicit transactions. See <a href="/disclosures">Disclosures</a>{" "}
        and <a href="/risk">Risk Disclosure</a>.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 18 years old and able to form a binding
        contract under the laws of your jurisdiction. You may not use the
        Service if doing so violates the laws of your jurisdiction.
      </p>

      <h2>3. Closed beta</h2>
      <p>
        Access during closed beta is by invitation. We may suspend, modify,
        or terminate access at any time without notice during the beta
        period. Beta features may change materially from one session to the
        next.
      </p>

      <h2>4. Acceptable use</h2>
      <ul>
        <li>You will not scrape, mirror, or republish the Service&apos;s analytical output.</li>
        <li>You will not attempt to access the Service&apos;s underlying systems beyond the surfaces we expose.</li>
        <li>You will not use the Service to provide investment advice or signal services to third parties.</li>
        <li>You will not represent the Service&apos;s output as your own analysis to clients or for solicitation purposes.</li>
      </ul>

      <h2>5. Intellectual property</h2>
      <p>
        All content, software, design, copy, and the underlying methodology
        of the Service are owned by SPY Prophet or our licensors. We grant
        you a personal, non-exclusive, non-transferable, revocable license
        to use the Service for your own decision-support purposes.
      </p>

      <h2>6. Fees</h2>
      <p>
        Closed beta is offered free of charge. Future paid tiers will be
        introduced under a separate subscription agreement. We will give
        reasonable notice before any free-tier feature becomes paid.
      </p>

      <h2>7. Disclaimers</h2>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available&quot;
        without warranties of any kind, express or implied, including
        merchantability, fitness for a particular purpose, and
        non-infringement. We do not warrant that the Service will be
        uninterrupted, error-free, or that the analytical output will be
        accurate, timely, or profitable.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, SPY Prophet, its officers,
        employees, and contractors shall not be liable for any indirect,
        incidental, special, consequential, or punitive damages, or for any
        lost profits or trading losses, arising out of or relating to your
        use of the Service. Our aggregate liability shall not exceed the
        greater of one hundred US dollars (US$100) or the amounts paid by
        you to us in the twelve months preceding the claim.
      </p>

      <h2>9. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless SPY Prophet from any
        claim arising from your use of the Service, your trading
        decisions, your violation of these Terms, or your violation of any
        third party&apos;s rights.
      </p>

      <h2>10. Governing law and dispute resolution</h2>
      <p>
        These Terms are governed by the laws of the State of Delaware,
        without regard to conflict-of-laws principles. Any dispute arising
        from these Terms or the Service shall be resolved by binding
        arbitration administered by JAMS in accordance with its
        Comprehensive Arbitration Rules. The seat of arbitration shall be
        Wilmington, Delaware. The parties waive any right to participate in
        a class action.{" "}
        {/* TODO(legal): confirm arbitration enforceability per CA, NY, MA. */}
      </p>

      <h2>11. Changes</h2>
      <p>
        We may modify these Terms by posting the revised version with a new
        &quot;Last updated&quot; date. Material changes will be announced
        via email to registered users.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these Terms:{" "}
        <a href="mailto:legal@spyprophet.app">legal@spyprophet.app</a>.
      </p>
    </LegalPage>
  );
}

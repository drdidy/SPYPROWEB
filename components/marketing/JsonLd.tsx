// JSON-LD blocks injected into the marketing surface for rich-result
// eligibility. Two schemas:
//
//   Organization — describes SPY Prophet, its URL, logo, sameAs.
//   FAQPage      — pulled from the FAQ component's static array so
//                  Google's FAQ rich result lights up.
//
// Both render via plain <script type="application/ld+json"> so they
// emit during SSR and don't depend on hydration.

interface FAQ {
  q: string;
  a: string;
}

const SITE_URL = "https://www.spyprophet.app";

export function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "SPY Prophet",
    url: SITE_URL,
    logo: `${SITE_URL}/icon`,
    description:
      "A decision workspace for serious retail traders. Read the day before the day reads you.",
    foundingLocation: {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: "Chicago", addressRegion: "IL", addressCountry: "US" },
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        email: "hello@spyprophet.app",
        contactType: "customer support",
        areaServed: "US",
        availableLanguage: ["English"],
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      // Next/React escapes the JSON for us via dangerouslySetInnerHTML
      // — this is the canonical pattern for SSR'd JSON-LD.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function FAQPageJsonLd({ faqs }: { faqs: ReadonlyArray<FAQ> }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

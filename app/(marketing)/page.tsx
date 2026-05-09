import { HeroSection } from "@/components/marketing/HeroSection";
import { PullQuote } from "@/components/marketing/PullQuote";
import { MethodologyTriad } from "@/components/marketing/MethodologyTriad";
import { MorningSection } from "@/components/marketing/MorningSection";
import { SurfacesGrid } from "@/components/marketing/SurfacesGrid";
import { Manifesto } from "@/components/marketing/Manifesto";
import { FAQ } from "@/components/marketing/FAQ";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";
import {
  OrganizationJsonLd,
  FAQPageJsonLd,
} from "@/components/marketing/JsonLd";
import { FAQS } from "@/content/faqs";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";

// Render at request time so loadLiveSnapshot() can read the live host
// header and hit /api/snapshot. (See lib/snapshot-fetch.ts.)
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const { data: snap, source } = await loadLiveSnapshot();
  return (
    <>
      {/* JSON-LD: Organization (site identity) + FAQPage (rich-result
          eligibility for the six FAQ items below). Both render
          server-side as <script type="application/ld+json">. */}
      <OrganizationJsonLd />
      <FAQPageJsonLd faqs={FAQS} />

      <HeroSection
        decision={snap.decision}
        quote={{
          spy: snap.shellState.spy,
          change: snap.shellState.change,
          changePct: snap.shellState.changePct,
          vix: snap.shellState.vix,
        }}
        initialLive={source === "live"}
      />
      <PullQuote />
      <MethodologyTriad />
      <MorningSection />
      <SurfacesGrid />
      <Manifesto />
      <FAQ />
      <WaitlistForm />
    </>
  );
}

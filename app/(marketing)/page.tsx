import { HeroSection } from "@/components/marketing/HeroSection";
import { PullQuote } from "@/components/marketing/PullQuote";
import { MethodologyTriad } from "@/components/marketing/MethodologyTriad";
import { MorningSection } from "@/components/marketing/MorningSection";
import { SurfacesGrid } from "@/components/marketing/SurfacesGrid";
import { Manifesto } from "@/components/marketing/Manifesto";
import { FAQ } from "@/components/marketing/FAQ";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";

export const revalidate = 30;

export default async function Home() {
  const { data: snap, source } = await loadLiveSnapshot();
  return (
    <>
      <HeroSection
        decision={snap.decision}
        quote={{
          spy: snap.shellState.spy,
          change: snap.shellState.change,
          changePct: snap.shellState.changePct,
          vix: snap.shellState.vix,
        }}
        source={source}
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

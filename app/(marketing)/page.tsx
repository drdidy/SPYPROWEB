import { HeroSection } from "@/components/marketing/HeroSection";
import { PullQuote } from "@/components/marketing/PullQuote";
import { MethodologyTriad } from "@/components/marketing/MethodologyTriad";
import { MorningSection } from "@/components/marketing/MorningSection";
import { SurfacesGrid } from "@/components/marketing/SurfacesGrid";
import { Manifesto } from "@/components/marketing/Manifesto";
import { FAQ } from "@/components/marketing/FAQ";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";

export default function Home() {
  return (
    <>
      <HeroSection />
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

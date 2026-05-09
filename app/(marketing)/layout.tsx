import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { ConsentBanner } from "@/components/marketing/ConsentBanner";
import { ScrollDepthTracker } from "@/components/marketing/ScrollDepthTracker";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
      {/* GDPR consent banner — deny by default; analytics + scroll
          depth fire only after user accepts. ScrollDepthTracker is
          mounted always but no-ops until consent is granted. */}
      <ConsentBanner />
      <ScrollDepthTracker />
    </div>
  );
}

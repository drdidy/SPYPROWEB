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
      {/* Skip link — visually hidden until focused. First focusable
          element on the page so keyboard users can bypass the nav.
          Targets <main id="main"> below. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-3 focus:py-2 focus:rounded-soft focus:bg-ink focus:text-canvas focus:font-mono focus:text-[12px] focus:tracking-[0.10em] focus:uppercase focus:outline-none focus:ring-2 focus:ring-gold/40"
      >
        Skip to content
      </a>
      <MarketingNav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
      {/* GDPR consent banner — deny by default; analytics + scroll
          depth fire only after user accepts. ScrollDepthTracker is
          mounted always but no-ops until consent is granted. */}
      <ConsentBanner />
      <ScrollDepthTracker />
    </div>
  );
}

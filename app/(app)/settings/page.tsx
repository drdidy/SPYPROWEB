import { SettingsClient } from "@/components/settings/SettingsClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div>
      <header className="grid border-b border-carbon lg:grid-cols-[0.38fr_0.62fr]">
        <div className="flex flex-col justify-between bg-coral p-5 md:p-10">
          <p className="microlabel">System</p>
          <p className="microlabel mt-20 text-carbon/85">
            Delivery / feeds / readiness
          </p>
        </div>
        <div className="p-5 py-10 md:p-10">
          <h1 className="max-w-[850px] text-[12vw] font-black leading-[0.86] tracking-[-0.01em] sm:text-[44px] md:text-[64px] xl:text-[84px]">
            Check every connection before the market opens.
          </h1>
          <p className="mt-6 max-w-[660px] text-[15px] leading-relaxed text-carbon/60">
            Confirm market data, Telegram delivery, and system readiness here. A connected service only confirms delivery; it does not confirm a trade.
          </p>
        </div>
      </header>
      <SettingsClient />
    </div>
  );
}

import { SettingsClient } from "@/components/settings/SettingsClient";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="workspace-canvas">
      <header className="workspace-intro">
        <Image src="/images/market-depth-exchange-v1.png" alt="" fill className="object-cover object-right opacity-15" sizes="100vw" />
        <div className="absolute inset-0 bg-gradient-to-r from-carbon via-carbon/92 to-carbon/50" />
        <div className="relative z-10 p-5 py-10 md:p-10 md:py-12">
          <p className="microlabel text-mineral">System readiness</p>
          <h1 className="workspace-title mt-5">
            Check every connection before the market opens.
          </h1>
          <p className="workspace-copy mt-5">
            Confirm market data, Telegram delivery, and system readiness here. A connected service only confirms delivery; it does not confirm a trade.
          </p>
        </div>
      </header>
      <SettingsClient />
    </div>
  );
}

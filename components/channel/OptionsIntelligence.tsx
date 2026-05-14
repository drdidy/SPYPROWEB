import { OptionsIntelPanel } from "@/components/dashboard/OptionsIntel";
import { PanelHeartbeat } from "@/components/channel/ChannelLiveBadge";
import { buildSpyContractProjection } from "@/lib/spy-contract-projection";
import type { OptionsIntel, SelectedStrikes, TradeSignal } from "@/lib/types";
import type { AdaptedSnapshot, OptionsRaw } from "@/lib/snapshot-adapter";

export function OptionsIntelligence({
  intel,
  strikes,
  spy,
  chain,
  signal,
  snap,
}: {
  intel: OptionsIntel | null;
  strikes: SelectedStrikes | null;
  spy: number;
  chain?: OptionsRaw | null;
  signal?: TradeSignal | null;
  snap?: AdaptedSnapshot;
}) {
  void chain;
  void strikes;
  void spy;
  void signal;
  const projection = snap ? buildSpyContractProjection(snap) : null;
  return (
    <OptionsIntelPanel
      intel={intel}
      strikes={strikes}
      spy={spy}
      healthAction={<PanelHeartbeat feedId="options-chain" />}
      projection={projection}
      chainStatus={chain ? "loaded" : "waiting"}
    />
  );
}

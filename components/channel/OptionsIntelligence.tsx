import { OptionsIntelPanel } from "@/components/dashboard/OptionsIntel";
import type { OptionsIntel, SelectedStrikes } from "@/lib/types";

export function OptionsIntelligence({
  intel,
  strikes,
  spy,
}: {
  intel: OptionsIntel | null;
  strikes: SelectedStrikes | null;
  spy: number;
}) {
  return <OptionsIntelPanel intel={intel} strikes={strikes} spy={spy} />;
}

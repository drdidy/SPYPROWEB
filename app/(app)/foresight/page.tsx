import { FeedHealthProvider } from "@/components/decision-slate/FeedHealthProvider";
import { ForesightShell } from "@/components/foresight/ForesightShell";
import { buildFeedSeed } from "@/lib/feed-health";
import { buildEsForesightSnapshot, buildForesightSnapshot } from "@/lib/foresight/build-snapshot";
import { SCENARIO_PRESETS } from "@/lib/foresight/config";
import { emptyAdapted, loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { loadSnapshot as loadEsSnapshot } from "@/lib/spx-fetch";
import type { ScenarioKind } from "@/lib/contracts/foresight";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({
  searchParams,
}: {
  searchParams?: { mock?: string; scenarios?: string; engine?: string };
}) {
  const mockParam = searchParams?.mock ?? null;
  const engine = searchParams?.engine === "es" ? "es" : "spy";
  const loaded = mockParam?.startsWith("foresight:")
    ? { data: emptyAdapted(), source: "mock" as const }
    : await loadLiveSnapshot();
  const { data: snap, source } = loaded;
  const esLoaded = engine === "es" ? await loadEsSnapshot() : null;
  const activeScenarioKeys = parseScenarioKeys(searchParams?.scenarios);
  const activeScenarios = activeScenarioKeys.map((key) => SCENARIO_PRESETS[key].input);
  const snapshot =
    engine === "es" && esLoaded
      ? buildEsForesightSnapshot({
          snap: esLoaded.snap,
          source: esLoaded.source,
          mock: mockParam,
          activeScenarios,
        })
      : buildForesightSnapshot({
          snap,
          source,
          mock: mockParam,
          activeScenarios,
        });
  const feedStatus =
    snapshot.status === "failed"
      ? "failed"
      : snapshot.status === "stale"
        ? "stale"
        : snapshot.status === "standby" || snapshot.status === "resolving"
          ? "loading"
          : "live";
  const feeds = [
    buildFeedSeed("projection-engine", {
      lastUpdatedAt: snapshot.generatedAt,
      nextExpectedAt: snapshot.nextRefreshAt,
      staleAfterMs: 120_000,
      critical: true,
      initialStatus: feedStatus,
      failedAt: snapshot.status === "failed" ? snapshot.generatedAt : null,
    }),
    buildFeedSeed("price-tick", {
      lastUpdatedAt: snapshot.sourceLastTick,
      staleAfterMs: 10_000,
      critical: true,
      initialStatus: feedStatus,
    }),
    buildFeedSeed("anchor-levels", {
      lastUpdatedAt: snapshot.generatedAt,
      staleAfterMs: 60_000,
      initialStatus: snapshot.matrix.lines.length > 0 ? feedStatus : "loading",
    }),
    buildFeedSeed("trigger-lines", {
      lastUpdatedAt: snapshot.generatedAt,
      staleAfterMs: 60_000,
      initialStatus: snapshot.matrix.lines.length > 0 ? feedStatus : "loading",
    }),
    buildFeedSeed("calibration-store", {
      lastUpdatedAt: snapshot.generatedAt,
      staleAfterMs: 24 * 60 * 60_000,
      initialStatus: "live",
    }),
  ];

  return (
    <FeedHealthProvider serverNowISO={snapshot.generatedAt} feeds={feeds}>
      <ForesightShell
        snapshot={snapshot}
        activeScenarioKeys={activeScenarioKeys}
        calibrationRecords={[]}
        mockParam={mockParam}
      />
    </FeedHealthProvider>
  );
}

function parseScenarioKeys(value: string | undefined): ScenarioKind[] {
  if (!value) return [];
  const valid = new Set(Object.keys(SCENARIO_PRESETS));
  return value
    .split(",")
    .filter((key): key is ScenarioKind => valid.has(key));
}

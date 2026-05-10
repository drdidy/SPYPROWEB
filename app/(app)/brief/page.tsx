import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface BriefResponse {
  brief: string;
  source: "openai" | "engine" | "error";
  asOf?: string;
}

async function loadBrief(): Promise<BriefResponse> {
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (!host) return { brief: "", source: "error" };
    const proto =
      h.get("x-forwarded-proto") ||
      (host.startsWith("localhost") ? "http" : "https");
    const res = await fetch(`${proto}://${host}/api/spy/brief`, {
      cache: "no-store",
    });
    if (!res.ok) return { brief: "", source: "error" };
    return (await res.json()) as BriefResponse;
  } catch {
    return { brief: "", source: "error" };
  }
}

export default async function Page() {
  const [{ data: snap, source }, brief] = await Promise.all([
    loadLiveSnapshot(),
    loadBrief(),
  ]);
  const high = snap.pivots.find((p) => p.kind === "HIGH");
  const low = snap.pivots.find((p) => p.kind === "LOW");

  return (
    <div className="w-full max-w-[1120px] pb-16 space-y-8">
      <PageHeader
        eyebrow="Intelligence · 10"
        title="Daily Brief"
        lede="The day in plain English. Yesterday's close, what overnight did, where the day looks like it's leaning."
        source={source}
      />

      <SectionLabel number="01">Today, in one read</SectionLabel>
      <Card>
        <CardHeader
          eyebrow={brief.source === "openai" ? "Generated brief" : "Engine read"}
          title={
            snap.decision.verdict === "WAIT"
              ? "Waiting"
              : snap.decision.verdict === "STAND DOWN"
                ? "Standing down"
                : `Lean ${snap.decision.verdict.toLowerCase()}`
          }
          meta={snap.decision.windowET || undefined}
        />
        <CardBody>
          {brief.brief ? (
            <div className="text-[15px] text-ink-2 leading-relaxed space-y-4">
              {brief.brief.split(/\n\s*\n/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ) : (
            <p className="text-[15px] text-ink-2 leading-relaxed">
              {snap.decision.finalExplanation ||
                snap.bias.explanation ||
                "Engine is initializing today's read."}
            </p>
          )}
        </CardBody>
      </Card>

      <SectionLabel number="02">Anchors carried in</SectionLabel>
      <Card>
        <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Anchor kind="HIGH" pivot={high} />
          <Anchor kind="LOW" pivot={low} />
        </CardBody>
      </Card>

      <SectionLabel number="03">First lines to watch</SectionLabel>
      <Card>
        <CardBody>
          {snap.lines.length === 0 ? (
            <div className="text-[13px] text-ink-3">No lines resolved yet.</div>
          ) : (
            <ol className="space-y-3">
              {[...snap.lines]
                .sort(
                  (a, b) => Math.abs(a.distanceFromPrice) - Math.abs(b.distanceFromPrice),
                )
                .slice(0, 5)
                .map((l) => (
                  <li
                    key={l.name}
                    className="flex items-baseline justify-between text-[13px]"
                  >
                    <span className="font-mono text-ink">{l.name}</span>
                    <span className="font-mono tabular-nums text-ink-2">
                      {l.currentValue.toFixed(2)}{" "}
                      <span
                        className={
                          l.distanceFromPrice >= 0
                            ? "text-bull-ink"
                            : "text-bear-ink"
                        }
                      >
                        ({l.distanceFromPrice >= 0 ? "+" : ""}
                        {l.distanceFromPrice.toFixed(2)})
                      </span>
                    </span>
                  </li>
                ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Anchor({
  kind,
  pivot,
}: {
  kind: "HIGH" | "LOW";
  pivot: { price: number; time: string; source: string } | undefined;
}) {
  if (!pivot) {
    return (
      <div className="px-3 py-2 rounded-soft bg-paper-2">
        <div className="eyebrow text-ink-3">{kind}</div>
        <div className="text-[13px] text-ink-3 mt-1">No anchor resolved.</div>
      </div>
    );
  }
  return (
    <div className="px-3 py-2 rounded-soft bg-paper-2">
      <div className="eyebrow text-ink-3">{kind}</div>
      <div className="font-mono text-xl font-semibold tabular-nums text-ink mt-0.5">
        {pivot.price.toFixed(2)}
      </div>
      <div className="text-[11px] text-ink-3 mt-1">
        {new Date(pivot.time).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}{" "}
        · {pivot.source}
      </div>
    </div>
  );
}

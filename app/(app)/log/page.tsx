import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { loadLiveSnapshot } from "@/lib/snapshot-fetch";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FILTERS = ["All", "Trade", "Structure", "Risk", "Note"] as const;
type FilterName = (typeof FILTERS)[number];
type SignalTick = Awaited<
  ReturnType<typeof loadLiveSnapshot>
>["data"]["signalTicks"][number];
type Event = SignalTick & { category: Exclude<FilterName, "All"> };

export default async function Page({
  searchParams,
}: {
  searchParams?: { filter?: string };
}) {
  const { data, source } = await loadLiveSnapshot();
  const filter =
    FILTERS.find(
      (item) =>
        item.toLowerCase() ===
        String(searchParams?.filter ?? "all").toLowerCase(),
    ) ?? "All";
  const events = data.signalTicks.map((tick) => ({
    ...tick,
    category: category(tick),
  }));
  const visible =
    filter === "All"
      ? events
      : events.filter((event) => event.category === filter);

  return (
    <div>
      <header className="grid border-b border-carbon lg:grid-cols-[0.42fr_0.58fr]">
        <div className="flex flex-col justify-between bg-cobalt p-5 text-white md:p-10">
          <p className="microlabel">Journal / {source}</p>
          <div className="pt-14">
            <p className="num text-[72px] font-black leading-none md:text-[84px]">
              {events.length.toString().padStart(2, "0")}
            </p>
            <p className="microlabel mt-3 text-white">
              Qualified events today
            </p>
          </div>
        </div>
        <div className="p-5 py-10 md:p-10">
          <h1 className="max-w-[820px] text-[12vw] font-black leading-[0.88] tracking-[-0.01em] sm:text-[44px] md:text-[64px] xl:text-[82px]">
            Review every signal from the session.
          </h1>
          <p className="mt-7 max-w-[680px] text-[15px] leading-relaxed text-carbon/60">
            See trade alerts, level changes, risk warnings, and notes in time order. Open Replay when you need the candles behind an event.
          </p>
          <Link
            href="/replay"
            className="group mt-8 inline-flex h-11 items-center gap-2 bg-carbon px-4 text-[11px] font-black uppercase tracking-[0.1em] text-white transition-colors hover:bg-cobalt"
          >
            Open Replay
            <ArrowRight
              size={13}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </header>

      <nav
        className="flex overflow-x-auto border-b border-carbon bg-white"
        aria-label="Journal filters"
      >
        {FILTERS.map((item) => {
          const count =
            item === "All"
              ? events.length
              : events.filter((event) => event.category === item).length;
          return (
            <Link
              key={item}
              href={item === "All" ? "/log" : `/log?filter=${item}`}
              aria-current={filter === item ? "page" : undefined}
              className={cn(
                "flex h-14 min-w-[112px] items-center justify-center gap-2.5 border-r border-carbon/15 px-5 text-[11px] font-black uppercase tracking-[0.1em] transition-colors",
                filter === item ? "bg-lime" : "hover:bg-optic",
              )}
            >
              {item}
              <span
                className={cn(
                  "num text-[10px] font-bold",
                  filter === item ? "text-carbon/70" : "text-carbon/60",
                )}
              >
                {count.toString().padStart(2, "0")}
              </span>
            </Link>
          );
        })}
      </nav>

      {visible.length ? (
        <ol>
          {visible.map((event, index) => (
            <EventRow
              key={`${event.time}-${event.type}-${index}`}
              event={event}
              index={index}
            />
          ))}
        </ol>
      ) : (
        <section className="hatch-dark grid min-h-[430px] place-items-center p-8 text-center">
          <div>
            <span
              className="mx-auto grid h-10 w-10 place-items-center border border-carbon/25"
              aria-hidden="true"
            >
              <span className="h-1.5 w-1.5 bg-carbon/30" />
            </span>
            <h2 className="mt-6 text-[32px] font-black">No qualifying event was recorded.</h2>
            <p className="mt-3 text-[13px] text-carbon/65">
              The system did not record a trade, structure change, risk warning, or note for this filter.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function EventRow({ event, index }: { event: Event; index: number }) {
  return (
    <li className="grid border-b border-carbon/20 bg-optic transition-colors hover:bg-white md:grid-cols-[72px_120px_140px_1fr_120px]">
      <div className="num border-b border-carbon/15 p-4 text-[11px] font-bold text-carbon/60 md:border-b-0 md:border-r">
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="num border-b border-carbon/15 p-4 text-[11px] font-black md:border-b-0 md:border-r">
        {formatTime(event.time)}
      </div>
      <div className="border-b border-carbon/15 p-4 md:border-b-0 md:border-r">
        <span
          className={cn(
            "microlabel px-2 py-1",
            event.category === "Trade"
              ? "bg-lime"
              : event.category === "Risk"
                ? "bg-coral"
                : event.category === "Structure"
                  ? "bg-cobalt text-white"
                  : "bg-carbon text-white",
          )}
        >
          {event.category}
        </span>
      </div>
      <div className="p-4">
        <p className="text-[13px] font-bold">{event.body}</p>
        <p className="microlabel mt-2 text-carbon/60">
          {event.line ?? "No level"} / {event.type}
        </p>
      </div>
      <div className="flex items-center p-4">
        <Link
          href={`/replay?date=${encodeURIComponent(toDate(event.time))}`}
          className="microlabel inline-flex items-center gap-1.5 text-cobalt hover:underline"
        >
          Inspect <ArrowRight size={11} />
        </Link>
      </div>
    </li>
  );
}

function category(tick: SignalTick): Event["category"] {
  const type = String(tick.type ?? "").toUpperCase();
  const text = `${tick.body ?? ""} ${tick.line ?? ""}`.toLowerCase();
  if (type === "CALL" || type === "PUT") return "Trade";
  if (
    text.includes("risk") ||
    text.includes("chase") ||
    text.includes("stand down")
  )
    return "Risk";
  if (
    text.includes("line") ||
    text.includes("gate") ||
    text.includes("control") ||
    text.includes("break")
  )
    return "Structure";
  return "Note";
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        hour: "numeric",
        minute: "2-digit",
      }).format(date) + " CT"
    : value;
}

function toDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date)
    : "";
}

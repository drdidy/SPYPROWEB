"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const FRAME_DURATION_MS = 8500;

const frames = [
  {
    src: "/images/market-depth-trader-v1.png",
    eyebrow: "What the trader sees",
    title: "A chart shows what already happened.",
    body: "Each candle records where price traded. It does not tell you what to do next.",
  },
  {
    src: "/images/market-depth-candles-v1.png",
    eyebrow: "Inside the chart",
    title: "Buy and sell orders move price.",
    body: "More aggressive buying pushes price higher. More aggressive selling pushes it lower.",
  },
  {
    src: "/images/market-depth-bull-bear-v1.png",
    eyebrow: "Inside the move",
    title: "One side eventually takes control.",
    body: "SPY Prophet waits for price, trend, and key levels to confirm which side has control.",
  },
  {
    src: "/images/market-depth-exchange-v1.png",
    eyebrow: "At the center",
    title: "A trade begins only after confirmation.",
    body: "When the required conditions align, SPY Prophet gives one instruction: watch, get ready, enter, or exit.",
  },
] as const;

export function MarketDepthJourney() {
  const section = useRef<HTMLElement>(null);
  const inView = useInView(section, { amount: 0.45 });
  const reduced = Boolean(useReducedMotion());
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!inView || !playing || reduced) return;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % frames.length);
    }, FRAME_DURATION_MS);
    return () => window.clearInterval(timer);
  }, [inView, playing, reduced]);

  const frame = frames[active];

  return (
    <section ref={section} className="relative h-svh min-h-[640px] overflow-hidden border-b border-white/15 bg-carbon text-white">
      {frames.map((item, index) => {
        const visible = index === active;
        return (
          <motion.div
            key={item.src}
            className="absolute -inset-[5%]"
            initial={false}
            animate={{ opacity: visible ? 1 : 0, scale: visible && !reduced ? 1.15 : 1.02 }}
            transition={{
              opacity: { duration: reduced ? 0 : 2.4, ease: "easeInOut" },
              scale: { duration: reduced ? 0 : 10.5, ease: "linear" },
            }}
            aria-hidden="true"
          >
            <Image
              src={item.src}
              alt=""
              fill
              priority={index < 2}
              className="object-cover object-center"
              sizes="100vw"
            />
          </motion.div>
        );
      })}

      <div className="absolute inset-0 bg-gradient-to-r from-carbon/88 via-carbon/48 to-carbon/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-carbon/75 via-transparent to-carbon/20" />

      <div className="relative z-10 flex h-full items-end px-5 pb-28 md:px-9 md:pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={frame.src}
            className="max-w-[780px] border-l border-mineral/70 pl-5 md:pl-7"
            initial={reduced ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -18 }}
            transition={{ duration: reduced ? 0 : 1.2, ease: "easeOut" }}
            aria-live="polite"
          >
            <p className="microlabel text-mineral">0{active + 1} / {frame.eyebrow}</p>
            <h2 className="mt-5 text-[42px] font-black leading-[0.9] tracking-normal md:text-[70px] xl:text-[88px]">{frame.title}</h2>
            <p className="mt-5 max-w-[620px] text-[14px] font-semibold leading-relaxed text-white/75 md:text-[16px]">{frame.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-4 border-t border-white/20 bg-carbon/65 px-5 py-4 backdrop-blur-md md:px-9">
        <span className="microlabel hidden text-mineral sm:block">Inside the market</span>
        <div className="flex flex-1 items-center gap-2" aria-label="Cinematic scenes">
          {frames.map((item, index) => (
            <button
              key={item.src}
              type="button"
              onClick={() => setActive(index)}
              className="group relative h-7 flex-1"
              aria-label={`Show scene ${index + 1}: ${item.eyebrow}`}
              aria-current={index === active ? "step" : undefined}
            >
              <span className="absolute inset-x-0 top-1/2 h-px bg-white/25 transition-colors group-hover:bg-white/60" />
              {index === active && (
                <motion.span
                  key={`${active}-${playing}-${inView}`}
                  className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-mineral"
                  initial={{ scaleX: 0, transformOrigin: "left" }}
                  animate={{ scaleX: playing && inView && !reduced ? 1 : 0.15 }}
                  transition={{ duration: playing && inView && !reduced ? FRAME_DURATION_MS / 1000 : 0.3, ease: "linear" }}
                />
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPlaying((current) => !current)}
          className="grid size-10 shrink-0 place-items-center border border-white/30 text-white transition-colors hover:border-mineral hover:text-mineral"
          aria-label={playing ? "Pause cinematic sequence" : "Play cinematic sequence"}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
        </button>
      </div>
    </section>
  );
}

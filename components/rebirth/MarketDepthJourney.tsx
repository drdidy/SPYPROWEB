"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";

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
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  const journeyWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section ref={section} className="relative h-[420svh] border-b border-white/15 bg-carbon text-white">
      <div className="sticky top-0 h-svh overflow-hidden">
        {frames.map((frame, index) => (
          <DepthFrame key={frame.src} frame={frame} index={index} progress={scrollYProgress} reduced={Boolean(reduced)} />
        ))}
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-white/20 bg-carbon/65 px-5 py-4 backdrop-blur-md md:px-9">
          <span className="microlabel text-mineral">Scroll to look inside the market</span>
          <div className="h-px flex-1 bg-white/20" />
          <motion.span className="h-1.5 bg-mineral" style={{ width: journeyWidth }} />
        </div>
      </div>
    </section>
  );
}

function DepthFrame({
  frame,
  index,
  progress,
  reduced,
}: {
  frame: (typeof frames)[number];
  index: number;
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
  reduced: boolean;
}) {
  const start = index * 0.25;
  const center = start + 0.125;
  const end = start + 0.25;
  const opacity = useTransform(
    progress,
    index === 0 ? [0, center, end] : [Math.max(0, start - 0.035), start, center, end],
    index === 0 ? [1, 1, 0] : [0, 1, 1, index === frames.length - 1 ? 1 : 0],
  );
  const scale = useTransform(progress, [start, end], reduced ? [1, 1] : [1, 1.24]);
  const copyY = useTransform(progress, [start, center, end], reduced ? [0, 0, 0] : [30, 0, -24]);

  return (
    <motion.div className="absolute inset-0" style={{ opacity }}>
      <motion.div className="absolute -inset-[5%]" style={{ scale }}>
        <Image src={frame.src} alt="" fill priority={index === 0} className="object-cover object-center" sizes="100vw" />
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-r from-carbon/88 via-carbon/48 to-carbon/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-carbon/70 via-transparent to-carbon/20" />
      <motion.div className="relative z-10 flex h-full items-end px-5 pb-24 md:px-9 md:pb-28" style={{ y: copyY }}>
        <div className="max-w-[780px] border-l border-mineral/70 pl-5 md:pl-7">
          <p className="microlabel text-mineral">0{index + 1} / {frame.eyebrow}</p>
          <h2 className="mt-5 text-[42px] font-black leading-[0.9] tracking-normal md:text-[70px] xl:text-[88px]">{frame.title}</h2>
          <p className="mt-5 max-w-[620px] text-[14px] font-semibold leading-relaxed text-white/75 md:text-[16px]">{frame.body}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

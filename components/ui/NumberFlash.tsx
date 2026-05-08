"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function NumberFlash({
  value,
  className,
  format = (n: number) => n.toFixed(2),
}: {
  value: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const prev = useRef(value);
  const [dir, setDir] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (value > prev.current) setDir("up");
    else if (value < prev.current) setDir("down");
    prev.current = value;
    const t = setTimeout(() => setDir(null), 600);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <span
      data-num
      className={cn(
        "inline-block px-1 -mx-1 rounded-[3px]",
        className,
        dir === "up" && "animate-flash-up",
        dir === "down" && "animate-flash-down",
      )}
    >
      {format(value)}
    </span>
  );
}

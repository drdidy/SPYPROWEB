"use client";
import { Command } from "cmdk";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { navIndex } from "@/lib/mock-data";
import { ArrowRight, Layers } from "lucide-react";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const grouped = navIndex.reduce<Record<string, typeof navIndex>>((acc, i) => {
    (acc[i.group] ||= []).push(i);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center pt-[10vh] bg-ink/30 backdrop-blur-md"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-[600px] max-w-[92vw] rounded-card bg-paper shadow-[0_24px_64px_-16px_rgba(20,22,26,0.30)] overflow-hidden border border-rule"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command palette">
          <div className="border-b border-rule px-5">
            <Command.Input
              autoFocus
              placeholder="Search pages, levels, signals…"
              className="w-full h-14 bg-transparent outline-none text-[15px] text-ink placeholder:text-ink-4 font-medium"
            />
          </div>
          <Command.List className="max-h-[55vh] overflow-y-auto p-3">
            <Command.Empty className="px-3 py-6 text-center text-sm text-ink-3">
              No results.
            </Command.Empty>

            {Object.entries(grouped).map(([group, items]) => (
              <Command.Group
                key={group}
                heading={group}
                className="mb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:text-ink-3"
              >
                {items.map((item) => (
                  <Command.Item
                    key={item.href}
                    value={item.label}
                    onSelect={() => {
                      onOpenChange(false);
                      router.push(item.href);
                    }}
                    className="flex items-center gap-3 px-3 h-9 rounded-soft cursor-pointer text-sm text-ink-2 aria-selected:bg-paper-2 aria-selected:text-ink"
                  >
                    <Layers size={13} className="text-ink-4" />
                    <span className="flex-1">{item.label}</span>
                    <span className="text-[10px] text-ink-4 font-mono">{item.href}</span>
                    <ArrowRight size={12} className="text-ink-4 opacity-0 aria-selected:opacity-100" />
                  </Command.Item>
                ))}
              </Command.Group>
            ))}

          </Command.List>
          <div className="border-t border-rule px-4 h-9 flex items-center justify-between text-[10px] text-ink-3">
            <span className="flex items-center gap-2">
              <span className="font-mono">↑↓</span> navigate
              <span className="font-mono ml-2">↵</span> open
              <span className="font-mono ml-2">esc</span> close
            </span>
            <span className="font-mono uppercase tracking-[0.14em]">Prophet</span>
          </div>
        </Command>
      </div>
    </div>
  );
}

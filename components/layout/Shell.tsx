import { ProphetHeader } from "@/components/layout/ProphetHeader";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#0a0d0f] text-carbon">
      <ProphetHeader />
      <main className="min-w-0 flex-1 overflow-x-clip">{children}</main>
      <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/[0.08] bg-[#080b0d] px-5 py-4 text-optic md:px-8">
        <p className="microlabel text-white/40">SPY Prophet / Chicago</p>
        <p className="microlabel ml-auto text-white/35">Decision support, not financial advice</p>
      </footer>
    </div>
  );
}

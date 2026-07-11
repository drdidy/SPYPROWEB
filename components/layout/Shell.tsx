import { ProphetHeader } from "@/components/layout/ProphetHeader";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-optic text-carbon">
      <ProphetHeader />
      <main className="min-w-0 flex-1 overflow-x-clip">{children}</main>
      <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-carbon bg-carbon px-5 py-3 text-optic md:px-8">
        <p className="microlabel text-white/55">SPY Prophet / operating workspace</p>
        <p className="microlabel ml-auto text-white/55">Decision support, not financial advice</p>
      </footer>
    </div>
  );
}

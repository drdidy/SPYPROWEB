import { ReplayWorkspace } from "@/components/replay/ReplayWorkspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  searchParams?: { date?: string };
}

export default function Page({ searchParams }: PageProps) {
  const initialDate =
    searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
      ? searchParams.date
      : null;

  return (
    <div className="w-full max-w-[1600px] pb-10">
      <ReplayWorkspace initialDate={initialDate} />
    </div>
  );
}

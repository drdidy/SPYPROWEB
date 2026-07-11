import { ReplayLab } from "@/components/rebirth/ReplayLab";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page({ searchParams }: { searchParams?: { date?: string } }) {
  const initialDate = searchParams?.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : null;
  return <ReplayLab initialDate={initialDate} />;
}

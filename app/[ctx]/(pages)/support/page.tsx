import type { SupportTab } from "@/components/support/SupportCenter";
import SupportCenter from "@/components/support/SupportCenter";

export const dynamic = "force-dynamic";

const TABS: SupportTab[] = ["ticket", "meeting", "chat"];

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = firstValue(params.tab);
  const initialTab = TABS.find((tab) => tab === requested);
  return <SupportCenter initialTab={initialTab} />;
}

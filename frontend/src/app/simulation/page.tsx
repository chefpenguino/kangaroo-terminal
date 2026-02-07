import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import SimulationClient from "./SimulationClient";
import { API_URL } from "@/lib/api";

export const dynamic = "force-dynamic";

async function getSimulationData(ticker: string) {
  try {
    const res = await fetch(`${API_URL}/stock/${ticker}/history?period=2y`, { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

async function SimulationContent({ ticker }: { ticker: string }) {
    const history = await getSimulationData(ticker);
    return (
        <SimulationClient 
            ticker={ticker}
            initialHistory={history} 
        />
    )
}

export default async function SimulationPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const params = await searchParams;
  const ticker = params.ticker || "BHP";
  
  return (
    <Suspense key={ticker} fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={32} /></div>}>
        <SimulationContent ticker={ticker} />
    </Suspense>
  );
}

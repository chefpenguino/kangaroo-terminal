import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import ScreenerClient from "./ScreenerClient";
import { API_URL } from "@/lib/api";

export const dynamic = "force-dynamic";

async function getScreenerData() {
  try {
    const [moversRes, mapRes] = await Promise.all([
      fetch(`${API_URL}/market-movers`, { cache: "no-store" }),
      fetch(`${API_URL}/sector-performance`, { next: { revalidate: 600 } }) 
    ]);

    return {
      movers: await moversRes.json(),
      marketMap: await mapRes.json()
    };
  } catch (e) { 
    return null; 
  }
}

async function ScreenerContent() {
  const data = await getScreenerData();
  
  return (
    <ScreenerClient 
      initialMovers={data?.movers || null}
      initialMarketMap={data?.marketMap || []}
    />
  );
}

export default function ScreenerPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={32} /></div>}>
        <ScreenerContent />
    </Suspense>
  );
}

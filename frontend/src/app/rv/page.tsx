import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import RVClient from "./RVClient";

async function getRVData() {
  const API_URL = "http://localhost:8000";
  try {
    const sectorsRes = await fetch(`${API_URL}/analysis/sectors`, { cache: "no-store" });
    const sectors = await sectorsRes.json();
    return { sectors };
  } catch (e) {
    console.error("failed to fetch RV data:", e);
    return { sectors: [] };
  }
}

async function RVContent() {
  const data = await getRVData();
  return <RVClient initialSectors={data.sectors} />;
}

export default function RVPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    }>
      <RVContent />
    </Suspense>
  );
}

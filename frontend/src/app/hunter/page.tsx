import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import HunterClient from "./HunterClient";
import { API_URL } from "@/lib/api";

export const dynamic = "force-dynamic";

async function getScanResults() {
  try {
    const res = await fetch(`${API_URL}/scanner/run`, { cache: "no-store" });
    return await res.json();
  } catch (e) {
    console.error(e);
    return [];
  }
}

async function HunterContent() {
  const results = await getScanResults();

  return (
    <HunterClient initialResults={results} />
  );
}

export default function HunterPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={32} /></div>}>
        <HunterContent />
    </Suspense>
  );
}

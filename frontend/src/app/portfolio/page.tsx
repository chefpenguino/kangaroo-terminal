import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import PortfolioClient from "./PortfolioClient";
import { API_URL } from "@/lib/api";

export const dynamic = "force-dynamic";

async function getPortfolioData() {
    try {
        const [portRes, accRes, analyticsRes, riskRes, benchmarkRes, ordersRes] = await Promise.all([
            fetch(`${API_URL}/portfolio`, { cache: "no-store" }),
            fetch(`${API_URL}/account`, { cache: "no-store" }),
            fetch(`${API_URL}/portfolio/analytics`, { cache: "no-store" }),
            fetch(`${API_URL}/portfolio/risk`, { cache: "no-store" }),
            fetch(`${API_URL}/portfolio/benchmark`, { cache: "no-store" }),
            fetch(`${API_URL}/orders/pending`, { cache: "no-store" })
        ]);

        return {
            holdings: await portRes.json(),
            account: await accRes.json(),
            analytics: await analyticsRes.json(),
            risk: await riskRes.json(),
            benchmark: await benchmarkRes.json(),
            orders: await ordersRes.json()
        };
    } catch (e) {
        console.error("Portfolio fetch failed", e);
        return null;
    }
}

async function PortfolioContent() {
    const data = await getPortfolioData();

    return (
        <PortfolioClient
            initialHoldings={data?.holdings || []}
            initialAccount={data?.account || null}
            initialAnalytics={data?.analytics || []}
            initialRisk={data?.risk || null}
            initialBenchmark={data?.benchmark || null}
            initialOrders={data?.orders || []}
        />
    );
}

export default function PortfolioPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-64">
                <Loader2 className="animate-spin text-primary" size={32} />
            </div>
        }>
            <PortfolioContent />
        </Suspense>
    );
}

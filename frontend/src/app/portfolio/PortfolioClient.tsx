"use client";
import { useEffect, useState } from "react";
import { Loader2, XCircle, TrendingUp, TrendingDown, Wallet, ShieldCheck, Activity, PieChart as PieIcon, AlertTriangle, Target, X } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as ReTooltip, PieChart, Pie, Cell } from "recharts";
import Link from "next/link";

const RiskGauge = ({ beta }: { beta: number }) => {
    const safeBeta = typeof beta === 'number' && !isNaN(beta) ? beta : 0;
    const displayBeta = Math.max(0, Math.min(safeBeta, 3));
    const rotation = (displayBeta / 3) * 180;
    const color = safeBeta > 1.3 ? "#ef4444" : safeBeta < 0.8 ? "#3b82f6" : "#22c5e";

    return (
        <div className="relative w-40 h-20 flex items-end justify-center overflow-hidden">
            <div className="absolute w-32 h-32 rounded-full border-10 border-white/5 border-b-0 border-r-0 border-l-0" style={{ clipPath: 'inset(0 0 50% 0)' }}></div>
            <svg className="w-32 h-32 absolute top-0" viewBox="0 0 100 100">
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="white" strokeOpacity="0.05" strokeWidth="10" strokeLinecap="round" />
                <path
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray="126"
                    strokeDashoffset={126 - (126 * (rotation / 180))}
                    className="transition-all duration-1000 ease-out"
                />
            </svg>
            <div className="text-center z-10 -mb-1">
                <span className="text-2xl font-bold text-white font-mono">{safeBeta}</span>
                <span className="text-[10px] text-gray-500 font-bold ml-1">β</span>
            </div>
        </div>
    );
};

interface PortfolioClientProps {
    initialHoldings: any[];
    initialAccount: any;
    initialAnalytics: any[];
    initialRisk: any;
    initialBenchmark: any;
    initialOrders: any[];
}

export default function PortfolioClient({
    initialHoldings,
    initialAccount,
    initialAnalytics,
    initialRisk,
    initialBenchmark,
    initialOrders
}: PortfolioClientProps) {
    const [holdings, setHoldings] = useState<any[]>(initialHoldings);
    const [analytics, setAnalytics] = useState<any[]>(initialAnalytics);
    const [account, setAccount] = useState<any>(initialAccount);
    const [riskData, setRiskData] = useState<any>(initialRisk);
    const [benchmarkData, setBenchmarkData] = useState<any>(initialBenchmark);
    const [orders, setOrders] = useState<any[]>(initialOrders);
    const [loading, setLoading] = useState(true);

    const cleanName = (name: string, ticker: string) => {
        if (!name) return ticker;
        if (name.toUpperCase().startsWith(ticker.toUpperCase())) {
            return name.slice(ticker.length).trim();
        }
        return name;
    };

    // stats
    const totalStockValue = holdings.reduce((sum: any, h: any) => sum + h.market_value, 0);
    const totalPnL = (account?.total_equity || 0) - 100000;
    const totalPnLPercent = (totalPnL / 100000) * 100;

    const fetchPortfolio = async () => {
        try {
            const [portRes, accRes, analyticsRes, riskRes, benchRes, ordersRes] = await Promise.all([
                fetch("http://localhost:8000/portfolio"),
                fetch("http://localhost:8000/account"),
                fetch("http://localhost:8000/portfolio/analytics"),
                fetch("http://localhost:8000/portfolio/risk"),
                fetch("http://localhost:8000/portfolio/benchmark"),
                fetch("http://localhost:8000/orders/pending")
            ]);

            setHoldings(await portRes.json());
            setAccount(await accRes.json());
            setAnalytics(await analyticsRes.json());
            setRiskData(await riskRes.json());
            setBenchmarkData(await benchRes.json());
            setOrders(await ordersRes.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        // initial fetch handled by server component
        const interval = setInterval(fetchPortfolio, 3000);
        return () => clearInterval(interval);
    }, []);

    const cancelOrder = async (orderId: number) => {
        try {
            const res = await fetch(`http://localhost:8000/orders/cancel/${orderId}`, { method: "DELETE" });
            if (res.ok) fetchPortfolio();
        } catch (e) { console.error(e); }
    };

    const closePosition = async (ticker: string, shares: number, price: number) => {
        if (!confirm(`Close ${ticker}?`)) return;
        setLoading(true);
        try {
            const res = await fetch("http://localhost:8000/trade", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ticker, shares, price, type: "SELL" })
            });
            if (res.ok) fetchPortfolio();
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    return (
        <div className="animate-in fade-in duration-500 space-y-6 pb-20">

            {/* header */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-4xl text-white font-instrument">Portfolio</h1>
                    <p className="text-sm text-gray-500">Asset allocation & risk metrics.</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-gray-600 uppercase font-bold tracking-wider">Buying Power</p>
                    <p className="text-xl font-mono text-primary">${account?.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
            </div>

            {/* row 1: net worth (full width) */}
            <div className="luxury-card p-8 rounded-2xl relative overflow-hidden group">
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-end gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-white/5 rounded-lg border border-white/5 text-gray-500">
                                <Wallet size={20} />
                            </div>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Net Liquidation Value</span>
                        </div>

                        <div className="flex items-center gap-4">
                            <h2 className="text-6xl text-white font-instrument tracking-tight">
                                ${account?.total_equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </h2>
                            <div className={`px-3 py-1 rounded-full border text-sm font-bold flex items-center gap-1 ${totalPnL >= 0 ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                                {totalPnL >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                {totalPnL > 0 ? "+" : ""}{totalPnLPercent.toFixed(2)}%
                            </div>
                        </div>
                    </div>

                    {/* asset bar */}
                    <div className="w-full md:w-1/3">
                        <div className="flex justify-between text-[12px] uppercase font-bold text-gray-500 mb-2">
                            <span>Asset Mix</span>
                            <span>{Math.round((totalStockValue / (account?.total_equity || 1)) * 100)}% Invested</span>
                        </div>
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden flex">
                            <div className="h-full bg-primary" style={{ width: `${(account?.cash / account?.total_equity) * 100}%` }} />
                            <div className="h-full bg-[#3B82F6]" style={{ width: `${(totalStockValue / account?.total_equity) * 100}%` }} />
                        </div>
                        <div className="flex justify-between mt-2 text-xs font-mono text-gray-400">
                            <span className="text-primary flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary"></div> Cash</span>
                            <span className="text-[#3B82F6] flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#3B82F6]"></div> Stocks</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* holdings & orders table */}
            <div className="luxury-card rounded-2xl overflow-hidden border border-white/5">
                <div className="p-4 border-b border-white/5 bg-[#15100d] flex justify-between items-center">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide pl-2">Portfolio Activity</h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/5 text-[10px] text-gray-500 uppercase tracking-wider">
                                <th className="p-4 font-medium">Asset</th>
                                <th className="p-4 font-medium">Status / Type</th>
                                <th className="p-4 font-medium text-right">Qty</th>
                                <th className="p-4 font-medium text-right">Basis / Limit</th>
                                <th className="p-4 font-medium text-right">Price</th>
                                <th className="p-4 font-medium text-right">Value</th>
                                <th className="p-4 font-medium text-right">Return / Status</th>
                                <th className="p-4 font-medium text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {/* regular holdings */}
                            {holdings.map((h) => (
                                <tr key={`holding-${h.id}`} className="hover:bg-white/10 transition-colors group">
                                    <td className="p-4 border-l-2 border-blue-500/30">
                                        <Link href={`/stock/${h.ticker}`} className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-white p-px shadow-sm">
                                                <img
                                                    src={`https://files.marketindex.com.au/xasx/96x96-png/${h.ticker.toLowerCase()}.png`}
                                                    className="w-full h-full rounded-full object-cover"
                                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                                />
                                            </div>
                                            <div>
                                                <span className="block font-bold text-white text-sm group-hover:text-primary transition-colors">{h.ticker}</span>
                                                <span className="block text-[10px] text-gray-500">{cleanName(h.name, h.ticker)}</span>
                                            </div>
                                        </Link>
                                    </td>
                                    <td className="p-4">
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                                            Position
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-mono text-gray-400 text-sm">{h.shares}</td>
                                    <td className="p-4 text-right font-mono text-primary font-bold text-sm">${h.avg_cost.toFixed(2)}</td>
                                    <td className="p-4 text-right font-mono text-white text-sm">${h.current_price.toFixed(2)}</td>
                                    <td className="p-4 text-right font-mono text-white font-bold text-sm">${h.market_value.toLocaleString()}</td>
                                    <td className="p-4 text-right">
                                        <div className={`flex flex-col items-end ${h.pnl >= 0 ? "text-success" : "text-danger"}`}>
                                            <span className="font-bold text-sm">
                                                {h.pnl > 0 ? "+" : ""}{h.pnl.toLocaleString()}
                                            </span>
                                            <span className="text-[10px] opacity-80">
                                                {h.pnl_percent.toFixed(2)}%
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <button
                                            onClick={() => closePosition(h.ticker, h.shares, h.current_price)}
                                            className="p-2 bg-white/5 hover:bg-red-500/10 text-gray-500 hover:text-red-500 rounded-lg transition-all"
                                            title="Close Position"
                                        >
                                            <X size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}

                            {/* pending orders */}
                            {[...orders].sort((a, b) => {
                                if (a.order_type === 'STOP_LOSS' && b.order_type !== 'STOP_LOSS') return -1;
                                if (a.order_type !== 'STOP_LOSS' && b.order_type === 'STOP_LOSS') return 1;
                                return 0;
                            }).map((order) => (
                                <tr key={`order-${order.id}`} className="hover:bg-white/10 transition-colors group">
                                    <td className="p-4 border-l-2 border-primary/30">
                                        <Link href={`/stock/${order.ticker}`} className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-white p-px shadow-sm">
                                                <img
                                                    src={`https://files.marketindex.com.au/xasx/96x96-png/${order.ticker.toLowerCase()}.png`}
                                                    className="w-full h-full rounded-full object-cover"
                                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                                />
                                            </div>
                                            <div>
                                                <span className="block font-bold text-white text-sm group-hover:text-primary transition-colors">{order.ticker}</span>
                                                <span className="block text-[10px] text-gray-500">{cleanName(order.name, order.ticker)}</span>
                                            </div>
                                        </Link>
                                    </td>
                                    <td className="p-4">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${order.order_type === 'LIMIT_BUY' ? 'bg-success/10 text-success border-success/20' :
                                            order.order_type === 'LIMIT_SELL' ? 'bg-primary/10 text-primary border-primary/20' :
                                                'bg-danger/10 text-danger border-danger/20'
                                            }`}>
                                            {order.order_type.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-mono text-gray-400 text-sm">{order.shares}</td>
                                    <td className="p-4 text-right">
                                        <div className="flex flex-col items-end">
                                            <span className="font-mono text-primary text-sm font-bold">${order.limit_price.toFixed(2)}</span>
                                            {order.order_type === 'STOP_LOSS' && order.avg_cost > 0 && (
                                                <span className="text-[10px] text-gray-500 font-mono">Entry: ${order.avg_cost.toFixed(2)}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right font-mono text-white text-sm">${order.current_price.toFixed(2)}</td>
                                    <td className="p-4 text-right font-mono text-white/50 text-sm">${(order.shares * order.current_price).toLocaleString()}</td>
                                    <td className="p-4 text-right">
                                        <div className="flex flex-col items-end">
                                            {order.order_type === 'STOP_LOSS' && order.avg_cost > 0 ? (
                                                <div className={`flex flex-col items-end ${order.current_price >= order.avg_cost ? "text-success" : "text-danger"}`}>
                                                    <span className="font-bold text-sm">
                                                        {order.current_price >= order.avg_cost ? "+" : ""}{((order.current_price - order.avg_cost) * order.shares).toLocaleString()}
                                                    </span>
                                                    <span className="text-[10px] opacity-80">
                                                        {((order.current_price - order.avg_cost) / order.avg_cost * 100).toFixed(2)}%
                                                    </span>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${order.order_type === 'STOP_LOSS' ? 'text-danger/70' : 'text-gray-500'
                                                        }`}>
                                                        {order.order_type === 'STOP_LOSS' ? 'PROTECTION ACTIVE' : 'WAITING FOR FILL'}
                                                    </span>
                                                    {order.order_type === 'LIMIT_BUY' && order.current_price <= order.limit_price && (
                                                        <span className="text-[9px] text-success animate-pulse">MATCHING...</span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <button
                                            onClick={() => cancelOrder(order.id)}
                                            className="p-2 bg-white/5 hover:bg-red-500/10 text-gray-500 hover:text-red-500 rounded-lg transition-all"
                                            title="Cancel Order"
                                        >
                                            <X size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}

                            {holdings.length === 0 && orders.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-20 text-center text-gray-600 italic">
                                        No active positions or pending orders.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* row 2: analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* left: sector allocation */}
                <div className="luxury-card p-8 rounded-2xl flex flex-col justify-between min-h-80">
                    <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-4">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Sector Exposure</h3>
                        <PieIcon size={18} className="text-gray-500" />
                    </div>

                    <div className="flex items-center justify-between h-full gap-8">
                        {/* chart */}
                        <div className="relative w-56 h-56 shrink-0">
                            {analytics.length > 0 && (
                                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                    <PieChart>
                                        <Pie
                                            data={analytics}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={50} // thicker donut
                                            outerRadius={75} // bigger donut
                                            paddingAngle={4}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {analytics.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={["#C68E56", "#4E9F76", "#D65A5A", "#5E4B3E"][index % 4]} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                            {/* inner label */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col">
                                <span className="text-[10px] text-gray-500 uppercase font-bold">Positions</span>
                                <span className="text-3xl font-bold text-white font-instrument">{holdings.length}</span>
                            </div>
                        </div>

                        {/* list legend */}
                        <div className="flex-1 space-y-4 overflow-y-auto max-h-55 custom-scrollbar pr-2">
                            {analytics.map((item, index) => (
                                <div key={item.name} className="flex justify-between items-center border-b border-white/5 pb-2 last:border-0 last:pb-0 group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: ["#C68E56", "#4E9F76", "#D65A5A", "#5E4B3E"][index % 4] }}></div>
                                        <span className="text-gray-300 font-medium text-sm truncate max-w-35 group-hover:text-white transition-colors">{item.name}</span>
                                    </div>
                                    <span className="font-mono font-bold text-white text-sm">{Math.round(item.percent)}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* risk profile */}
                <div className="luxury-card p-8 rounded-2xl flex flex-col min-h-80">
                    <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Risk Analysis</h3>
                        <Activity size={18} className="text-gray-500" />
                    </div>

                    {riskData ? (
                        <div className="flex-1 grid grid-cols-2 gap-8 divide-x divide-white/5">

                            {/* volatility gauge */}
                            <div className="flex flex-col items-center justify-center text-center">
                                <RiskGauge beta={riskData.portfolio_beta} />
                                <div className="mt-4">
                                    <p className={`text-lg font-bold ${riskData.portfolio_beta > 1.2 ? "text-red-400" : riskData.portfolio_beta < 0.8 ? "text-blue-400" : "text-green-400"}`}>
                                        {riskData.risk_level} Volatility
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1 max-w-45 mx-auto leading-relaxed">
                                        {riskData.portfolio_beta > 1
                                            ? "Your portfolio swings wider than the ASX 200."
                                            : "Your portfolio is more stable than the market."}
                                    </p>
                                </div>
                            </div>

                            {/* concentration details */}
                            <div className="flex flex-col justify-center pl-2">
                                {(() => {
                                    const correlations = riskData.correlation_matrix?.filter((c: any) => c.x !== c.y) || [];
                                    const maxCorr = correlations.length > 0 ? Math.max(...correlations.map((c: any) => c.value)) : 0;

                                    // 1. CRITICAL (> 85%)
                                    if (maxCorr > 0.85) {
                                        return (
                                            <div className="space-y-4 animate-in fade-in">
                                                <div className="flex items-start gap-3 text-red-500">
                                                    <AlertTriangle size={24} className="shrink-0 mt-0.5 animate-pulse" />
                                                    <div>
                                                        <span className="font-bold text-sm block mb-1">Critical Overlap</span>
                                                        <p className="text-[12px] text-red-400/70 leading-tight">
                                                            Extreme correlation detected. Your assets are effectively moving as one unit.
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    {correlations.filter((c: any) => c.value > 0.85).slice(0, 3).map((c: any, i: number) => (
                                                        <div key={i} className="flex justify-between items-center text-xs bg-red-500/10 p-2 rounded border border-red-500/20">
                                                            <div className="flex gap-2 font-bold text-white"><span>{c.x}</span><span className="text-gray-500">&</span><span>{c.y}</span></div>
                                                            <span className="font-mono text-red-400 font-bold">{c.value.toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    // 2. WARNING (> 60%)
                                    else if (maxCorr > 0.6) {
                                        return (
                                            <div className="space-y-4 animate-in fade-in">
                                                <div className="flex items-start gap-3 text-orange-400">
                                                    <AlertTriangle size={24} className="shrink-0 mt-0.5" />
                                                    <div>
                                                        <span className="font-bold text-sm block mb-1">Concentration Warning</span>
                                                        <p className="text-[12px] text-orange-400/70 leading-tight">
                                                            High correlation &gt; 60%. Consider diversifying sector exposure.
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    {correlations.filter((c: any) => c.value > 0.6).slice(0, 3).map((c: any, i: number) => (
                                                        <div key={i} className="flex justify-between items-center text-xs bg-orange-500/5 p-2 rounded border border-orange-500/10">
                                                            <div className="flex gap-2 font-bold text-white"><span>{c.x}</span><span className="text-gray-500">&</span><span>{c.y}</span></div>
                                                            <span className="font-mono text-orange-400 font-bold">{c.value.toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    // 3. HEALTHY
                                    else {
                                        return (
                                            <div className="text-center h-full flex flex-col items-center justify-center animate-in fade-in">
                                                <div className="inline-flex p-4 bg-green-500/10 rounded-full text-green-500 mb-3 border border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
                                                    <ShieldCheck size={32} />
                                                </div>
                                                <p className="text-green-400 font-bold text-base">System Healthy</p>
                                                <p className="text-xs text-gray-500 mt-2 leading-relaxed max-w-50">
                                                    {maxCorr > 0.4 ? "Moderate correlations detected, but within safe parameters." : "No meaningful correlations. Assets are diversified."}
                                                </p>
                                            </div>
                                        );
                                    }
                                })()}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-primary">
                            <Loader2 className="animate-spin" size={32} />
                            <p className="text-xs text-stone-500 animate-pulse">Running Monte Carlo Simulations...</p>
                        </div>
                    )}
                </div>

            </div>

            {/* benchmark (time machine) */}
            <div className="luxury-card p-6 rounded-2xl border border-white/5 relative overflow-hidden">
                {benchmarkData && !benchmarkData.error ? (
                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* left: performance chart */}
                        <div className="flex-1 h-72">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                                    Performance vs Benchmark <span className="text-primary">(1Y)</span>
                                </h3>
                                <div className="flex items-center gap-4 text-xs">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-0.5 bg-primary"></div>
                                        <span className="text-primary font-bold">You</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-0.5 bg-gray-500"></div>
                                        <span className="text-gray-500 font-bold">ASX 200</span>
                                    </div>
                                </div>
                            </div>
                            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                <AreaChart data={benchmarkData.history}>
                                    <defs>
                                        <linearGradient id="colorPort" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#C68E56" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#C68E56" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis
                                        dataKey="time"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fill: '#666' }}
                                        minTickGap={30}
                                        tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short' })}
                                    />
                                    <YAxis
                                        domain={['auto', 'auto']}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fill: '#666' }}
                                        tickFormatter={(val) => `${val}`}
                                    />
                                    <ReTooltip
                                        contentStyle={{ backgroundColor: '#0F0B08', borderColor: 'rgba(255,255,255,0.1)', fontSize: '12px' }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="benchmark"
                                        stroke="#555"
                                        strokeWidth={2}
                                        fill="transparent"
                                        dot={false}
                                        name="ASX 200"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="portfolio"
                                        stroke="#C68E56"
                                        strokeWidth={2}
                                        fill="url(#colorPort)"
                                        dot={false}
                                        name="You"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        {/* right: scorecard */}
                        <div className="w-full lg:w-1/3 flex flex-col justify-center border-l border-white/5 pl-8">
                            {benchmarkData.metrics && (
                                <div className="space-y-6">

                                    {/* alpha */}
                                    <div>
                                        <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Alpha (Edge)</span>
                                        <div className={`text-4xl font-instrument ${benchmarkData.metrics.alpha >= 0 ? "text-green-400" : "text-red-400"}`}>
                                            {benchmarkData.metrics.alpha > 0 ? "+" : ""}{benchmarkData.metrics.alpha}%
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {benchmarkData.metrics.alpha > 0 ? "You are beating the market." : "You are trailing the index."}
                                        </p>
                                    </div>

                                    {/* grid stats */}
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                        <div>
                                            <span className="text-[10px] text-gray-500 uppercase font-bold">Sharpe Ratio</span>
                                            <p className="text-xl font-mono text-white">{benchmarkData.metrics.sharpe}</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-500 uppercase font-bold">Annual Volatility</span>
                                            <p className="text-xl font-mono text-white">{benchmarkData.metrics.volatility}%</p>
                                        </div>
                                    </div>

                                    <div className="bg-white/5 rounded-lg p-3 text-xs text-gray-400 leading-relaxed border border-white/5">
                                        <span className="text-primary font-bold">Time Machine:</span> This simulation assumes you held your current portfolio weights constantly for the past year (daily rebalancing).
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-gray-500">
                        <Loader2 className="animate-spin mb-2" size={24} />
                        <p className="text-sm">Calibrating Time Machine...</p>
                    </div>
                )}
            </div>
        </div >
    );
}
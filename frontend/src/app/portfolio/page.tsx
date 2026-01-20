"use client";
import { useEffect, useState } from "react";
import { Loader2, XCircle, TrendingUp, TrendingDown, Wallet, ShieldCheck, Activity, PieChart as PieIcon, AlertTriangle } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from "recharts";
import Link from "next/link";

const RiskGauge = ({ beta }: { beta: number }) => {
    const displayBeta = Math.max(0, Math.min(beta, 3));
    const rotation = (displayBeta / 3) * 180;
    const color = beta > 1.3 ? "#ef4444" : beta < 0.8 ? "#3b82f6" : "#22c55e";

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
                <span className="text-2xl font-bold text-white font-mono">{beta}</span>
                <span className="text-[10px] text-gray-500 font-bold ml-1">β</span>
            </div>
        </div>
    );
};

export default function PortfolioPage() {
    const [holdings, setHoldings] = useState<any[]>([]);
    const [analytics, setAnalytics] = useState<any[]>([]);
    const [account, setAccount] = useState<any>(null);
    const [riskData, setRiskData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    
    // stats
    const totalStockValue = holdings.reduce((sum, h) => sum + h.market_value, 0);
    const totalPnL = (account?.total_equity || 0) - 100000;
    const totalPnLPercent = (totalPnL / 100000) * 100;

    const fetchPortfolio = async () => {
        try {
            const [portRes, accRes, analyticsRes, riskRes] = await Promise.all([
                    fetch("http://localhost:8000/portfolio"),
                    fetch("http://localhost:8000/account"),
                    fetch("http://localhost:8000/portfolio/analytics"),
                    fetch("http://localhost:8000/portfolio/risk")
            ]);
            
            setHoldings(await portRes.json());
            setAccount(await accRes.json());
            setAnalytics(await analyticsRes.json());
            setRiskData(await riskRes.json());
        } catch (e) { console.error(e); } 
        finally { setLoading(false); }
    };

    useEffect(() => {
        fetchPortfolio();
        const interval = setInterval(fetchPortfolio, 3000); 
        return () => clearInterval(interval);
    }, []);

    const closePosition = async (ticker: string, shares: number, price: number) => {
        if(!confirm(`Close ${ticker}?`)) return;
        setLoading(true);
        try {
            const res = await fetch("http://localhost:8000/trade", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ticker, shares, price, type: "SELL" })
            });
            if (res.ok) fetchPortfolio();
        } catch(e) { console.error(e); } 
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
             <p className="text-xl font-mono text-primary">${account?.cash.toLocaleString(undefined, {maximumFractionDigits:0})}</p>
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
                        <ResponsiveContainer width="100%" height="100%">
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
                        {riskData.correlation_matrix.some((c:any) => c.value > 0.7) ? (
                            <div className="space-y-4">
                                <div className="flex items-start gap-3 text-red-400">
                                    <AlertTriangle size={24} className="shrink-0 mt-0.5" />
                                    <div>
                                        <span className="font-bold text-sm block mb-1">Concentration Alert</span>
                                        <p className="text-[12px] text-red-400/70 leading-tight">
                                            The following assets move together &gt; 70% of the time. Diversification is low.
                                        </p>
                                    </div>
                                </div>

                                {/* offenders */}
                                <div className="space-y-2">
                                    {riskData.correlation_matrix
                                        .filter((c: any) => c.x !== c.y && c.value > 0.7)
                                        .slice(0, 3) // top 3 offenders
                                        .map((c: any, i: number) => (
                                        <div key={i} className="flex justify-between items-center text-xs bg-red-500/5 p-2 rounded border border-red-500/10 hover:bg-red-500/10 transition-colors">
                                            <div className="flex gap-2">
                                                <span className="font-bold text-white">{c.x}</span>
                                                <span className="text-gray-500">&</span>
                                                <span className="font-bold text-white">{c.y}</span>
                                            </div>
                                            <span className="font-mono text-red-400 font-bold">{c.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            // healthy state
                            <div className="text-center h-full flex flex-col items-center justify-center">
                                <div className="inline-flex p-4 bg-green-500/10 rounded-full text-green-500 mb-3 border border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
                                    <ShieldCheck size={32} />
                                </div>
                                <p className="text-green-400 font-bold text-base">System Healthy</p>
                                <p className="text-xs text-gray-500 mt-2 leading-relaxed max-w-50">
                                    No high correlations detected. Your assets are moving independently.
                                </p>
                            </div>
                        )}
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

      {/* holdings table */}
      <div className="luxury-card rounded-2xl overflow-hidden min-h-100 border border-white/5">
        <div className="p-4 border-b border-white/5 bg-[#15100d] flex justify-between items-center">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide pl-2">Open Positions</h3>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-white/5 text-[10px] text-gray-500 uppercase tracking-wider">
                        <th className="p-4 font-medium">Asset</th>
                        <th className="p-4 font-medium text-right">Qty</th>
                        <th className="p-4 font-medium text-right">Avg Cost</th>
                        <th className="p-4 font-medium text-right">Price</th>
                        <th className="p-4 font-medium text-right">Market Value</th>
                        <th className="p-4 font-medium text-right">Return</th>
                        <th className="p-4 font-medium text-center">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {holdings.map((h) => (
                        <tr key={h.id} className="hover:bg-white/5 transition-colors group">
                            <td className="p-4">
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
                                        <span className="block text-[10px] text-gray-500">{h.name}</span>
                                    </div>
                                </Link>
                            </td>
                            <td className="p-4 text-right font-mono text-gray-400 text-sm">{h.shares}</td>
                            <td className="p-4 text-right font-mono text-gray-400 text-sm">${h.avg_cost.toFixed(2)}</td>
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
                                    className="p-2 bg-white/5 hover:bg-red-500/20 text-gray-500 hover:text-red-500 rounded-lg transition-colors"
                                    title="Close Position"
                                >
                                    <XCircle size={16} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}
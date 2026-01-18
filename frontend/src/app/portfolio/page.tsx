"use client";
import { useEffect, useState } from "react";
import { Loader2, XCircle, TrendingUp, TrendingDown, Wallet, Search } from "lucide-react";
import Link from "next/link";

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // stats
  const totalValue = holdings.reduce((sum, h) => sum + h.market_value, 0);
  const totalCost = holdings.reduce((sum, h) => sum + (h.avg_cost * h.shares), 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  const fetchPortfolio = async () => {
    try {
      const res = await fetch("http://localhost:8000/portfolio");
      const data = await res.json();
      setHoldings(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 3000); // live p&l update every 3s
    return () => clearInterval(interval);
  }, []);

  const closePosition = async (ticker: string, shares: number, price: number) => {
    if(!confirm(`Sell all ${shares} shares of ${ticker} at $${price.toFixed(2)}?`)) return;
    
    setLoading(true);
    try {
        // sell order for full amount
        const res = await fetch("http://localhost:8000/trade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                ticker, 
                shares, 
                price, 
                type: "SELL" 
            })
        });
        
        if (res.ok) {
            fetchPortfolio(); // refresh list
        } else {
            alert("Failed to close position");
        }
    } catch(e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-8">
      
      {/* header & stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="col-span-2">
            <h1 className="text-4xl text-white font-instrument mb-2">My Portfolio</h1>
            <p className="text-gray-500">Track your performance across the ASX.</p>
        </div>
        
        {/* net worth */}
        <div className="luxury-card p-6 rounded-xl flex flex-col justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <Wallet size={100} className="text-primary" />
            </div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Net Liquidating Value</p>
            <h2 className="text-4xl font-bold text-white mb-2">
                ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h2>
            <div className={`flex items-center gap-2 text-sm font-bold ${totalPnL >= 0 ? "text-success" : "text-danger"}`}>
                {totalPnL >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                <span>
                    {totalPnL > 0 ? "+" : ""}{totalPnL.toLocaleString()} ({totalPnLPercent.toFixed(2)}%)
                </span>
            </div>
        </div>
      </div>

      {/* main content */}
      <div className="luxury-card rounded-2xl overflow-hidden min-h-125">
        {/* toolbar */}
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#15100d]">
            <h3 className="text-s font-bold font-instrument text-white uppercase tracking-wider pl-2">Current Holdings</h3>
        </div>

        {/* table */}
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-white/5 text-xs text-gray-500 uppercase tracking-wider">
                        <th className="p-4 font-medium">Ticker</th>
                        <th className="p-4 font-medium text-right">Shares</th>
                        <th className="p-4 font-medium text-right">Avg Cost</th>
                        <th className="p-4 font-medium text-right">Last Price</th>
                        <th className="p-4 font-medium text-right">Market Value</th>
                        <th className="p-4 font-medium text-right">Unrealized P&L</th>
                        <th className="p-4 font-medium text-center">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {holdings.map((h) => (
                        <tr key={h.id} className="hover:bg-white/5 transition-colors group">
                            <td className="p-4">
                                <Link href={`/stock/${h.ticker}`} className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-white p-px">
                                        <img 
                                            src={`https://files.marketindex.com.au/xasx/96x96-png/${h.ticker.toLowerCase()}.png`}
                                            className="w-full h-full rounded-full object-cover"
                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                        />
                                    </div>
                                    <div>
                                        <span className="block font-bold text-white group-hover:text-primary transition-colors">{h.ticker}</span>
                                        <span className="block text-xs text-gray-500">{h.name}</span>
                                    </div>
                                </Link>
                            </td>
                            <td className="p-4 text-right font-mono text-gray-300">{h.shares}</td>
                            <td className="p-4 text-right font-mono text-gray-300">${h.avg_cost.toFixed(2)}</td>
                            <td className="p-4 text-right font-mono text-white font-bold">${h.current_price.toFixed(2)}</td>
                            <td className="p-4 text-right font-mono text-white">${h.market_value.toLocaleString()}</td>
                            <td className="p-4 text-right">
                                <div className={`flex flex-col items-end ${h.pnl >= 0 ? "text-success" : "text-danger"}`}>
                                    <span className="font-bold text-sm">
                                        {h.pnl > 0 ? "+" : ""}{h.pnl.toLocaleString()}
                                    </span>
                                    <span className="text-xs bg-white/5 px-1 rounded">
                                        {h.pnl_percent.toFixed(2)}%
                                    </span>
                                </div>
                            </td>
                            <td className="p-4 text-center">
                                <button 
                                    onClick={() => closePosition(h.ticker, h.shares, h.current_price)}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors text-xs font-bold uppercase tracking-wider"
                                >
                                    <XCircle size={14} />
                                    <span>Close</span>
                                </button>
                            </td>
                        </tr>
                    ))}
                    
                    {!loading && holdings.length === 0 && (
                        <tr>
                            <td colSpan={7} className="p-25 text-center">
                                <div className="flex flex-col items-center gap-4 text-gray-500">
                                    <div className="p-4 bg-white/5 rounded-full">
                                        <Wallet size={32} />
                                    </div>
                                    <div>
                                        <p className="text-lg font-bold text-white">No Open Positions</p>
                                        <p className="text-sm">Use the screener to find opportunities.</p>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}
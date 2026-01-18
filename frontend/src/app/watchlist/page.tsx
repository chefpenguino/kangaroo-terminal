"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Loader2, Star, Plus } from "lucide-react";
import Link from "next/link";

export default function WatchlistPage() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWatchlist = async () => {
      try {
        const res = await fetch("http://localhost:8000/watchlist");
        const data = await res.json();
        setStocks(data);
      } catch (error) {
        console.error("Failed to fetch watchlist", error);
      } finally {
        setLoading(false);
      }
    };

    fetchWatchlist();
    // poll every 1s for live prices
    const interval = setInterval(fetchWatchlist, 1000); 
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="animate-in fade-in duration-500">
      
      {/* header */}
      <div className="flex items-center gap-3 mb-8">
        <div>
            <h1 className="text-4xl text-white font-instrument">Your Watchlist</h1>
            <p className="text-gray-500">Live tracking of your favourite assets.</p>
        </div>
      </div>

      {/* loading state */}
      {loading && (
        <div className="flex justify-center items-center h-64 text-primary">
          <Loader2 className="animate-spin" size={32} />
        </div>
      )}

      {/* empty state */}
      {!loading && stocks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-surface/50 rounded-2xl border border-white/5 border-dashed">
          <div className="p-4 rounded-full bg-white/5 mb-4">
            <Star size={32} className="text-gray-600" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No stocks watched yet</h3>
          <p className="text-gray-500 mb-6">Star a stock from the Discover page to track it here.</p>
        </div>
      )}

      {/* grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {stocks.map((stock) => {
            const isPositive = parseFloat(stock.change_percent) >= 0;
            return (
                <Link href={`/stock/${stock.ticker}`} key={stock.ticker}>
                    <div className="luxury-card group relative p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-10px_rgba(198,142,86,0.1)]">
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-3">
                                <img 
                                    src={`https://files.marketindex.com.au/xasx/96x96-png/${stock.ticker.toLowerCase()}.png`}
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                    className="w-10 h-10 rounded-full bg-white object-cover border border-white/10"
                                />
                                <div>
                                    <h3 className="text-lg font-bold text-white leading-none">{stock.ticker}</h3>
                                    <p className="text-xs text-gray-500 font-medium mt-1 truncate max-w-30">{stock.name}</p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="space-y-1">
                            <span className="text-2xl font-bold tracking-tight text-white">${stock.price.toFixed(2)}</span>
                            <div className="flex items-center gap-2">
                                <div className={`flex items-center text-xs font-bold px-1.5 py-0.5 rounded ${isPositive ? 'text-success bg-success/10' : 'text-danger bg-danger/10'}`}>
                                    {isPositive ? <ArrowUpRight size={12} className="mr-1"/> : <ArrowDownRight size={12} className="mr-1"/>}
                                    {stock.change_percent}
                                </div>
                            </div>
                        </div>
                    </div>
                </Link>
            );
        })}
      </div>
    </div>
  );
}
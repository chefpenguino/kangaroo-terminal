"use client";
import { ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";

const StockCard = ({ ticker, name, price, change, changePercent }: any) => {
  const isPositive = change >= 0;
  
  // track up or down instead of class string directly
  const [flashState, setFlashState] = useState<'up' | 'down' | null>(null);
  const [imageError, setImageError] = useState(false);
  const prevPrice = useRef(price);

  useEffect(() => {
    // only flash if the price actually changed
    if (price !== prevPrice.current) {
        if (price > prevPrice.current) {
            setFlashState('up');
        } else if (price < prevPrice.current) {
            setFlashState('down');
        }
        
        // reset after animation
        const timer = setTimeout(() => setFlashState(null), 1000);
        
        // update ref for next comparison
        prevPrice.current = price;
        return () => clearTimeout(timer);
    }
  }, [price]);

  return (
    <div className="luxury-card group relative p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-10px_rgba(198,142,86,0.1)] overflow-hidden">
      
      {/* flash overlay */}
      <div 
        className={`absolute inset-0 z-0 transition-opacity duration-500 pointer-events-none 
        ${flashState === 'up' ? 'bg-success/30 opacity-100' : 
          flashState === 'down' ? 'bg-danger/30 opacity-100' : 
          'opacity-0'}`} 
      />
      
      {/* header */}
      <div className="relative z-10 flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          {/* logo logic */}
          {!imageError ? (
          <div className="relative shrink-0">
            <img
              src={`https://files.marketindex.com.au/xasx/96x96-png/${ticker.toLowerCase()}.png`}
              alt={`${ticker} logo`}
              className="w-10 h-10 rounded-full object-cover bg-white border-2 border-primary/20 shadow-[0_0_10px_rgba(198,142,86,0.15)]"
              onError={() => setImageError(true)}
            />
            {/* subtle gradient overlay */}
            <div className="absolute inset-0 rounded-full bg-linear-to-br from-transparent via-transparent to-black/20 pointer-events-none"></div>
          </div>
          ) : (
            // fallback (letter)
            <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-xs font-bold border-2 bg-white text-gray-800 border-primary/20 shadow-[0_0_10px_rgba(198,142,86,0.15)]">
              {ticker[0]}
            </div>
          )}
          <div>
            <h3 className="text-lg font-bold text-white leading-none">{ticker}</h3>
            {/* truncate name if too long */}
            <p className="text-xs text-gray-500 font-medium mt-1 truncate max-w-28">{name}</p>
          </div>
        </div>
        
        {/* visual decoration sparkline */}
        <div className="flex gap-0.5 items-end h-8 opacity-50">
          {[40, 60, 45, 70, 50, 80, 60, 85].map((h, i) => (
            <div key={i} style={{ height: `${h}%` }} className={`w-1 rounded-sm ${isPositive ? 'bg-success' : 'bg-danger'}`}></div>
          ))}
        </div>
      </div>
      
      {/* price area */}
      <div className="relative z-10 space-y-1"> {/* text appears above flash */}
        <span className="text-2xl font-bold tracking-tight text-white">${price.toFixed(2)}</span>
        
        <div className="flex items-center gap-2">
          <div className={`flex items-center text-xs font-bold px-1.5 py-0.5 rounded ${isPositive ? 'text-success bg-success/10' : 'text-danger bg-danger/10'}`}>
            {isPositive ? <ArrowUpRight size={12} className="mr-1"/> : <ArrowDownRight size={12} className="mr-1"/>}
            {changePercent}
          </div>
          <span className="text-[10px] text-gray-600 uppercase tracking-wider">Today</span>
        </div>
      </div>
    </div>
  );
};

export default function Home() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [marketIndex, setMarketIndex] = useState<any>(null);

  useEffect(() => {
    const fetchStocks = async () => {
      try {
        // fetch stocks
        const res = await fetch("http://localhost:8000/stocks");
        const data = await res.json();
        setStocks(data);

        // fetch market index (ASX200)
        const indexRes = await fetch("http://localhost:8000/market-index");
        const indexData = await indexRes.json();
        setMarketIndex(indexData);

      } catch (error) {
        console.error("Failed to fetch data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStocks(); // fetch upon load
    const interval = setInterval(fetchStocks, 1000) // refresh every 1s
    return () => clearInterval(interval); // cleanup upon leaving page
  }, []);

  return (
    <div>
      {/* hero section */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-4xl font-instrument text-white">Dashboard</h2>
          <p className="text-gray-500 text-sm mt-1">Real-time market intelligence</p> 
        </div>
        
        {/* placeholder global ticker */}
        <div className="flex items-center gap-4 text-xs font-mono text-gray-400">
          {marketIndex ? (
            <>
            <span>
              ASX 200: <span className="text-white">
                {/* format number with commas (eg 8,808.50) */}
                ${marketIndex.price?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </span>
            {/* green for up, red for down */}
            <span className={marketIndex.change >= 0 ? "text-success" : "text-danger"}>
              {marketIndex.change >= 0 ? "↑" : "↓"} {Math.abs(marketIndex.percent).toFixed(2)}%
            </span>
            </>
          ) : (
            <span className="animate-pulse">Loading...</span>
          )}
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
        <div className="text-gray-500 text-center py-20 bg-surface/30 rounded-xl border border-white/5">
          <p>No market data available.</p>
          <p className="text-xs mt-2">Is the Python backend running?</p>
        </div>
      )}

      {/* data grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...stocks].sort((a, b) => b.price - a.price).map((stock) => (
          <Link href={`/stock/${stock.ticker}`} key={stock.ticker}>
            <StockCard 
              ticker={stock.ticker} 
              name={stock.name} 
              price={stock.price} 
              change={stock.change_amount}
              changePercent={stock.change_percent} 
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
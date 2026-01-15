"use client";
import { Search, X, Loader2 } from "lucide-react"; 
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  
  // search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // fetch market status on mount & every 60s
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch("http://localhost:8000/market-status");
        const data = await res.json();
        setIsOpen(data.is_open);
      } catch (e) {
        console.error("Failed to fetch market status");
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  // search typing 
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.length > 1) {
        setLoading(true);
        try {
          const res = await fetch(`http://localhost:8000/search?q=${query}`);
          const data = await res.json();
          setResults(data);
          setShowDropdown(true);
        } catch (error) {
          console.error(error);
        } finally {
          setLoading(false);
        }
      } else {
        setResults([]);
        setShowDropdown(false);
      }
    }, 300); // wait 300ms after typing stops

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  // click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: any) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchRef]);

  const handleSelect = (ticker: string) => {
    setQuery(""); // clear search
    setShowDropdown(false);
    router.push(`/stock/${ticker}`);
  };

  return (
    <header className="flex justify-between items-center mb-10 z-40 relative">
      {/* search bar */}
      <div ref={searchRef} className="relative w-96 group z-50">
        
        {/* input field */}
        <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
            </div>
            
            <input
            type="text"
            placeholder="Search Ticker (e.g. BHP)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if(results.length > 0) setShowDropdown(true); }}
            className="w-full bg-surface border border-white/10 rounded-xl pl-12 pr-12 py-3 text-sm focus:outline-none focus:border-primary/50 transition-colors shadow-lg placeholder-gray-600 text-white"
            />
            
            {/* clear button (only on typing) */}
            {query && (
                <button 
                    onClick={() => { setQuery(""); setShowDropdown(false); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white"
                >
                    <X size={14} />
                </button>
            )}
            
            {!query && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-600 bg-white/5 px-2 py-0.5 rounded border border-white/5 pointer-events-none">
                    ⌘ K
                </span>
            )}
        </div>

        {/* dropdown results */}
        {showDropdown && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="py-2">
                    {results.map((stock) => (
                        <button
                            key={stock.ticker}
                            onClick={() => handleSelect(stock.ticker)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors text-left group"
                        >
                            <div className="flex items-center gap-3">
                                {/* symbol logo */}
                                <img 
                                    src={`https://files.marketindex.com.au/xasx/96x96-png/${stock.ticker.toLowerCase()}.png`}
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                    className="w-8 h-8 rounded-full bg-white object-cover border border-white/10"
                                />
                                <div>
                                    <span className="block text-sm font-bold text-white group-hover:text-primary transition-colors">
                                        {stock.ticker}
                                    </span>
                                    <span className="block text-xs text-gray-500 truncate max-w-45">
                                        {stock.name}
                                    </span>
                                </div>
                            </div>
                            
                            {/* sector badge */}
                            {stock.sector && (
                                <span className="text-[10px] text-gray-600 uppercase tracking-wider bg-white/5 px-2 py-1 rounded">
                                    {stock.sector}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>
        )}
      </div>

      <div className="flex items-center gap-6">
        {/* status asx200 open/close */}
        <div className={`px-4 py-2 bg-surface rounded-full border border-white/5 flex items-center gap-2 transition-colors ${isOpen ? 'shadow-[0_0_10px_rgba(78,159,118,0.2)]' : ''}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-success animate-pulse" : "bg-gray-500"}`}></span>
          <span className={`text-[14px] font-instrument uppercase tracking-wider ${isOpen ? "text-white" : "text-gray-500"}`}>
            {isOpen ? "ASX Open" : "ASX Closed"}
          </span>
        </div>
      </div>
    </header>
  );
}


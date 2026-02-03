"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Loader2, Star, Plus, Bell, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import EventHorizon from "../components/EventHorizon";
import StoryPlayer from "../components/StoryPlayer";

interface WatchlistClientProps {
  initialStocks: any[];
}

export default function WatchlistClient({ initialStocks }: WatchlistClientProps) {
  const [stocks, setStocks] = useState<any[]>(initialStocks);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);

  // stories state
  const [stories, setStories] = useState<any[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [selectedStoryIndex, setSelectedStoryIndex] = useState<number | null>(null);

const fetchStories = async () => {
    const toastId = toast.loading("Kangaroo Agent Active", {
      description: "Scanning market events & generating stories...",
      // icon: <Loader2 className="animate-spin text-primary" size={16} /> 
    });
    
    try {
        const res = await fetch("http://localhost:8000/watchlist/stories");
        if(res.ok){
            const data = await res.json();
            // const validStories = data.filter((s: any) => s.design && s.design.slides && s.design.slides.length > 0);
            
            setStories(data);
            
            if (data.length > 0) {
               toast.dismiss(toastId);
               toast.success("Stories Generated", {
                 description: `Created ${data.length} visual briefs from market activity.`,
                 duration: 4000
               });
            } else {
               toast.dismiss(toastId);
               toast.info("Market Quiet", {
                 description: "No significant price action or news found.",
                 duration: 3000
               });
            }
        } else {
             toast.dismiss(toastId);
             toast.error("Agent Request Failed", { 
                 description: "The backend returned an error." 
             });
        }
    } catch (e) {
        console.error("failed stories fetch", e);
        toast.dismiss(toastId);
        toast.error("Agent Connection Failed", { 
            description: "Check if backend is running." 
        });
    } finally {
        setStoriesLoading(false);
    }
  };

  const fetchAlerts = async () => {
    setAlertsLoading(true);
    try {
      const res = await fetch("http://localhost:8000/alerts");
      const data = await res.json();
      setAlerts(data);
    } catch (e) {
      console.error("Failed to fetch alerts", e);
    } finally {
      setAlertsLoading(false);
    }
  };

  const deleteAlert = async (id: number) => {
    try {
      await fetch(`http://localhost:8000/alerts/${id}`, { method: 'DELETE' });
      setAlerts(prev => prev.filter(a => a.id !== id));
      toast.success("Alert deleted");
    } catch (e) {
      toast.error("Failed to delete alert");
    }
  };

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

    // fetchWatchlist(); // skipped
    // poll every 1s for live prices
    const interval = setInterval(fetchWatchlist, 1000);

    fetchAlerts(); 
    fetchStories(); 

    return () => clearInterval(interval);
  }, []);

  // story ring colour
  const getStoryGradient = (story: any) => {
      if (!story) return "from-gray-500 to-white";
      
      const changeStr = story.change || "";
      const isPositive = changeStr.includes("+");
      const isNegative = changeStr.includes("-");
      
      // instagram style gradients
      if (isPositive) return "from-emerald-400 via-green-500 to-teal-400";
      if (isNegative) return "from-orange-500 via-red-500 to-pink-600";
      
      // instagram neutral
      return "from-yellow-400 via-orange-500 to-fuchsia-600";
  };

  return (
    <div className="animate-in fade-in duration-500">

      {/* header */}
      <div className="flex items-center gap-3 mb-6">
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
        <div className="luxury-card flex flex-col items-center justify-center min-h-75">
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
          // check if stock has a story
          const storyIndex = stories.findIndex(s => s.ticker === stock.ticker);
          const hasStory = storyIndex !== -1;
          const story = hasStory ? stories[storyIndex] : null;
          
          return (
            <div key={stock.ticker} className="relative">
              <Link href={`/stock/${stock.ticker}`}>
                <div className="luxury-card group relative p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-10px_rgba(198,142,86,0.1)]">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        {hasStory ? (
                          <div 
                            className={`rounded-full p-0.75 bg-linear-to-tr ${getStoryGradient(story)} cursor-pointer hover:scale-105 transition-transform duration-200`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedStoryIndex(storyIndex);
                            }}
                          >
                            <div className="rounded-full bg-[#09090b] p-[2.5px]">
                              <img
                                src={`https://files.marketindex.com.au/xasx/96x96-png/${stock.ticker.toLowerCase()}.png`}
                                onError={(e) => (e.currentTarget.style.display = 'none')}
                                className="w-10 h-10 rounded-full bg-white object-cover"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="p-[5.5px]">
                            <img
                              src={`https://files.marketindex.com.au/xasx/96x96-png/${stock.ticker.toLowerCase()}.png`}
                              onError={(e) => (e.currentTarget.style.display = 'none')}
                              className="w-10 h-10 rounded-full bg-white object-cover border border-white/10 opacity-80 group-hover:opacity-100 transition-opacity"
                            />
                          </div>
                        )}
                      </div>
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
                        {isPositive ? <ArrowUpRight size={12} className="mr-1" /> : <ArrowDownRight size={12} className="mr-1" />}
                        {stock.change_percent}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-3xl text-white font-instrument">Active Alerts</h2>
          </div>

          {alertsLoading ? (
            <div className="luxury-card flex items-center justify-center min-h-112.5 h-full">
              <Loader2 className="animate-spin text-primary" size={32} />
            </div>
          ) : alerts.length === 0 ? (
            <div className="luxury-card flex flex-col items-center justify-center min-h-112.5 h-full">
              <div className="p-4 rounded-full bg-white/5 mb-4">
                <Bell size={32} className="text-gray-600" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">No active alerts</h3>
              <p className="text-gray-500 mb-6">Set price targets on stock pages to get notified.</p>
            </div>
          ) : (
            <div className="luxury-card overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-white/5 text-gray-400 text-xs uppercase font-bold">
                  <tr>
                    <th className="p-4">Ticker</th>
                    <th className="p-4">Condition</th>
                    <th className="p-4">Target / Info</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {alerts.map((alert) => (
                    <tr key={alert.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 font-bold text-white">{alert.ticker}</td>
                      <td className="p-4 text-gray-300">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${alert.condition === "ABOVE" ? "bg-green-500/10 text-green-500" :
                          alert.condition === "BELOW" ? "bg-red-500/10 text-red-500" :
                            "bg-blue-500/10 text-blue-400"
                          }`}>
                          {alert.condition}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-white">
                        {alert.condition === "REMINDER" ? (
                          <span className="text-xs text-gray-400 font-sans italic">{alert.note}</span>
                        ) : (
                          `$${alert.target_price.toFixed(2)}`
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${alert.status === "TRIGGERED" ? "bg-red-500/10 text-red-500 animate-pulse" : "bg-blue-500/10 text-blue-500"}`}>
                          {alert.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => deleteAlert(alert.id)}
                          className="text-gray-500 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <h2 className="text-3xl text-white font-instrument mb-6">Event Horizon</h2>
          <EventHorizon />
        </div>
      </div>
      
      {/* story player modal */}
      {selectedStoryIndex !== null && stories.length > 0 && (
          <StoryPlayer 
              stories={stories} 
              initialStoryIndex={selectedStoryIndex} 
              onClose={() => setSelectedStoryIndex(null)} 
          />
      )}
    </div>
  );
}
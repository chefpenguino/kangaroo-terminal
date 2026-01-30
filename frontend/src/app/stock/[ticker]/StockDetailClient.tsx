"use client";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, X, BrainCircuit, Calculator, Star, ChevronDown, Layers, Plus, Search, Users, Briefcase, PieChart as PieIcon, Target, Info, Bell, FileText, Download, Eye, Calendar, DollarSign } from "lucide-react";
import Link from "next/link";
import AlertModal from "../../components/AlertModal";
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { Treemap, ResponsiveContainer, Tooltip as ReTooltip, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, BarChart, Bar, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { notFound } from "next/navigation";
import DocumentViewer from "./DocumentViewer";
import KangarooReader from "./KangarooReader";

// format relative time (eg 2h ago)
function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  // fallback to date if older
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// transform pandas to rows
function processFinancials(data: any) {
  if (!data) return { years: [], rows: [] };

  // get years and sort in desc order 
  const years = Object.keys(data).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  // calculate YoY +%
  const getGrowth = (current: number, prev: number) => {
    if (!prev || prev === 0) return null;
    return ((current - prev) / Math.abs(prev)) * 100;
  };

  // metrics
  const metrics = [
    { key: "Total Revenue", label: "Revenue", format: "currency" },
    { key: "Net Income", label: "Net Income", format: "currency" },
    { key: "Profit Margin", label: "Net Margin %", format: "percent", isCalculated: true },
    { key: "EBITDA", label: "EBITDA", format: "currency" },
    { key: "Diluted EPS", label: "EPS", format: "number" },
  ];

  const rows = metrics.map(m => {
    const rowValues = years.map((year, i) => {
      // current year value
      let val = data[year][m.key] || 0;

      // calculate custom metrics if needed
      if (m.key === "Profit Margin") {
        const rev = data[year]["Total Revenue"] || 1;
        const net = data[year]["Net Income"] || 0;
        val = (net / rev) * 100;
      }

      // previous year value (for growth calc)
      let prevVal = 0;
      const prevYear = years[i + 1];
      if (prevYear) {
        if (m.key === "Profit Margin") {
          const r = data[prevYear]["Total Revenue"] || 1;
          const n = data[prevYear]["Net Income"] || 0;
          prevVal = (n / r) * 100;
        } else {
          prevVal = data[prevYear][m.key] || 0;
        }
      }

      return {
        value: val,
        growth: prevYear ? getGrowth(val, prevVal) : null,
        format: m.format
      };
    });

    return { label: m.label, values: rowValues };
  });

  return { years, rows };
}

// order ticket component
const OrderTicket = ({ ticker, currentPrice, onTrade }: any) => {
  const [type, setType] = useState("BUY"); // BUY | SELL
  const [shares, setShares] = useState(1);
  const [loading, setLoading] = useState(false);
  const [orderCategory, setOrderCategory] = useState("MARKET"); // MARKET | LIMIT | STOP
  const [limitPrice, setLimitPrice] = useState(currentPrice);

  // sync limit price with current price if it's market
  useEffect(() => {
    if (orderCategory === "MARKET") {
      setLimitPrice(currentPrice);
    }
  }, [currentPrice, orderCategory]);

  const total = shares * (orderCategory === "MARKET" ? currentPrice : limitPrice);

  const executeOrder = async () => {
    setLoading(true);
    try {
      let endpoint = "http://localhost:8000/trade";
      let payload: any = { ticker: ticker.toUpperCase(), shares, price: currentPrice, type };

      if (orderCategory !== "MARKET") {
        endpoint = "http://localhost:8000/orders/create";
        // for pending orders: type  LIMIT_BUY, LIMIT_SELL, or STOP_LOSS
        let pendingType = "";
        if (orderCategory === "LIMIT") {
          pendingType = type === "BUY" ? "LIMIT_BUY" : "LIMIT_SELL";
        } else {
          pendingType = "STOP_LOSS";
        }
        payload = {
          ticker: ticker.toUpperCase(),
          shares,
          price: limitPrice,
          type: pendingType
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        onTrade();
        const msg = orderCategory === "MARKET" ? "Order Filled" : "Order Created";
        toast.success(`${msg}: ${type} ${shares} ${ticker}`, {
          description: `@ $${(orderCategory === "MARKET" ? currentPrice : limitPrice).toFixed(2)}`,
          duration: 4000,
        });
        // reset if market, keep price if limit
        if (orderCategory === "MARKET") setShares(1);
      } else {
        const err = await res.json();
        toast.error("Order Failed", {
          description: err.detail
        });
      }
    } catch (e) {
      console.error(e);
      toast.error("Network Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface border border-white/10 rounded-xl p-6 h-full flex flex-col">
      {/* buy/sell toggle */}
      <div className="flex bg-black/20 p-1 rounded-lg mb-4">
        <button
          onClick={() => setType("BUY")}
          className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${type === "BUY" ? "bg-success text-white shadow-lg" : "text-gray-500 hover:text-white"}`}
        >
          BUY
        </button>
        <button
          onClick={() => setType("SELL")}
          className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${type === "SELL" ? "bg-danger text-white shadow-lg" : "text-gray-500 hover:text-white"}`}
        >
          SELL
        </button>
      </div>

      {/* order category toggle */}
      <div className="flex gap-2 mb-6">
        {["MARKET", "LIMIT", "STOP"].map((cat) => (
          <button
            key={cat}
            onClick={() => setOrderCategory(cat)}
            className={`flex-1 py-1 text-[10px] font-bold rounded-md border transition-all ${orderCategory === cat
              ? "bg-primary/20 border-primary text-primary"
              : "bg-transparent border-white/5 text-gray-500 hover:text-gray-300"}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* price display */}
      <div className="flex justify-between items-center mb-4">
        <span className="text-gray-400 text-xs">{orderCategory === "MARKET" ? "Market Price" : "Execution Price"}</span>
        <span className="text-xl font-bold text-white font-mono">${(orderCategory === "MARKET" ? currentPrice : limitPrice).toFixed(2)}</span>
      </div>

      {/* inputs */}
      <div className="space-y-3 mb-6">
        <div>
          <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Shares</label>
          <input
            type="number" min="1"
            value={shares}
            onChange={(e) => setShares(parseInt(e.target.value) || 0)}
            className="w-full bg-black/20 border border-white/10 rounded-lg p-2.5 text-white font-mono focus:border-primary outline-none text-sm"
          />
        </div>

        {orderCategory !== "MARKET" && (
          <div>
            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">
              {orderCategory === "LIMIT" ? "Limit Price" : "Stop Price"}
            </label>
            <input
              type="number" step="0.01"
              value={limitPrice}
              onChange={(e) => setLimitPrice(parseFloat(e.target.value) || 0)}
              className="w-full bg-black/20 border border-white/10 rounded-lg p-2.5 text-white font-mono focus:border-primary outline-none text-sm"
            />
          </div>
        )}

        <div className="pt-3 border-t border-white/5">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-gray-400">Est. Total</span>
            <span className="text-lg font-bold text-white font-mono">${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* action button */}
      <button
        onClick={executeOrder}
        className={`w-full py-3.5 rounded-xl font-bold text-md tracking-wide shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] ${type === "BUY"
          ? "bg-success hover:bg-green-600 text-white shadow-green-900/20"
          : "bg-danger hover:bg-red-600 text-white shadow-red-900/20"
          }`}
      >
        {loading ? <Loader2 className="animate-spin mx-auto" /> : `${orderCategory === "MARKET" ? "" : orderCategory} ${type} ${ticker}`}
      </button>
    </div>
  );
};

const PendingOrdersList = ({ orders, onCancel }: any) => {
  if (orders.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-white/5">
      <div className="flex items-center gap-2 mb-3 px-1">
        <DollarSign size={12} className="text-primary" />
        <h4 className=" text-[10px] font-bold text-gray-500 uppercase tracking-widest">Active Orders</h4>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {orders.map((order: any) => (
          <div key={order.id} className="flex items-center justify-between p-2 bg-black/20 rounded-lg border border-white/5 hover:border-white/10 group transition-all">
            <div className="flex items-center gap-2.5">
              <div className={`w-1.5 h-1.5 rounded-full ${order.order_type === 'LIMIT_BUY' ? 'bg-success' : order.order_type === 'LIMIT_SELL' ? 'bg-primary' : 'bg-danger'}`} />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black text-white leading-none">{order.order_type.replace('_', ' ')}</span>
                  <span className="text-[9px] text-gray-500 font-bold leading-none">{order.shares}</span>
                </div>
                <div className="text-xs font-bold text-primary font-mono mt-0.5">${order.limit_price.toFixed(2)}</div>
              </div>
            </div>
            <button
              onClick={() => onCancel(order.id)}
              className="p-1.5 text-gray-600 hover:text-danger hover:bg-danger/10 rounded-md transition-all opacity-0 group-hover:opacity-100"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};


interface StockDetailProps {
  ticker: string;
  initialHistory: any[];
  initialInfo: any;
  initialNews: any[];
  initialFinancials: any;
  initialValuation: any;
  initialCorporate: any;
  initialInstitutional: any;
  initialIsWatched: boolean;
}

export default function StockDetailClient({
  ticker,
  initialHistory,
  initialInfo,
  initialNews,
  initialFinancials,
  initialValuation,
  initialCorporate,
  initialInstitutional,
  initialIsWatched
}: StockDetailProps) {
  // history state
  const [data, setData] = useState<any[]>(initialHistory);
  const [refreshHistory, setRefreshHistory] = useState(0);
  const [loading, setLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<any>(initialInfo);
  const [financials, setFinancials] = useState<any>(initialFinancials);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState("news"); // 'news' | 'financials' | 'ai' | 'valuation'
  const [news, setNews] = useState<any[]>(initialNews || []);
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [articleContent, setArticleContent] = useState<any>(null);
  const [reading, setReading] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [filings, setFilings] = useState<any[]>([]);
  const [filingsMetadata, setFilingsMetadata] = useState<any>(null);
  const [filingsLoading, setFilingsLoading] = useState(false);
  const [is404, setIs404] = useState(false);
  const [valuation, setValuation] = useState<any>(initialValuation);
  const [corporate, setCorporate] = useState<any>(initialCorporate);
  const [growthRate, setGrowthRate] = useState(5); // 5% growth
  const [discountRate, setDiscountRate] = useState(10); // 10% discount
  const [terminalMultiple, setTerminalMultiple] = useState(10); // 10x exit multiple
  const [isWatched, setIsWatched] = useState(initialIsWatched);
  const [rightPanel, setRightPanel] = useState("info");
  const [institutional, setInstitutional] = useState<any>(initialInstitutional);

  // cache constants
  const CACHE_DURATION = 30 * 60 * 1000;
  const getCacheKey = (type: string, t: string) => `k-terminal-${type}-${t.toUpperCase()}`;

  // cache helpers
  const getCachedData = (type: string, t: string) => {
    try {
      const cached = localStorage.getItem(getCacheKey(type, t));
      if (!cached) return null;
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp > CACHE_DURATION) {
        localStorage.removeItem(getCacheKey(type, t));
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  };

  const setCachedData = (type: string, t: string, data: any) => {
    try {
      localStorage.setItem(getCacheKey(type, t), JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error("Cache write failed", e);
    }
  };
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [selectedFiling, setSelectedFiling] = useState<any>(null);

  // filings helpers
  const getScoreColor = (score: number) => {
    if (score >= 15) return "text-green-400 bg-green-500/20 border-green-500/50";
    if (score >= 5) return "text-yellow-400 bg-yellow-500/20 border-yellow-500/50";
    return "text-gray-400 bg-gray-500/20 border-gray-500/50";
  };

  const getScoreEmoji = (score: number) => {
    if (score >= 15) return "🟢";
    if (score >= 5) return "🟡";
    return "⚪";
  };

  // indicator state
  const [indicators, setIndicators] = useState({
    sma50: false,
    sma200: false,
    ema20: false,
    bollinger: false
  });

  // helper
  const toggleIndicator = (key: string) => {
    setIndicators(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
  };

  // ui state for dropdown
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);

  const timeframes = [
    { label: '1D', period: '1d', interval: '5m' },
    { label: '1W', period: '5d', interval: '15m' },
    { label: '1M', period: '1mo', interval: '1d' },
    { label: '3M', period: '3mo', interval: '1d' },
    { label: '6M', period: '6mo', interval: '1d' },
    { label: '1Y', period: '1y', interval: '1wk' },
    { label: '5Y', period: '5y', interval: '1wk' },
    { label: 'MAX', period: 'max', interval: '1mo' },
  ];

  // sync activeTab with URL hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      const validTabs = ["news", "financials", "ai", "valuation", "corporate", "filings"];
      if (validTabs.includes(hash)) {
        setActiveTab(hash);
      }
    };

    // run once on mount
    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // update hash when tab changes
  useEffect(() => {
    if (activeTab) {
      const currentHash = window.location.hash.replace('#', '');
      if (currentHash !== activeTab) {
        // use pushState to support back button
        window.history.pushState(null, '', `#${activeTab}`);
      }
    }
  }, [activeTab]);
  const [activeTf, setActiveTf] = useState(timeframes[5]);

  // comparison state
  const [compareTicker, setCompareTicker] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [comparisonData, setComparisonData] = useState<any[]>([]);
  const [showComparisonInput, setShowComparisonInput] = useState(false);
  const [comparisonSymbol, setComparisonSymbol] = useState<string | null>(null);

  // fetch search
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (compareTicker.length > 1) {
        setIsSearching(true);
        try {
          const res = await fetch(`http://localhost:8000/search?q=${compareTicker}`);
          const data = await res.json();
          setSearchResults(data);
        } catch (error) {
          console.error(error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300); // 300ms delay

    return () => clearTimeout(delayDebounceFn);
  }, [compareTicker]);

  const handleAddComparison = async (targetTicker: string = compareTicker) => {
    if (!targetTicker) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/stock/${targetTicker}/history?period=${activeTf.period}&interval=${activeTf.interval}`);
      if (res.ok) {
        const json = await res.json();
        setComparisonData(json);
        setComparisonSymbol(targetTicker.toUpperCase());

        setShowComparisonInput(false);
        setCompareTicker("");
        setSearchResults([]);
      } else {
        toast.error("Ticker not found");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // fetch history 
  useEffect(() => {
    // avoid refetching initial 1y data
    if (activeTf.period === '1y' && data === initialHistory) {
      return;
    }

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const res = await fetch(`http://localhost:8000/stock/${ticker}/history?period=${activeTf.period}&interval=${activeTf.interval}`);

        if (res.status === 404) {
          setIs404(true);
          return;
        }

        const json = await res.json();
        setData(json);
      } catch (e: any) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [ticker, activeTf, refreshHistory]);

  // transactions state
  const [transactions, setTransactions] = useState<any[]>([]);
  const [refreshTransactions, setRefreshTransactions] = useState(0);

  // pending orders state
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [refreshOrders, setRefreshOrders] = useState(0);

  // fetch transactions
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const res = await fetch(`http://localhost:8000/stock/${ticker}/transactions`);
        if (res.ok) {
          const json = await res.json();
          setTransactions(json);
        }
      } catch (e) { console.error(e); }
    };
    fetchTransactions();
  }, [ticker, refreshTransactions]);

  const handleCancelOrder = async (orderId: number) => {
    try {
      const res = await fetch(`http://localhost:8000/orders/cancel/${orderId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Order Cancelled");
        setRefreshOrders(prev => prev + 1);
      }
    } catch (e) { console.error(e); }
  };

  // fetch pending orders
  useEffect(() => {
    const fetchPending = async () => {
      try {
        const res = await fetch(`http://localhost:8000/orders/pending/${ticker}`);
        if (res.ok) {
          const json = await res.json();
          setPendingOrders(json);
        }
      } catch (e) { console.error(e); }
    };
    fetchPending();
  }, [ticker, refreshOrders]);

  // background polling for orders and transactions
  useEffect(() => {
    const poll = setInterval(() => {
      setRefreshTransactions(prev => prev + 1);
      setRefreshOrders(prev => prev + 1);
    }, 5000);
    return () => clearInterval(poll);
  }, []);

  // render chart 
  useEffect(() => {
    if (!data.length || !chartContainerRef.current) return;

    // determine mode (price/percentage)
    const isComparing = comparisonData.length > 0;

    // create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0F0B08' },
        textColor: '#EBE3DB',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      rightPriceScale: {
        mode: isComparing ? 2 : 0, // 2 = Percentage, 0 = Normal
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
    });

    // main series
    const mainSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#4E9F76',
      downColor: '#D65A5A',
      borderVisible: false,
      wickUpColor: '#4E9F76',
      wickDownColor: '#D65A5A',
      title: ticker.toUpperCase(),
    });
    mainSeries.setData(data);

    if (transactions.length > 0) {
      // convert transactions to markers

      const markers: any[] = transactions.map(t => {
        // format date to YYYY-MM-DD
        const d = new Date(t.timestamp);
        const dateStr = d.toISOString().split('T')[0];

        const isBuy = t.type === 'BUY';
        return {
          time: dateStr,
          position: isBuy ? 'belowBar' : 'aboveBar',
          color: isBuy ? '#22c55e' : '#ef4444',
          shape: isBuy ? 'arrowUp' : 'arrowDown',
          text: `${t.type} @ $${Number(t.price).toFixed(2)}`
        };
      });

      // sort markers by time
      markers.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

      createSeriesMarkers(mainSeries, markers);
    }

    // comparison series
    if (isComparing) {
      const compSeries = chart.addSeries(LineSeries, {
        color: '#3B82F6',
        lineWidth: 2,
        title: comparisonSymbol || "Compare",
        crosshairMarkerVisible: true,
      });
      const lineData = comparisonData.map((d: any) => ({
        time: d.time,
        value: d.close
      }));
      compSeries.setData(lineData);
    }

    // volume
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });

    chart.priceScale('').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const volumeData = data.map((d: any) => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(78, 159, 118, 0.3)' : 'rgba(214, 90, 90, 0.3)',
    }));
    volumeSeries.setData(volumeData);

    // indicators (Only render if not comparing, to keep chart clean in % mode)
    if (!isComparing) {
      if (indicators.sma50) {
        const lineSeries = chart.addSeries(LineSeries, { color: '#2962FF', lineWidth: 2, title: 'SMA 50' });
        lineSeries.setData(data.filter((d: any) => d.sma50).map((d: any) => ({ time: d.time, value: d.sma50 })));
      }
      if (indicators.sma200) {
        const lineSeries = chart.addSeries(LineSeries, { color: '#FF6D00', lineWidth: 2, title: 'SMA 200' });
        lineSeries.setData(data.filter((d: any) => d.sma200).map((d: any) => ({ time: d.time, value: d.sma200 })));
      }
      if (indicators.ema20) {
        const lineSeries = chart.addSeries(LineSeries, { color: '#00E5FF', lineWidth: 1, title: 'EMA 20' });
        lineSeries.setData(data.filter((d: any) => d.ema20).map((d: any) => ({ time: d.time, value: d.ema20 })));
      }
      if (indicators.bollinger) {
        const upper = chart.addSeries(LineSeries, { color: 'rgba(157, 78, 221, 0.5)', lineWidth: 1 });
        const lower = chart.addSeries(LineSeries, { color: 'rgba(157, 78, 221, 0.5)', lineWidth: 1 });
        upper.setData(data.filter((d: any) => d.bb_upper).map((d: any) => ({ time: d.time, value: d.bb_upper })));
        lower.setData(data.filter((d: any) => d.bb_lower).map((d: any) => ({ time: d.time, value: d.bb_lower })));
      }
    }

    // pending orders (price lines)
    pendingOrders.forEach(order => {
      const color = order.order_type === 'LIMIT_BUY' ? '#4E9F76' :
        order.order_type === 'LIMIT_SELL' ? '#C68E56' : '#D65A5A';

      mainSeries.createPriceLine({
        price: order.limit_price,
        color: color,
        lineWidth: 2,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `${order.order_type.replace('_', ' ')} (${order.shares})`,
      });
    });

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, comparisonData, indicators, transactions, pendingOrders]);

  const openArticle = async (url: string) => {
    if (!url) return;
    setSelectedArticle(url);
    setReading(true);
    setArticleContent(null); // reset prev content

    try {
      // encode url 
      const encodedUrl = encodeURIComponent(url);
      const res = await fetch(`http://localhost:8000/read-article?url=${encodedUrl}`);
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setArticleContent(json);
    } catch (e) {
      console.error(e);
    } finally {
      setReading(false);
    }
  };

  const generateAnalysis = async () => {
    if (aiReport) return;

    // check cache
    const cached = getCachedData('analysis', ticker);
    if (cached) {
      setAiReport(cached);
      return;
    }

    setAnalysing(true);
    try {
      const res = await fetch(`http://localhost:8000/stock/${ticker}/analyse`);
      const json = await res.json();
      setAiReport(json.report);
      setCachedData('analysis', ticker, json.report);
    } catch (e) {
      console.error(e);
    } finally {
      setAnalysing(false);
    }
  };

  const fetchFilings = async () => {
    if (filings.length > 0) return;

    // check cache
    const cached = getCachedData('filings', ticker);
    if (cached) {
      setFilings(cached.filings);
      setFilingsMetadata(cached.metadata);
      return;
    }

    setFilingsLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/stock/${ticker}/filings`);
      const data = await res.json();

      if (data.filings && Array.isArray(data.filings)) {
        setFilings(data.filings);
        setFilingsMetadata(data.metadata);
        setCachedData('filings', ticker, { filings: data.filings, metadata: data.metadata });
      } else if (Array.isArray(data)) {
        setFilings(data);
        setCachedData('filings', ticker, { filings: data, metadata: null });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFilingsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "ai") {
      generateAnalysis();
    } else if (activeTab === "filings") {
      fetchFilings();
    }
  }, [activeTab, ticker]);

  const toggleWatchlist = async () => {
    const newState = !isWatched;
    setIsWatched(newState);
    try {
      await fetch(`http://localhost:8000/stock/${ticker}/toggle-watch`, { method: "POST" });
    } catch (e) {
      console.error(e);
      setIsWatched(!newState); // revert on error
    }
  };

  // dcf calculation
  const calculateFairValue = () => {
    if (!valuation || valuation.error || !valuation.fcf) return 0;

    const { fcf, total_debt, cash, shares_outstanding } = valuation;

    // project fcf for next 5 years
    let futureCashFlows = 0;
    let projectedFCF = fcf;

    for (let i = 1; i <= 5; i++) {
      // grow the fcf
      projectedFCF = projectedFCF * (1 + (growthRate / 100));
      // discount it back to today
      futureCashFlows += projectedFCF / Math.pow(1 + (discountRate / 100), i);
    }

    // calculate terminal value (@ year 5)
    // using exit multiple method: year 5 fcf * multiple
    const terminalValue = projectedFCF * terminalMultiple;
    // discount terminal value back to today
    const discountedTerminalValue = terminalValue / Math.pow(1 + (discountRate / 100), 5);

    // enterprise value = sum of discounted flows
    const enterpriseValue = futureCashFlows + discountedTerminalValue;

    // equity value = enterprise value + cash - debt
    const equityValue = enterpriseValue + cash - total_debt;

    // fair value per share
    const fairValue = equityValue / shares_outstanding;

    return fairValue;
  };

  const fairValue = calculateFairValue();
  const upside = valuation?.current_price ? ((fairValue - valuation.current_price) / valuation.current_price) * 100 : 0;

  if (is404) {
    notFound();
  }

  return (
    <div className="animate-in fade-in duration-500">
      <AlertModal
        ticker={ticker}
        currentPrice={data.length > 0 ? data[data.length - 1].close : 0}
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
      />
      {/* back button */}
      <Link href="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-primary mb-6 transition-colors">
        <ArrowLeft size={18} />
        <span>Back to Dashboard</span>
      </Link>

      {/* header */}
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-center gap-5">
          {/* large logo */}
          {!imageError ? (
            <div className="relative shrink-0">
              <img
                src={`https://files.marketindex.com.au/xasx/96x96-png/${ticker.toLowerCase()}.png`}
                alt={`${ticker} logo`}
                className="w-16 h-16 rounded-full object-cover bg-white border-2 border-primary/20 shadow-[0_0_20px_rgba(198,142,86,0.15)]"
                onError={() => setImageError(true)}
              />
            </div>
          ) : (
            // fallback (letter)
            <div className="w-16 h-16 shrink-0 rounded-full flex items-center justify-center text-2xl font-bold bg-surface text-gray-500 border border-white/10 shadow-inner">
              {ticker[0].toUpperCase()}
            </div>
          )}

          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight">{ticker.toUpperCase()}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-gray-500">ASX Historical Data</span>
              {companyInfo?.sector && (
                <>
                  <span className="text-gray-700">•</span>
                  <span className="text-primary text-sm font-medium bg-primary/10 px-2 py-0.5 rounded">{companyInfo.sector}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* watch button */}
          <button
            onClick={toggleWatchlist}
            className={`group flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 ${isWatched
              ? "bg-primary/10 border-primary/50 text-primary"
              : "bg-surface border-white/10 text-gray-500 hover:border-white/30 hover:text-white"
              }`}
          >
            <Star size={18} className={isWatched ? "fill-primary" : "fill-transparent group-hover:scale-110 transition-transform"} />
            <span className="text-sm font-bold tracking-wide">
              {isWatched ? "WATCHING" : "WATCH"}
            </span>
          </button>

          {/* alert button */}
          <button
            onClick={() => setIsAlertModalOpen(true)}
            className="group flex items-center justify-center w-10 h-10 rounded-xl border border-white/10 bg-surface text-gray-500 hover:bg-white/5 hover:text-white hover:border-white/30 transition-all"
          >
            <Bell size={18} className="group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </div>

      {/* grid layout; chart at the left & profile at tjhe right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-125">
        {/* chart */}
        <div className="lg:col-span-2 luxury-card p-4 rounded-xl relative flex flex-col">
          {/* toolbar heading */}
          <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2 relative z-20">

            <div className="flex items-center gap-4">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                Price Action <span className="text-primary">({activeTf.label})</span>
              </h3>

              {/* indicator dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowIndicatorMenu(!showIndicatorMenu)}
                  className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-primary/50 text-gray-400 hover:text-white transition-all"
                >
                  Indicators
                  <ChevronDown size={10} />
                </button>

                {/* the menu */}
                {showIndicatorMenu && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-surface border border-white/10 rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1 backdrop-blur-xl">
                    <p className="text-[10px] uppercase font-bold text-gray-500 px-2 py-1">Trend</p>
                    <button onClick={() => toggleIndicator('sma50')} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/5 text-xs text-gray-300 hover:text-white">
                      <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#2962FF]"></div> SMA 50</div>
                      {indicators.sma50 && <span className="text-primary">✓</span>}
                    </button>
                    <button onClick={() => toggleIndicator('sma200')} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/5 text-xs text-gray-300 hover:text-white">
                      <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#FF6D00]"></div> SMA 200</div>
                      {indicators.sma200 && <span className="text-primary">✓</span>}
                    </button>
                    <button onClick={() => toggleIndicator('ema20')} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/5 text-xs text-gray-300 hover:text-white">
                      <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#00E5FF]"></div> EMA 20</div>
                      {indicators.ema20 && <span className="text-primary">✓</span>}
                    </button>

                    <div className="h-px bg-white/10 my-1"></div>
                    <p className="text-[10px] uppercase font-bold text-gray-500 px-2 py-1">Volatility</p>
                    <button onClick={() => toggleIndicator('bollinger')} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/5 text-xs text-gray-300 hover:text-white">
                      <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[rgba(157,78,221,1)]"></div> Bollinger</div>
                      {indicators.bollinger && <span className="text-primary">✓</span>}
                    </button>
                  </div>
                )}
              </div>

              {/* compare input */}
              <div className="relative flex items-center">
                {comparisonSymbol ? (
                  <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 px-2 py-1.5 rounded-lg">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span className="text-[10px] font-bold text-blue-400">{comparisonSymbol}</span>
                    <button
                      onClick={() => { setComparisonData([]); setComparisonSymbol(null); }}
                      className="hover:text-white text-blue-400"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 relative">
                    {showComparisonInput ? (
                      <div className="relative">
                        {/* input field */}
                        <div className="flex items-center bg-background border border-white/20 rounded-lg overflow-hidden h-7 animate-in fade-in slide-in-from-left-2 w-48">
                          <input
                            autoFocus
                            className="bg-transparent text-xs text-white px-2 w-full outline-none placeholder-gray-600"
                            placeholder="Search Ticker..."
                            value={compareTicker}
                            onChange={(e) => setCompareTicker(e.target.value.toUpperCase())}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddComparison(compareTicker)}
                            onBlur={() => setTimeout(() => setShowComparisonInput(false), 200)}
                          />
                          <div className="px-2">
                            {isSearching ? <Loader2 size={10} className="animate-spin text-gray-500" /> : <Search size={10} className="text-gray-500" />}
                          </div>
                        </div>

                        {/* dropdown results */}
                        {searchResults.length > 0 && (
                          <div className="absolute top-full left-0 mt-2 w-64 bg-background border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col gap-0.5 p-1 animate-in fade-in zoom-in-95">
                            {searchResults.map((result) => (
                              <button
                                key={result.ticker}
                                onClick={() => handleAddComparison(result.ticker)} // pass ticker directly
                                className="flex items-center gap-3 w-full px-3 py-2 hover:bg-white/10 rounded-lg transition-colors text-left group"
                              >
                                {/* logo */}
                                <img
                                  src={`https://files.marketindex.com.au/xasx/96x96-png/${result.ticker.toLowerCase()}.png`}
                                  className="w-6 h-6 rounded-full bg-white object-cover border border-white/10"
                                  onError={(e) => (e.currentTarget.style.display = 'none')}
                                />
                                <div>
                                  <span className="block text-xs font-bold text-white group-hover:text-primary">
                                    {result.ticker}
                                  </span>
                                  <span className="block text-[10px] text-gray-500 truncate max-w-35">
                                    {result.name}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowComparisonInput(true)}
                        className="text-[10px] font-bold px-2 py-1.5 rounded-lg border border-white/10 hover:border-primary/50 text-gray-400 hover:text-white transition-all flex items-center gap-1"
                      >
                        <Plus size={10} /> Compare
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* timeframe buttons */}
            <div className="flex bg-background/50 border border-white/5 rounded-xl p-1 gap-1">
              {timeframes.map((tf) => (
                <button
                  key={tf.label}
                  onClick={() => setActiveTf(tf)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-300 ${ // remember prvious rounded-md
                    activeTf.label === tf.label
                      ? "luxury-toggle-active"
                      : "text-gray-500 hover:text-primary hover:bg-white/5"
                    }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 relative w-full h-full min-h-100">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <Loader2 className="animate-spin text-primary" size={32} />
              </div>
            )}

            {/* legend overlay */}
            <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 pointer-events-none">
              {indicators.sma50 && <div className="text-[10px] font-mono text-[#2962FF]">SMA 50</div>}
              {indicators.sma200 && <div className="text-[10px] font-mono text-[#FF6D00]">SMA 200</div>}
              {indicators.ema20 && <div className="text-[10px] font-mono text-[#00E5FF]">EMA 20</div>}
              {indicators.bollinger && <div className="text-[10px] font-mono text-[rgba(157,78,221,1)]">Bollinger Bands (20, 2)</div>}
            </div>

            {/* chart container */}
            <div className="flex-1 relative min-h-100">
              <div ref={chartContainerRef} className="absolute inset-0 w-full h-full" />
            </div>

            {/* pending orders list */}
            <PendingOrdersList
              orders={pendingOrders}
              onCancel={handleCancelOrder}
            />
          </div>
        </div>

        {/* right column: trade & info panel */}
        <div className="luxury-card p-6 rounded-xl flex flex-col h-full">

          {/* panel tabs */}
          <div className="flex gap-2 mb-6 p-1 bg-black/20 rounded-lg border border-white/5">
            <button
              onClick={() => setRightPanel("info")}
              className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${rightPanel === "info" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
            >
              Company Info
            </button>
            <button
              onClick={() => setRightPanel("trade")}
              className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${rightPanel === "trade" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
            >
              Trade
            </button>
          </div>

          {/* content area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {rightPanel === "trade" ? (
              <OrderTicket
                ticker={ticker}
                // get latest price from history data
                currentPrice={data.length > 0 ? data[data.length - 1].close : 0}
                onTrade={() => {
                  setRefreshTransactions(prev => prev + 1);
                  setRefreshOrders(prev => prev + 1);
                  setRefreshHistory(prev => prev + 1);
                }}
              />
            ) : (
              <>
                <h3 className="text-lg font-bold text-white mb-4">About {ticker.toUpperCase()}</h3>
                {companyInfo ? (
                  <div className="space-y-6">
                    <p className="text-gray-400 text-sm leading-relaxed text-justify max-h-50 overflow-y-auto custom-scrollbar pr-2">
                      {companyInfo.description}
                    </p>
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                      <div>
                        <p className="text-xs text-gray-500 uppercase">Industry</p>
                        <p className="text-sm text-white font-medium">{companyInfo.industry}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase">Employees</p>
                        <p className="text-sm text-white font-medium">{companyInfo.employees?.toLocaleString() || "N/A"}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-gray-500 uppercase">Website</p>
                        <a href={companyInfo.website} target="_blank" className="text-sm text-primary hover:underline truncate block">{companyInfo.website}</a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 animate-pulse">
                    <div className="h-4 bg-white/5 rounded w-3/4"></div>
                    <div className="h-4 bg-white/5 rounded w-full"></div>
                    <div className="h-4 bg-white/5 rounded w-5/6"></div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* tabbed data */}

      <div className="mt-8">
        {/* tab buttons */}
        <div className="flex gap-6 border-b border-white/5 mb-6">
          <button
            onClick={() => setActiveTab("news")}
            className={`pb-3 text-sm font-bold tracking-wide transition-colors border-b-2 ${activeTab === "news" ? "text-primary border-primary" : "text-gray-500 border-transparent hover:text-white"}`}
          >
            LATEST NEWS
          </button>
          <button
            onClick={() => setActiveTab("financials")}
            className={`pb-3 text-sm font-bold tracking-wide transition-colors border-b-2 ${activeTab === "financials" ? "text-primary border-primary" : "text-gray-500 border-transparent hover:text-white"}`}
          >
            FINANCIALS
          </button>
          <button
            onClick={() => setActiveTab("ai")}
            className={`pb-3 text-sm font-bold tracking-wide transition-colors border-b-2 ${activeTab === "ai" ? "text-primary border-primary" : "text-gray-500 border-transparent hover:text-white"}`}
          >
            ANALYSIS
          </button>
          <button
            onClick={() => setActiveTab("valuation")}
            className={`pb-3 text-sm font-bold tracking-wide transition-colors border-b-2 ${activeTab === "valuation" ? "text-primary border-primary" : "text-gray-500 border-transparent hover:text-white"}`}
          >
            VALUATION
          </button>
          <button
            onClick={() => setActiveTab("corporate")}
            className={`pb-3 text-sm font-bold tracking-wide transition-colors border-b-2 ${activeTab === "corporate" ? "text-primary border-primary" : "text-gray-500 border-transparent hover:text-white"}`}
          >
            CORPORATE
          </button>
          <button
            onClick={() => setActiveTab("filings")}
            className={`pb-3 text-sm font-bold tracking-wide transition-colors border-b-2 ${activeTab === "filings" ? "text-primary border-primary" : "text-gray-500 border-transparent hover:text-white"}`}
          >
            FILINGS
          </button>
        </div>

        {/* tab: news */}
        {activeTab === "news" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {news.length > 0 ? news.map((item: any) => {
              // article data
              const article = item.content;
              // skip if data is missing
              if (!article) return null;

              return (
                <div
                  key={item.id || article.title}
                  onClick={() => openArticle(article.clickThroughUrl?.url || article.canonicalUrl?.url)}
                  className="luxury-card p-5 rounded-xl hover:border-primary/30 transition-all group flex flex-col justify-between h-full cursor-pointer"
                >
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2.5">
                        {/* favicon Image */}
                        {article.provider?.url && (
                          <img
                            /* google S2 favicon service */
                            src={`https://www.google.com/s2/favicons?domain=${article.provider.url}&sz=64`}
                            alt="source"
                            className="w-5 h-5 rounded-full grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all"
                          />
                        )}

                        <span className="text-[11px] font-medium text-gray-400 group-hover:text-primary transition-colors">
                          {article.provider?.displayName || "News"}
                        </span>
                      </div>

                      {/* relative time */}
                      <span className="text-xs text-gray-600">
                        {timeAgo(article.pubDate)}
                      </span>
                    </div>

                    <h4 className="text-white font-medium leading-snug group-hover:text-primary transition-colors line-clamp-3">
                      {article.title}
                    </h4>
                  </div>

                  <p className="text-gray-500 text-xs mt-3 line-clamp-2 leading-relaxed">
                    {article.summary}
                  </p>
                </div>
              );
            }) : (
              <p className="text-gray-500 text-sm col-span-full text-center py-10">No recent news found.</p>
            )}
          </div>
        )}

        {/* tab: financials */}
        {activeTab === "financials" && (
          <div className="luxury-card p-6 rounded-xl overflow-x-auto">
            {financials && Object.keys(financials).length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="p-4 border-b border-white/5 text-xs text-gray-500 uppercase tracking-wider font-medium">Metric</th>
                    {processFinancials(financials).years.map(year => (
                      <th key={year} className="p-4 border-b border-white/5 text-xs text-right text-gray-500 font-mono">
                        {new Date(year).getFullYear()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {processFinancials(financials).rows.map((row) => (
                    <tr key={row.label} className="group hover:bg-white/5 transition-colors">
                      {/* metric name */}
                      <td className="p-4 border-b border-white/5 text-sm font-bold text-white group-hover:text-primary transition-colors">
                        {row.label}
                      </td>

                      {/* values */}
                      {row.values.map((cell: any, idx: number) => (
                        <td key={idx} className="p-4 border-b border-white/5 text-right">
                          <div className="flex flex-col items-end gap-1">
                            {/* formatted value */}
                            <span className="text-sm font-mono text-gray-200">
                              {cell.format === "currency" && (cell.value > 1000000 || cell.value < -1000000)
                                ? `$${(cell.value / 1000000000).toFixed(2)}B`
                                : cell.format === "percent"
                                  ? `${cell.value.toFixed(1)}%`
                                  : cell.value.toFixed(2)}
                            </span>

                            {/* growth badge) */}
                            {cell.growth !== null && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${cell.growth >= 0
                                ? "bg-green-500/10 text-green-400"
                                : "bg-red-500/10 text-red-400"
                                }`}>
                                {cell.growth >= 0 ? "▲" : "▼"} {Math.abs(cell.growth).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12">
                <Loader2 className="animate-spin mx-auto text-primary mb-4" />
                <p className="text-gray-500">Loading Financial Data...</p>
              </div>
            )}
          </div>
        )}

        {/* tab: ai analyst */}
        {activeTab === "ai" && (
          <div className="luxury-card p-8 rounded-xl min-h-100">
            {/* loading state */}
            {(!aiReport || analysing) && (
              <div className="flex flex-col items-center justify-center h-full min-h-100 gap-6">
                <div className="relative">
                  <Loader2 className="animate-spin text-primary" size={48} />
                  <div className="absolute inset-0 blur-xl bg-primary/20 rounded-full"></div>
                </div>
                <p className="text-sm text-stone-500">Synthesising News Sources...</p>
              </div>
            )}

            {/* result state */}
            {aiReport && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center gap-3 mb-8 border-b border-white/5 pb-4">
                  <span className="text-s font-bold font-instrument text-primary ">AI Generated Report</span>
                </div>

                <div
                  className="prose prose-invert prose-lg max-w-none
                  prose-headings:text-white prose-headings:font-bold prose-headings:font-instrument prose-headings:text-2xl prose-headings:mt-8 prose-headings:mb-4
                  prose-p:text-gray-300 prose-p:leading-relaxed prose-p:text-[1.05rem] prose-p:my-4
                  prose-strong:text-white prose-strong:font-bold
                  prose-ul:my-4 prose-li:text-gray-300"
                  dangerouslySetInnerHTML={{ __html: aiReport }}
                />
              </div>
            )}
          </div>
        )}

        {/* tab: valuation */}
        {activeTab === "valuation" && (
          <div className="luxury-card p-8 rounded-xl min-h-100">
            {valuation && !valuation.error ? (
              <div className="space-y-12">

                {/* section 1: dcf model */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                  {/* inputs */}
                  <div className="space-y-8">
                    <h3 className="text-lg font-bold text-white font-instrument mb-4">Your DCF Model</h3>

                    <div>
                      <div className="flex justify-between text-sm mb-2 font-bold text-gray-400">
                        <span>Expected Growth Rate (5Y)</span>
                        <span className="text-primary">{growthRate}%</span>
                      </div>
                      <input
                        type="range" min="-10" max="50" step="1"
                        value={growthRate}
                        onChange={(e) => setGrowthRate(Number(e.target.value))}
                        className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-2 font-bold text-gray-400">
                        <span>Discount Rate (Risk)</span>
                        <span className="text-primary">{discountRate}%</span>
                      </div>
                      <input
                        type="range" min="5" max="20" step="0.5"
                        value={discountRate}
                        onChange={(e) => setDiscountRate(Number(e.target.value))}
                        className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>

                    <div>                                <div className="flex justify-between text-sm mb-2 font-bold text-gray-400">
                      <span>Exit Multiple (PE)</span>
                      <span className="text-primary">{terminalMultiple}x</span>
                    </div>
                      <input
                        type="range" min="5" max="50" step="1"
                        value={terminalMultiple}
                        onChange={(e) => setTerminalMultiple(Number(e.target.value))}
                        className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                  </div>

                  {/* result */}
                  <div className="flex flex-col items-center justify-center p-8 bg-black/20 rounded-2xl border border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                      <Calculator size={120} />
                    </div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Intrinsic Value (Fair Price)</h3>

                    <div className="text-6xl font-bold text-white font-instrument mb-2 z-10">
                      ${fairValue.toFixed(2)}
                    </div>

                    <div className={`text-sm font-bold px-3 py-1 rounded-full z-10 ${upside >= 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                      {upside >= 0 ? "Undervalued" : "Overvalued"} by {Math.abs(upside).toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* section 2: wall st consensus */}
                {/* only show if data exists */}
                {valuation.targets?.mean && (
                  <div className="pt-8 border-t border-white/10">
                    <div className="flex justify-between items-center mb-6">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-white font-instrument">Wall St. Consensus</h3>

                        {/* tooltip */}
                        <div className="relative flex items-center">
                          <Info size={14} className="ml-1 cursor-help peer text-gray-600 hover:text-primary hover:scale-110 transition-all" />
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-64 bg-[#1A110D] border border-orange-500/30 p-4 rounded-xl shadow-2xl opacity-0 peer-hover:opacity-100 transition-all duration-300 z-50 pointer-events-none translate-y-2 peer-hover:translate-y-0 text-left">
                            <div className="flex items-center gap-2 mb-2 text-primary">
                              <Users size={14} />
                              <span className="font-bold text-[10px] uppercase tracking-wider">Analyst Ratings</span>
                            </div>
                            <p className="text-[11px] text-gray-300 font-medium normal-case leading-relaxed">
                              Aggregated price targets from major firm analysts for the next 12 months.
                              <br /><br />
                              <span className="text-white/60">Low/High:</span> Most bearish vs bullish targets.
                              <br />
                              <span className="text-white/60">Mean:</span> The consensus fair value.
                            </p>
                          </div>
                        </div>

                      </div>
                      <div className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider ${valuation.targets.recommendation.toLowerCase().includes("buy") ? "bg-green-500/10 text-green-500" :
                        valuation.targets.recommendation.toLowerCase().includes("sell") ? "bg-red-500/10 text-red-400" :
                          "bg-yellow-500/10 text-yellow-500"
                        }`}>
                        {valuation.targets.recommendation}
                      </div>
                    </div>

                    <div className="relative h-16 mt-8 mb-4 mx-6">
                      {/* range line */}
                      <div className="absolute top-1/2 left-0 right-0 h-1.5 bg-white/10 rounded-full -translate-y-1/2"></div>

                      {/* labels & dots */}
                      {[
                        { val: valuation.targets.low, label: "Low", color: "text-red-500", bg: "bg-red-500" },
                        { val: valuation.targets.mean, label: "Average", color: "text-primary", bg: "bg-primary" },
                        { val: valuation.targets.high, label: "High", color: "text-green-500", bg: "bg-green-500" }
                      ].map((t, i) => {
                        if (!t.val) return null;
                        const range = valuation.targets.high - valuation.targets.low;
                        const percent = range > 0
                          ? ((t.val - valuation.targets.low) / range) * 100
                          : 50;

                        // alignment logic to prevent overflow
                        let alignClass = "items-center";
                        let translateClass = "-translate-x-1/2";

                        if (i === 0) { // low 
                          alignClass = "items-start";
                          translateClass = "-translate-x-0";
                        } else if (i === 2) { // high
                          alignClass = "items-end";
                          translateClass = "-translate-x-full";
                        }

                        return (
                          <div
                            key={i}
                            className={`absolute top-1/2 -translate-y-1/2 flex flex-col ${alignClass} ${translateClass} transition-all duration-1000`}
                            style={{ left: `${percent}%` }}
                          >
                            <div className={`w-3 h-3 ${t.bg} rounded-full mb-2 shadow-lg ring-4 ring-surface`}></div>
                            <span className={`text-xs font-bold ${t.color}`}>${t.val}</span>
                            <span className="text-[9px] text-gray-500 uppercase tracking-wider">{t.label}</span>
                          </div>
                        );
                      })}

                      {/* current price indicator */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center z-20"
                        style={{
                          left: `${Math.max(0, Math.min(100, ((valuation.current_price - valuation.targets.low) / (valuation.targets.high - valuation.targets.low)) * 100))}%`
                        }}
                      >
                        <div className="w-1 h-6 bg-white rounded-full"></div>
                        <span className="text-xs font-bold text-white mt-1 bg-surface px-1 rounded border border-white/10 shadow-lg">Now</span>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center text-gray-500 gap-4">
                <Calculator size={48} />
                <p>Insufficient financial data to build a model.</p>
              </div>
            )}
          </div>
        )}

        {/* tab: corporate */}
        {activeTab === "corporate" && (
          <div className="space-y-6">

            {/* dividend chart */}
            <div className="luxury-card p-8 rounded-xl min-h-80 flex flex-col">
              <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                <h3 className="text-xl font-bold text-white font-instrument">Dividend History</h3>
                <div className="text-xs text-gray-500 uppercase tracking-widest">Payouts (AUD)</div>
              </div>

              <div className="w-full h-80 mt-4">
                {corporate?.dividends && corporate.dividends.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" minHeight={300} minWidth={0}>
                    <BarChart data={corporate.dividends} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      {/* gold gradient definition */}
                      <defs>
                        <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#C68E56" stopOpacity={1} />
                          <stop offset="100%" stopColor="#C68E56" stopOpacity={0.2} />
                        </linearGradient>
                      </defs>

                      {/* subtle grid lines */}
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="rgba(255,255,255,0.05)"
                      />

                      <XAxis
                        dataKey="date"
                        tickFormatter={(val) => {
                          const d = new Date(val);
                          // show month + year (e.g., "Mar 23")
                          return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
                        }}
                        stroke="#6b7280"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                      />

                      <YAxis
                        stroke="#6b7280"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val) => `$${val.toFixed(2)}`}
                      />

                      <ReTooltip
                        cursor={{ fill: 'rgba(255,255,255,0.05)' }} // highlight column on hover
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-surface border border-white/10 p-3 rounded-lg shadow-xl">
                                <p className="text-xs text-gray-400 mb-1">
                                  {new Date(data.date).toLocaleDateString(undefined, { dateStyle: "long" })}
                                </p>
                                <p className="text-lg font-bold text-primary font-mono">
                                  ${data.amount.toFixed(3)} <span className="text-xs text-white/50">/ share</span>
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />

                      {/* gradient bars */}
                      <Bar
                        dataKey="amount"
                        fill="url(#goldGradient)"
                        radius={[6, 6, 0, 0]} // smoother corners
                        barSize={20}
                        animationDuration={1500}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <p>No dividend history available.</p>
                  </div>
                )}
              </div>
            </div>

            {/* ownership structure */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

              {/* ownership pie */}
              <div className="luxury-card p-8 rounded-xl flex flex-col">
                <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2">
                    <PieIcon size={20} className="text-gray-500" />
                    <h3 className="text-xl font-bold text-white font-instrument">Ownership</h3>
                  </div>
                  <div className="text-xs text-gray-500 uppercase tracking-widest">Distribution</div>
                </div>

                <div className="flex items-center gap-8 h-full">
                  {corporate?.ownership ? (
                    <>
                      <div className="relative w-40 h-40 shrink-0">
                        <ResponsiveContainer width="100%" height="100%" minHeight={160} minWidth={0}>
                          <PieChart>
                            <Pie
                              data={[
                                { name: "Public", value: corporate.ownership.public },
                                { name: "Institutions", value: corporate.ownership.institutions },
                                { name: "Insiders", value: corporate.ownership.insiders }
                              ]}
                              cx="50%"
                              cy="50%"
                              innerRadius={30}
                              outerRadius={50}
                              paddingAngle={5}
                              dataKey="value"
                              stroke="none"
                            >
                              <Cell fill="#4b5563" /> {/* public: gray */}
                              <Cell fill="#C68E56" /> {/* institutions: bronze */}
                              <Cell fill="#4E9F76" /> {/* insiders: green */}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-[10px] font-bold text-white/40">ASX</span>
                        </div>
                      </div>

                      <div className="flex-1 space-y-3">
                        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-primary"></div>
                            <span className="text-gray-300">Institutions</span>
                          </div>
                          <span className="font-mono font-bold text-white">{corporate.ownership.institutions.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-success"></div>
                            <span className="text-gray-300">Insiders</span>
                          </div>
                          <span className="font-mono font-bold text-white">{corporate.ownership.insiders.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                            <span className="text-gray-300">Public</span>
                          </div>
                          <span className="font-mono font-bold text-white">{corporate.ownership.public.toFixed(1)}%</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 text-center text-gray-600 text-sm">Structure data pending...</div>
                  )}
                </div>
              </div>

              {/* top whales */}
              <div className="luxury-card p-8 rounded-xl flex flex-col">
                <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2">
                    <Briefcase size={20} className="text-gray-500" />
                    <h3 className="text-xl font-bold text-white font-instrument">Top Whales</h3>
                  </div>
                  <div className="text-xs text-gray-500 uppercase tracking-widest">Major Funds</div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 max-h-50">
                  {corporate?.institutions && corporate.institutions.length > 0 ? (
                    <table className="w-full text-left">
                      <tbody className="divide-y divide-white/5">
                        {corporate.institutions.map((inst: any, i: number) => (
                          <tr key={i} className="hover:bg-white/5 transition-colors">
                            <td className="py-3 text-xs font-bold text-white truncate max-w-37.5">
                              {inst.holder}
                            </td>
                            <td className="py-3 text-right text-xs font-mono text-primary">
                              {inst.percent.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 text-sm italic">
                      Institutional data unavailable.
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* management team */}
            <div className="luxury-card p-8 rounded-xl">
              <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                <h3 className="text-xl font-bold text-white font-instrument">Leadership Team</h3>
                <Users size={20} className="text-gray-500" />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-white/10">
                      <th className="py-3 font-medium">Name</th>
                      <th className="py-3 font-medium">Position</th>
                      <th className="py-3 font-medium text-right">Total Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm">
                    {corporate?.officers && corporate.officers.length > 0 ? (
                      corporate.officers.map((officer: any, i: number) => (
                        <tr key={i} className="hover:bg-white/5 transition-colors">
                          <td className="py-4 font-bold text-white">{officer.name}</td>
                          <td className="py-4 text-gray-400">{officer.title}</td>
                          <td className="py-4 text-right font-mono text-primary">
                            {officer.pay && officer.pay > 0
                              ? `$${officer.pay.toLocaleString()}`
                              : <span className="text-gray-600">-</span>}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-gray-500">
                          Executive data unavailable.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* tab: institutional */}
        {activeTab === "institutional" && (
          <div className="space-y-6">

            {/* analyst consensus */}
            <div className="luxury-card p-8 rounded-xl">
              <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                <h3 className="text-xl font-bold text-white font-instrument">Analyst Consensus</h3>
                <div className="flex items-center gap-2 text-primary">
                  <Target size={18} />
                  <span className="text-xs uppercase tracking-widest font-bold">Price Targets</span>
                </div>
              </div>

              {institutional?.targets?.mean ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">

                  {/* rating badge */}
                  <div className="text-center p-6 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-2">Consensus Rating</p>
                    <h2 className={`text-3xl font-bold font-instrument ${institutional.targets.recommendation.includes("Buy") ? "text-success" :
                      institutional.targets.recommendation.includes("Sell") ? "text-danger" : "text-yellow-500"
                      }`}>
                      {institutional.targets.recommendation}
                    </h2>
                  </div>

                  {/* price target range visualiser */}
                  <div className="md:col-span-2 relative h-24 pt-8">
                    {/* the line */}
                    <div className="absolute top-1/2 left-0 right-0 h-2 bg-white/10 rounded-full -translate-y-1/2"></div>

                    {/* low target */}
                    <div className="absolute top-1/2 left-0 -translate-y-1/2 flex flex-col items-center">
                      <div className="w-4 h-4 bg-red-500/50 rounded-full mb-2"></div>
                      <span className="text-xs text-gray-500 font-mono">${institutional.targets.low}</span>
                      <span className="text-[10px] text-red-500 uppercase font-bold">Low</span>
                    </div>

                    {/* high target */}
                    <div className="absolute top-1/2 right-0 -translate-y-1/2 flex flex-col items-center">
                      <div className="w-4 h-4 bg-green-500/50 rounded-full mb-2"></div>
                      <span className="text-xs text-gray-500 font-mono">${institutional.targets.high}</span>
                      <span className="text-[10px] text-green-500 uppercase font-bold">High</span>
                    </div>

                    {/* average target */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center transition-all duration-1000"
                      style={{
                        left: `${((institutional.targets.mean - institutional.targets.low) / (institutional.targets.high - institutional.targets.low)) * 100}%`
                      }}
                    >
                      <div className="w-4 h-4 bg-primary rounded-full border-2 border-background mb-2 shadow-[0_0_15px_rgba(198,142,86,0.5)]"></div>
                      <span className="text-sm text-primary font-bold font-mono">${institutional.targets.mean}</span>
                      <span className="text-[10px] text-gray-400 uppercase font-bold">Average</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">No analyst targets available.</div>
              )}
            </div>

            {/* insider trading */}
            <div className="luxury-card p-8 rounded-xl">
              <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                <h3 className="text-xl font-bold text-white font-instrument">Insider Activity</h3>
                <div className="text-xs text-gray-500 uppercase tracking-widest">Director Trades</div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-white/10">
                      <th className="py-3 font-medium">Date</th>
                      <th className="py-3 font-medium">Insider</th>
                      <th className="py-3 font-medium">Type</th>
                      <th className="py-3 font-medium text-right">Shares</th>
                      <th className="py-3 font-medium text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm">
                    {institutional?.insiders && institutional.insiders.length > 0 ? (
                      institutional.insiders.map((trade: any, i: number) => (
                        <tr key={i} className="hover:bg-white/5 transition-colors">
                          <td className="py-4 font-mono text-gray-400 text-xs">{trade.date}</td>
                          <td className="py-4">
                            <span className="block font-bold text-white">{trade.insider}</span>
                            <span className="block text-[10px] text-gray-500">{trade.position}</span>
                          </td>
                          <td className="py-4">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${trade.type === "BUY" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
                              {trade.type}
                            </span>
                          </td>
                          <td className="py-4 text-right font-mono text-gray-300">
                            {trade.shares.toLocaleString()}
                          </td>
                          <td className="py-4 text-right font-mono font-bold text-white">
                            ${trade.value.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-500">
                          No recent insider transactions found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* tab: filings */}
        {activeTab === "filings" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* modal */}
            {selectedFiling && (
              <DocumentViewer
                isOpen={true}
                onClose={() => setSelectedFiling(null)}
                docUrl={selectedFiling.url}
                docTitle={selectedFiling.title}
                ticker={ticker}
              />
            )}

            {/* loading state */}
            {filingsLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <Loader2 className="animate-spin mb-3 text-primary" size={32} />
                <p className="animate-pulse">Scanning ASX Announcements...</p>
              </div>
            ) : filings.length > 0 ? (
              <>
                <div className="grid gap-3">
                  {filings.map((doc, i) => (
                    <div key={i} className="luxury-card p-4 rounded-xl flex justify-between items-center group transition-all duration-300 hover:border-primary/30 relative hover:z-50">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="bg-primary/10 p-3 rounded-lg text-primary group-hover:scale-110 transition-transform">
                          <FileText size={24} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-white font-bold text-sm group-hover:text-primary transition-colors">{doc.title}</h4>

                            {/* score badge */}
                            {doc.score !== undefined && (
                              <div className="relative flex items-center">
                                <div className={`peer flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border cursor-help transition-all hover:scale-105 ${getScoreColor(doc.score)}`}>
                                  <span>{getScoreEmoji(doc.score)}</span>
                                  <span>{doc.score}</span>
                                </div>

                                {/* tooltip */}
                                {doc.score_reason && (
                                  <div className="absolute top-full left-0 mt-3 w-80 bg-[#1A110D] border border-orange-500/30 p-4 rounded-xl shadow-2xl opacity-0 peer-hover:opacity-100 transition-all duration-300 z-50 pointer-events-none translate-y-2 peer-hover:translate-y-0 text-left">
                                    <div className="flex items-center gap-2 mb-2 text-primary">
                                      <Info size={14} />
                                      <span className="font-bold text-[10px] uppercase tracking-wider">Score Breakdown</span>
                                    </div>
                                    <p className="text-[11px] text-gray-300 font-medium normal-case leading-relaxed">
                                      {doc.score_reason}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <Calendar size={12} /> {doc.date}
                            </span>
                            <span className="text-[10px] text-gray-600 border border-gray-700 px-1.5 rounded uppercase font-bold">PDF</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setSelectedFiling(doc)}
                          className="bg-primary hover:bg-primary/80 text-black text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg hover:shadow-primary/20"
                        >
                          <Eye size={14} /> ANALYSE
                        </button>
                        <a
                          href={doc.url}
                          target="_blank"
                          className="bg-white/5 hover:bg-white/20 text-white p-2 rounded-lg transition-all border border-white/10"
                          title="Download / Open Original"
                        >
                          <Download size={16} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>

                {/* metadata footer */}
                {filingsMetadata && (
                  <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>
                        Showing <span className="text-white font-bold">{filingsMetadata.returned_count}</span> of{" "}
                        <span className="text-white font-bold">{filingsMetadata.total_scanned}</span> filings scanned
                        {filingsMetadata.filtered_count > 0 && (
                          <> (<span className="text-gray-500">{filingsMetadata.filtered_count} filtered</span>)</>
                        )}
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <button className="peer text-xs text-gray-500 hover:text-primary transition-all flex items-center gap-1 cursor-help">
                        <Info size={12} />
                        Scoring Info
                      </button>

                      {/* tooltip */}
                      <div className="absolute bottom-full right-0 mb-3 w-100 bg-[#1A110D] border border-orange-500/30 p-4 rounded-xl shadow-2xl opacity-0 peer-hover:opacity-100 transition-all duration-300 z-50 pointer-events-none -translate-y-2 peer-hover:translate-y-0 text-left">
                        <div className="flex items-center gap-2 mb-3 text-primary">
                          <FileText size={14} />
                          <span className="font-bold text-[10px] uppercase tracking-wider">Scoring System</span>
                        </div>
                        <div className="text-[11px] text-gray-300 space-y-2 font-medium leading-relaxed">
                          <p className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-400"></span>
                            <span className="text-white/60">High (15+):</span> Annual reports, earnings, financial reports
                          </p>
                          <p className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                            <span className="text-white/60">Medium (5-14):</span> Guidance, dividends, investor briefings
                          </p>
                          <p className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                            <span className="text-white/60">Standard (0-4):</span> General announcements
                          </p>
                          <div className="mt-3 pt-3 border-t border-white/10 text-[10px] text-gray-500 italic">
                            Noise (director transactions, cessations) is automatically filtered.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-20 text-gray-500 bg-white/5 rounded-xl border border-white/5 border-dashed">
                <p>No recent filings found.</p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* article reader (kangarooreader) */}
      <KangarooReader
        selectedArticle={selectedArticle}
        onClose={() => setSelectedArticle(null)}
        reading={reading}
        articleContent={articleContent}
      />
    </div>
  );
}

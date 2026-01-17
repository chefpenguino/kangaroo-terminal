"use client";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, ArrowDownRight, X, ExternalLink, BrainCircuit, Calculator, Star } from "lucide-react";
import Link from "next/link";
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';

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

export default function StockDetail() {
  const params = useParams();
  const ticker = params.ticker as string; // eg "BHP"
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<any>(null);  
  const [financials, setFinancials] = useState<any>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState("news"); // 'news' | 'financials' | 'ai' | 'valuation'
  const [news, setNews] = useState<any[]>([]); 
  const [selectedArticle, setSelectedArticle] = useState<any>(null); 
  const [articleContent, setArticleContent] = useState<any>(null); 
  const [reading, setReading] = useState(false); 
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [valuation, setValuation] = useState<any>(null);  
  const [growthRate, setGrowthRate] = useState(5); // 5% growth
  const [discountRate, setDiscountRate] = useState(10); // 10% discount
  const [terminalMultiple, setTerminalMultiple] = useState(10); // 10x exit multiple
  const [isWatched, setIsWatched] = useState(false);

  const timeframes = [
    { label: '1D', period: '1d', interval: '5m' },
    { label: '1W', period: '5d', interval: '15m' },
    { label: '1M', period: '1mo', interval: '1d' },
    { label: '3M', period: '3mo', interval: '1d' },
    { label: '6M', period: '6mo', interval: '1d' },
    { label: '1Y', period: '1y', interval: '1d' },
    { label: 'Max', period: 'max', interval: '1mo' },
  ]
  const [activeTf, setActiveTf] = useState(timeframes[5]);

  // fetch history 
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`http://localhost:8000/stock/${ticker}/history?period=${activeTf.period}&interval=${activeTf.interval}`);
        const json = await res.json();
        setData(json);
        
        // fetch company info
        const infoRes = await fetch(`http://localhost:8000/stock/${ticker}/info`);
        const infoJson = await infoRes.json();
        setCompanyInfo(infoJson);

        // fetch news
        const newsRes = await fetch(`http://localhost:8000/stock/${ticker}/news`);
        const newsJson = await newsRes.json();
        setNews(newsJson);

        // fetch financials
        const finRes = await fetch(`http://localhost:8000/stock/${ticker}/financials`);
        const finJson = await finRes.json();
        setFinancials(finJson);

        // fetch valuation
        const valRes = await fetch(`http://localhost:8000/stock/${ticker}/valuation`);
        const valJson = await valRes.json();
        setValuation(valJson);

        // fetch watchlist status
        const stockDbRes = await fetch(`http://localhost:8000/stock/${ticker}`);
        const stockDbJson = await stockDbRes.json();
        setIsWatched(stockDbJson.is_watched);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [ticker, activeTf]);

// render chart 
  useEffect(() => {
    if (!data.length || !chartContainerRef.current) return;

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
      // main price scale 
      rightPriceScale: {
        scaleMargins: {
          top: 0.1, // leave space at top
          bottom: 0.2, // leave space at bottom for volume
        },
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
    });

    // candles
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#4E9F76', 
      downColor: '#D65A5A', 
      borderVisible: false,
      wickUpColor: '#4E9F76',
      wickDownColor: '#D65A5A',
    });
    candlestickSeries.setData(data);

    // volume
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '', // overlay
    });

    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.8, // volume @ the bottom 20%
        bottom: 0,
      },
    });

    // color code volume: green if up day, red if down day
    const volumeData = data.map((d: any) => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(78, 159, 118, 0.3)' : 'rgba(214, 90, 90, 0.3)',
    }));
    
    volumeSeries.setData(volumeData);

    // responsive resize
    const handleResize = () => {
        if(chartContainerRef.current) {
            chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data]);

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
    setAnalyzing(true);
    try {
      const res = await fetch(`http://localhost:8000/stock/${ticker}/analyse`);
      const json = await res.json();
      setAiReport(json.report);
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzing(false);
    }
  };

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

    // calculate terminal value (value at year 5)
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

  return (
    <div className="animate-in fade-in duration-500">
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

        {/* watch button */}
        <button 
          onClick={toggleWatchlist}
          className={`group flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 ${
            isWatched 
              ? "bg-yellow-500/10 border-yellow-500/50 text-yellow-500" 
              : "bg-surface border-white/10 text-gray-500 hover:border-white/30 hover:text-white"
          }`}
        >
          <Star size={18} className={isWatched ? "fill-yellow-500" : "fill-transparent group-hover:scale-110 transition-transform"} />
          <span className="text-sm font-bold tracking-wide">
            {isWatched ? "WATCHING" : "WATCH"}
          </span>
        </button>
      </div>

      {/* grid layout; chart at the left & profile at tjhe right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-125">
        {/* chart */}
        <div className="lg:col-span-2 luxury-card p-4 rounded-xl relative flex flex-col">
          {/* toolbar heading */}
          <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
              Price Action <span className="text-primary">({activeTf.label})</span>
            </h3>
            
            {/* timeframe buttons */}
            <div className="flex bg-background/50 border border-white/5 rounded-xl p-1 gap-1">
              {timeframes.map((tf) => (
                <button
                  key={tf.label}
                  onClick={() => setActiveTf(tf)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-300 ${ // remember prvious rounded-md
                    activeTf.label === tf.label
                      ? "luxury-toggle-active" // NEW 3D STYLE
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
            {/* chart container */}
            <div ref={chartContainerRef} className="absolute inset-0 w-full h-full" />
          </div>
        </div>

        {/* company profile */}
        <div className="luxury-card p-6 rounded-xl overflow-y-auto custom-scrollbar">
          <h3 className="text-lg font-bold text-white mb-4">About {ticker.toUpperCase()}</h3>

          {companyInfo ? (
            <div className="space-y-6">
              <p className="text-gray-400 text-sm leading-relaxed text-justify">
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
            // loading skeleton
            <div className="space-y-4 animate-pulse">
              <div className="h-4 bg-white/5 rounded w-3/4"></div>
              <div className="h-4 bg-white/5 rounded w-full"></div>
              <div className="h-4 bg-white/5 rounded w-5/6"></div>
            </div>
          )}
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
                      <div className="flex items-center gap-2">
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
                                 <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                   cell.growth >= 0 
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
            {/* initial state */}
            {!aiReport && !analyzing && (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <div className="p-4 rounded-full bg-surface border border-white/5 mb-6 shadow-lg">
                  <BrainCircuit size={48} className="text-gray-500" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2 font-instrument">Generate Investment Thesis</h3>
                <p className="text-gray-500 max-w-md mb-8 leading-relaxed">
                  Engage the Kangaroo Neural Engine to analyse recent news sentiment and financial ratios for ${ticker}.
                </p>
                <button
                  onClick={generateAnalysis}
                  className="luxury-button"
                >
                  <span>Run Analysis</span>
                  <BrainCircuit size={18} />
                </button>
              </div>
            )}

            {/* loading state */}
            {analyzing && (
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
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    
                    {/* left: the inputs (sliders) */}
                    <div className="space-y-8">
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
                            <p className="text-xs text-gray-600 mt-2">How fast will the company grow its cash flow?</p>
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
                            <p className="text-xs text-gray-600 mt-2">Higher risk = Higher discount rate.</p>
                        </div>

                        <div>
                            <div className="flex justify-between text-sm mb-2 font-bold text-gray-400">
                                <span>Exit Multiple (PE)</span>
                                <span className="text-primary">{terminalMultiple}x</span>
                            </div>
                            <input 
                                type="range" min="5" max="50" step="1" 
                                value={terminalMultiple} 
                                onChange={(e) => setTerminalMultiple(Number(e.target.value))}
                                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <p className="text-xs text-gray-600 mt-2">What will someone pay for this stock in 5 years?</p>
                        </div>
                    </div>

                    {/* right: the result */}
                    <div className="flex flex-col items-center justify-center p-8 bg-black/20 rounded-2xl border border-white/5">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Intrinsic Value (DCF)</h3>
                        
                        <div className="text-6xl font-bold text-white font-instrument mb-2">
                            ${fairValue.toFixed(2)}
                        </div>
                        
                        <div className={`text-sm font-bold px-3 py-1 rounded-full ${upside >= 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                            {upside >= 0 ? "Undervalued" : "Overvalued"} by {Math.abs(upside).toFixed(1)}%
                        </div>

                        <div className="mt-8 text-xs text-gray-600 font-mono w-full space-y-1">
                            <div className="flex justify-between"><span>Current Price:</span> <span>${valuation.current_price.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span>Free Cash Flow:</span> <span>${(valuation.fcf / 1000000000).toFixed(2)}B</span></div>
                            <div className="flex justify-between"><span>Net Debt:</span> <span>${((valuation.total_debt - valuation.cash) / 1000000000).toFixed(2)}B</span></div>
                        </div>
                    </div>

                 </div>
             ) : (
               <div className="flex flex-col items-center justify-center h-full py-12 text-center text-gray-500 gap-4">
                 <Calculator size={48} />
                 <p>Insufficient financial data to build a model.</p>
               </div>
             )}
          </div>
        )}
      </div>

      {/* article reader (kangarooreader) */}
      {selectedArticle && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/95 backdrop-blur-xl transition-opacity"
            onClick={() => setSelectedArticle(null)}
          />
          
          {/* self-note: maybe change this later to make it more focused (wider) */}
          <div className="luxury-card w-full max-w-5xl h-[90vh] relative z-10 rounded-2xl flex flex-col animate-in fade-in zoom-in-95 duration-300 shadow-2xl border border-white/10 overflow-hidden">
            
            {/* header */}
            <div className="flex justify-between items-center px-8 py-5 border-b border-white/5 bg-background/95 backdrop-blur">
              <div className="flex items-center gap-2.5">
                <h1 
                  className="text-[1.7rem] font-instrument tracking-tight bg-linear-to-br from-white via-stone-200 to-stone-400 bg-clip-text text-transparent drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.5)] whitespace-nowrap overflow-hidden">
                  KangarooTerminal
                </h1>
              </div>
              
              {/* close */}
              <button 
                onClick={() => setSelectedArticle(null)}
                className="luxury-icon-button"
              >
                <X size={20} />
              </button>
            </div>

            {/* content area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-background">
                {reading ? (
                  <div className="h-full flex flex-col items-center justify-center gap-6 text-primary">
                    <div className="relative">
                      <Loader2 className="animate-spin" size={64} />
                      <div className="absolute inset-0 blur-xl bg-primary/20 rounded-full"></div>
                    </div>
                    <p className="text-sm text-stone-500">Accessing KangarooReader...</p>
                  </div>
                ) : articleContent ? (
                  <div className="max-w-3xl mx-auto py-12 px-8">
                    {/* hero image */}
                    {articleContent.top_image && (
                      <div className="relative mb-10 group">
                        <img 
                          src={articleContent.top_image} 
                          className="w-full h-100 object-cover rounded-2xl border border-white/10 shadow-2xl" 
                          alt="Article Header" 
                        />
                        <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10"></div>
                      </div>
                    )}
                    
                    {/* title */}
                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-[1.15] font-instrument tracking-tight">
                      {articleContent.title}
                    </h1>

                    {/* metadata bar (authors, date) */}
                    <div className="flex items-center gap-4 mb-10 text-sm text-gray-400 border-l-2 border-primary/50 pl-4">
                      {articleContent.authors && articleContent.authors.length > 0 && (
                        <span className="font-medium text-gray-300">
                          By <span className="text-primary">{articleContent.authors.join(", ")}</span>
                        </span>
                      )}
                      {articleContent.publish_date && (
                        <>
                          <span>•</span>
                          <span>
                            {new Date(articleContent.publish_date).toLocaleDateString(undefined, { dateStyle: 'long' })}
                          </span>
                        </>
                      )}
                    </div>
                    
                    {/* content */}
                    <div 
                      className="prose prose-invert prose-lg max-w-none 
                      prose-headings:text-white prose-headings:font-bold prose-headings:font-instrument
                      prose-p:text-gray-300 prose-p:leading-relaxed prose-p:text-[1.1rem]
                      prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                      prose-strong:text-white prose-strong:font-bold
                      prose-em:text-gray-300 prose-em:italic
                      prose-blockquote:border-l-primary prose-blockquote:bg-white/5 prose-blockquote:py-2 prose-blockquote:px-6 prose-blockquote:rounded-r-lg
                      prose-img:rounded-xl prose-img:border prose-img:border-white/10 prose-img:shadow-lg prose-img:my-8
                      prose-table:w-full prose-table:border-collapse prose-table:my-8 prose-table:text-sm
                      prose-th:text-primary prose-th:text-left prose-th:p-4 prose-th:border-b prose-th:border-white/10 prose-th:uppercase prose-th:tracking-wider
                      prose-td:p-4 prose-td:border-b prose-td:border-white/5 prose-td:text-gray-400"
                      dangerouslySetInnerHTML={{ __html: articleContent.html }} 
                    />
                  </div>
                ) : (
                  // failed to load
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <div className="p-6 rounded-full bg-red-500/5 text-red-500 mb-6 border border-red-500/20 shadow-[0_0_30px_rgba(220,38,38,0.1)]">
                      <ArrowDownRight size={64} />
                    </div>
                    <h3 className="text-3xl font-bold text-white mb-3 font-instrument">Failed to Load</h3>
                    <p className="text-gray-500 max-w-md mb-10 text-lg">
                      Apologies, we weren't able to decrypt this article directly. It is likely protected by a cloudflare turnstile or a strict paywall.
                    </p>
                    <a 
                      href={selectedArticle} 
                      target="_blank" 
                      className="luxury-button"
                    >
                      <span>Open in Browser</span>
                      <ExternalLink size={18} />
                    </a>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

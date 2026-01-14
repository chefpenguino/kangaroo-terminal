"use client";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader, Loader2 } from "lucide-react";
import Link from "next/link";
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';

export default function StockDetail() {
  const params = useParams();
  const ticker = params.ticker as string; // eg "BHP"
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
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
                <div className="flex bg-surface/50 rounded-lg p-1 gap-1">
                    {timeframes.map((tf) => (
                        <button
                            key={tf.label}
                            onClick={() => setActiveTf(tf)}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all duration-200 ${
                                activeTf.label === tf.label
                                    ? "bg-primary text-white shadow-sm" // active state
                                    : "text-gray-500 hover:text-white hover:bg-white/5" // inactive state
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
    </div>
  );
}
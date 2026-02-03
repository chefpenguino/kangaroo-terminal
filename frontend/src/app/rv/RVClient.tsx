"use client";
import { useEffect, useState, useCallback } from "react";
import { 
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, 
  ResponsiveContainer, Tooltip, ReferenceLine, CartesianGrid,
  Cell
} from "recharts";
import { Loader2, TrendingDown, TrendingUp, Scale, ChevronDown, ChevronUp, Info } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

// metric display labels
const METRIC_LABELS: Record<string, string> = {
  pe_ratio: "P/E Ratio",
  price_to_book: "Price to Book",
  return_on_equity: "Return on Equity (%)",
  revenue_growth: "Revenue Growth (%)",
  peg_ratio: "PEG Ratio",
  dividend_yield: "Dividend Yield (%)"
};

// available metrics for selection
const AVAILABLE_METRICS = [
  { value: "pe_ratio", label: "P/E Ratio" },
  { value: "price_to_book", label: "Price to Book (P/B)" },
  { value: "return_on_equity", label: "Return on Equity (ROE)" },
  { value: "revenue_growth", label: "Revenue Growth" },
  { value: "peg_ratio", label: "PEG Ratio" },
  { value: "dividend_yield", label: "Dividend Yield" }
];

// custom tooltip
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isOvervalued = data.valuation === "overvalued";
    
    return (
      <div className="luxury-card p-4 rounded-xl border border-white/10 min-w-48 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 mb-3">
          <img 
            src={`https://files.marketindex.com.au/xasx/96x96-png/${data.ticker.toLowerCase()}.png`}
            className="w-8 h-8 rounded-full bg-white object-cover"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
          <div>
            <p className="text-white font-bold text-lg">{data.ticker}</p>
            <p className="text-gray-500 text-xs truncate max-w-32">{data.name}</p>
          </div>
        </div>
        
        <div className="space-y-2 text-sm border-t border-white/5 pt-3">
          <div className="flex justify-between">
            <span className="text-gray-400">X Value:</span>
            <span className="text-white font-mono">{data.x.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Y Value:</span>
            <span className="text-white font-mono">{data.y.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Price:</span>
            <span className="text-white font-mono">${data.price?.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Market Cap:</span>
            <span className="text-white font-mono">${(data.market_cap / 1e9).toFixed(1)}B</span>
          </div>
        </div>
        
        {data.residual !== undefined && (
          <div className={`mt-3 pt-3 border-t border-white/5 flex items-center gap-2 ${isOvervalued ? "text-danger" : "text-success"}`}>
            {isOvervalued ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            <span className="text-xs font-bold uppercase">
              {isOvervalued ? "Overvalued" : "Undervalued"} ({data.residual > 0 ? "+" : ""}{data.residual.toFixed(2)})
            </span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

// dropdown component
const Dropdown = ({ value, onChange, options, label }: { 
  value: string; 
  onChange: (val: string) => void; 
  options: { value: string; label: string }[];
  label: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedLabel = options.find(o => o.value === value)?.label || label;
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-surface border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white hover:border-primary/50 transition-all min-w-44"
      >
        <span className="flex-1 text-left truncate">{selectedLabel}</span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full bg-surface border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-colors ${
                value === opt.value ? "text-primary bg-primary/10" : "text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface RVClientProps {
  initialSectors: string[];
}

export default function RVClient({ initialSectors }: RVClientProps) {
  const [sectors] = useState<string[]>(initialSectors);
  const [selectedSector, setSelectedSector] = useState<string>(initialSectors[0] || "");
  const [xMetric, setXMetric] = useState<string>("return_on_equity");
  const [yMetric, setYMetric] = useState<string>("pe_ratio");
  const [showGuide, setShowGuide] = useState(false);
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  // fetch rv data
  const fetchRVData = useCallback(async () => {
    if (!selectedSector) return;
    
    setLoading(true);
    try {
      const res = await fetch(
        `http://localhost:8000/analysis/relative-value?sector=${encodeURIComponent(selectedSector)}&x_metric=${xMetric}&y_metric=${yMetric}`
      );
      
      if (!res.ok) throw new Error("Failed to fetch RV data");
      
      const json = await res.json();
      setData(json);
      
      if (json.points.length === 0) {
        toast.info("No Data", { description: "No stocks have both metrics available in this sector." });
      }
    } catch (e) {
      console.error(e);
      toast.error("Analysis Failed", { description: "Could not fetch relative value data." });
    } finally {
      setLoading(false);
    }
  }, [selectedSector, xMetric, yMetric]);
  
  // fetch on change
  useEffect(() => {
    fetchRVData();
  }, [fetchRVData]);
  
  // sector options for dropdown
  const sectorOptions = sectors.map(s => ({ value: s, label: s }));
  
  // find undervalued / overvalued stocks
  const undervalued = data?.points?.filter((p: any) => p.valuation === "undervalued") || [];
  const overvalued = data?.points?.filter((p: any) => p.valuation === "overvalued") || [];
  
  // sort by residual magnitude
  const topUndervalued = [...undervalued].sort((a, b) => a.residual - b.residual).slice(0, 5);
  const topOvervalued = [...overvalued].sort((a, b) => b.residual - a.residual).slice(0, 5);

  return (
    <div className="animate-in fade-in duration-700 space-y-6 pb-10">
      
      {/* header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl text-white font-instrument mb-1">Relative Value</h1>
          <p className="text-gray-500">Sector-based valuation analysis using regression.</p>
        </div>
        
        {/* controls */}
        <div className="flex flex-wrap items-center gap-3">
          <Dropdown 
            value={selectedSector} 
            onChange={setSelectedSector} 
            options={sectorOptions}
            label="Select Sector"
          />
          <Dropdown 
            value={xMetric} 
            onChange={setXMetric} 
            options={AVAILABLE_METRICS}
            label="X-Axis"
          />
          <Dropdown 
            value={yMetric} 
            onChange={setYMetric} 
            options={AVAILABLE_METRICS}
            label="Y-Axis"
          />
        </div>
      </div>
      
      {/* info banner */}
      <div>
        <button 
          onClick={() => setShowGuide(!showGuide)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          {showGuide ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          <span className="font-instrument tracking-wider uppercase">
            {showGuide ? "Hide Guide" : "How it works"}
          </span>
        </button>

        {showGuide && (
          <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4 mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <Info size={18} className="text-primary shrink-0 mt-0.5" />
            <div className="text-sm text-gray-400">
              <span className="text-white font-medium">Regression Analysis</span>
              <br/>
              Stocks <span className="text-success">below the line</span> are <span className="font-bold">undervalued</span>, offering better value for the given fundamentals. 
              On the other hand, Stocks <span className="text-danger">above the line</span> are <span className="font-bold">overvalued</span>; making them expensive in comparison to the sector average.
              <br />
              <span className="font-semibold text-xs">Bubble size represents market cap.</span>
            </div>
          </div>
        )}
      </div>
      
      {/* scatter chart */}
      <div className="luxury-card rounded-2xl border border-white/5 p-1 h-140 flex flex-col">
        
        {/* toolbar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#15100d] rounded-t-2xl">
          <div className="flex items-center gap-3">
            {/* maybe add icon later */}
            <h2 className="text-sm font-bold text-white tracking-widest font-instrument uppercase">
              {selectedSector} Sector Analysis
            </h2>
            {data?.count !== undefined && (
              <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded-full">
                {data.count} stocks
              </span>
            )}
          </div>
          
          {data?.regression && (
            <div className="text-xs text-gray-400">
              R² = <span className="text-white font-mono">{data.regression.r_squared}</span>
            </div>
          )}
        </div>
        
        {/* chart area */}
        <div className="flex-1 min-h-0 p-4">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="animate-spin text-primary" size={32} />
            </div>
          ) : data?.points?.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis 
                  type="number" 
                  dataKey="x" 
                  name={METRIC_LABELS[xMetric]}
                  stroke="#666"
                  tick={{ fill: '#888', fontSize: 11 }}
                  label={{ 
                    value: METRIC_LABELS[xMetric], 
                    position: 'bottom', 
                    fill: '#888',
                    fontSize: 12,
                    offset: 0
                  }}
                />
                <YAxis 
                  type="number" 
                  dataKey="y" 
                  name={METRIC_LABELS[yMetric]}
                  stroke="#666"
                  tick={{ fill: '#888', fontSize: 11 }}
                  label={{ 
                    value: METRIC_LABELS[yMetric], 
                    angle: -90, 
                    position: 'insideLeft', 
                    fill: '#888',
                    fontSize: 12,
                    style: { textAnchor: 'middle' }
                  }}
                />
                <ZAxis 
                  type="number" 
                  dataKey="market_cap" 
                  range={[60, 600]} 
                  name="Market Cap"
                />
                <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#444' }} />
                
                {/* regression line */}
                {data.regression?.line && (
                  <ReferenceLine
                    segment={data.regression.line}
                    stroke="#C68E56"
                    strokeWidth={2}
                    strokeDasharray="8 4"
                    label={{
                      value: "Fair Value Line",
                      position: "insideTopRight",
                      fill: "#C68E56",
                      fontSize: 10
                    }}
                  />
                )}
                
                <Scatter 
                  name="Stocks" 
                  data={data.points}
                  cursor="pointer"
                >
                  {data.points.map((entry: any, index: number) => (
                    <Cell 
                      key={`cell-${index}`}
                      fill={entry.valuation === "overvalued" ? "#D65A5A" : "#4E9F76"}
                      fillOpacity={0.7}
                      stroke={entry.valuation === "overvalued" ? "#D65A5A" : "#4E9F76"}
                      strokeWidth={1}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Scale size={48} className="mx-auto mb-4 opacity-30" />
                <p>No data available for selected criteria</p>
                <p className="text-sm mt-1">Try backfilling fundamentals or selecting a different sector</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* insights grid */}
      {data?.points?.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* undervalued picks */}
          <div className="luxury-card p-6 rounded-2xl">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/5">
              <TrendingDown size={20} className="text-success" />
              <h2 className="text-lg font-bold text-white uppercase tracking-wider font-instrument">
                Undervalued Picks
              </h2>
            </div>
            
            {topUndervalued.length > 0 ? (
              <div className="space-y-2">
                {topUndervalued.map((stock: any) => (
                  <Link href={`/stock/${stock.ticker}`} key={stock.ticker}>
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer border border-transparent hover:border-success/20">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-background border border-white/10 flex items-center justify-center text-xs font-bold text-white group-hover:border-success/50 transition-colors overflow-hidden relative">
                          <img 
                            src={`https://files.marketindex.com.au/xasx/96x96-png/${stock.ticker.toLowerCase()}.png`}
                            className="w-full h-full object-cover"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                          <span className="absolute inset-0 flex items-center justify-center -z-10">{stock.ticker[0]}</span>
                        </div>
                        <div>
                          <span className="block font-bold text-white">{stock.ticker}</span>
                          <span className="block text-xs text-gray-500 truncate max-w-40">{stock.name}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="block font-mono text-white text-sm">${stock.price?.toFixed(2)}</span>
                        <span className="block text-xs font-bold text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                          {stock.residual.toFixed(2)} below
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No undervalued stocks found in this analysis.</p>
            )}
          </div>
          
          {/* overvalued picks */}
          <div className="luxury-card p-6 rounded-2xl">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/5">
              <TrendingUp size={20} className="text-danger" />
              <h2 className="text-lg font-bold text-white uppercase tracking-wider font-instrument">
                Overvalued Picks
              </h2>
            </div>
            
            {topOvervalued.length > 0 ? (
              <div className="space-y-2">
                {topOvervalued.map((stock: any) => (
                  <Link href={`/stock/${stock.ticker}`} key={stock.ticker}>
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer border border-transparent hover:border-danger/20">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-background border border-white/10 flex items-center justify-center text-xs font-bold text-white group-hover:border-danger/50 transition-colors overflow-hidden relative">
                          <img 
                            src={`https://files.marketindex.com.au/xasx/96x96-png/${stock.ticker.toLowerCase()}.png`}
                            className="w-full h-full object-cover"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                          <span className="absolute inset-0 flex items-center justify-center -z-10">{stock.ticker[0]}</span>
                        </div>
                        <div>
                          <span className="block font-bold text-white">{stock.ticker}</span>
                          <span className="block text-xs text-gray-500 truncate max-w-40">{stock.name}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="block font-mono text-white text-sm">${stock.price?.toFixed(2)}</span>
                        <span className="block text-xs font-bold text-danger bg-danger/10 px-2 py-0.5 rounded-full border border-danger/20">
                          +{stock.residual.toFixed(2)} above
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No overvalued stocks found in this analysis.</p>
            )}
          </div>
          
        </div>
      )}
    </div>
  );
}

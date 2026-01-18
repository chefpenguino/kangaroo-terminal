"use client";
import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Loader2, Layers, ChevronRight, ChevronDown, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Treemap, ResponsiveContainer } from "recharts";

// tooltip always on top 
const FloatingTooltip = ({ data, position }: any) => {
  if (!data) return null;
  
  // don't go off screen
  const style = {
    top: position.y + 15,
    left: position.x + 15,
  };

  return (
    <div 
        className="fixed pointer-events-none z-9999 bg-surface border border-white/10 p-3 rounded-lg shadow-2xl w-48 animate-in fade-in zoom-in-95 duration-150"
        style={style}
    >
        <div className="flex items-center gap-2 mb-2">
            <img 
                src={`https://files.marketindex.com.au/xasx/96x96-png/${data.name.toLowerCase()}.png`}
                className="w-6 h-6 rounded-full bg-white object-cover"
                onError={(e) => (e.currentTarget.style.display = 'none')}
            />
            <p className="text-white font-bold text-lg leading-none">{data.name}</p>
        </div>
        <p className="text-gray-400 text-xs mb-2 truncate">{data.fullName}</p>
        <div className="flex items-center justify-between text-xs font-mono border-t border-white/5 pt-2">
            <span className="text-gray-500">${(data.size / 1_000_000_000).toFixed(1)}B</span>
            <span className={data.change >= 0 ? "text-success font-bold" : "text-danger font-bold"}>
                {data.change > 0 ? "+" : ""}{data.change}%
            </span>
        </div>
    </div>
  );
};

// stock cell content
const StockContent = (props: any) => {
  const { x, y, width, height, name, change, depth, fullName, size, onHover, onLeave } = props;

  if (depth !== 2) return null;

  const val = parseFloat(change); 
  const absVal = Math.abs(val);
  
  let bgColor = "#2a2e39"; 
  if (val > 0) {
      if (absVal < 1.0) bgColor = "#354641"; 
      else if (absVal < 3.0) bgColor = "#006348"; 
      else bgColor = "#089981"; 
  } else if (val < 0) {
      if (absVal < 1.0) bgColor = "#4a2c2e"; 
      else if (absVal < 3.0) bgColor = "#8f262f"; 
      else bgColor = "#f23645"; 
  }

  const minDim = Math.min(width, height);
  const showLogo = minDim > 40;    
  const showText = minDim > 60;
  const showChange = minDim > 80;

  // dynamic size 
  let iconClass = "w-5 h-5";
  let textClass = "text-[10px]";
  let subTextClass = "text-[9px]";

  if (minDim > 160) {
      iconClass = "w-10 h-10 mb-2";
      textClass = "text-xl";
      subTextClass = "text-sm font-bold";
  } else if (minDim > 100) {
      iconClass = "w-8 h-8 mb-1";
      textClass = "text-sm";
      subTextClass = "text-xs";
  }

  return (
    <g>// --- STOCK BLOCK ---

      <foreignObject x={x} y={y} width={width} height={height}>
        <Link href={`/stock/${name}`} className="block w-full h-full">
            <div 
                className="w-full h-full border border-background transition-all duration-200 hover:brightness-125 hover:z-50 flex flex-col items-center justify-center text-center p-0.5 overflow-hidden relative"
                style={{ backgroundColor: bgColor }}
                onMouseEnter={(e) => onHover({ name, fullName, change, size }, e)}
                onMouseLeave={onLeave}
            >
                {showLogo && (
                    <div className={`${iconClass} shrink-0 rounded-full bg-white p-px shadow-sm flex items-center justify-center overflow-hidden`}>
                        <img 
                            src={`https://files.marketindex.com.au/xasx/96x96-png/${name.toLowerCase()}.png`}
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                            className="w-full h-full object-cover rounded-full"
                        />
                    </div>
                )}

                {showText && (
                    <span className={`text-white font-bold leading-none drop-shadow-md z-10 font-sans tracking-tight ${textClass}`}>
                        {name}
                    </span>
                )}
                
                {showChange && (
                    <span className={`text-white/90 font-mono mt-0.5 drop-shadow-md z-10 ${subTextClass}`}>
                        {val > 0 ? "+" : ""}{val}%
                    </span>
                )}
            </div>
        </Link>
      </foreignObject>
    </g>
  );
};

// sector text overlay
const SectorOverlay = (props: any) => {
    const { x, y, width, height, name, depth, onSectorClick, selectedSector } = props;
  
    if (depth !== 1) return null;

    const isSelected = selectedSector === name;
  
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="none"
          stroke="#0F0B08"
          strokeWidth="4"
        />
        
        {/* header */}
        <foreignObject x={x + 2} y={y + 2} width={width - 4} height={28}>
            <div 
                onClick={() => onSectorClick(name)}
                className={`w-full h-full border-b border-white/10 flex items-center px-2 cursor-pointer transition-colors group pointer-events-auto ${isSelected ? "bg-[#2A1E17] text-primary" : "bg-surface hover:bg-[#2A1E17]"}`}
            >
                <span className={`text-[10px] font-bold uppercase tracking-wider truncate flex items-center gap-1 ${isSelected ? "text-primary" : "text-gray-400 group-hover:text-primary"}`}>
                    {name} 
                    {isSelected ? <ChevronDown size={10} /> : <ChevronRight size={10} className="group-hover:translate-x-0.5 transition-transform" />}
                </span>
            </div>
        </foreignObject>
      </g>
    );
  };

export default function ScreenerPage() {
  const [movers, setMovers] = useState<any>(null);
  const [marketMap, setMarketMap] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  
  // tooltip state
  const [hoveredStock, setHoveredStock] = useState<any>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [moversRes, mapRes] = await Promise.all([
          fetch("http://localhost:8000/market-movers"),
          fetch("http://localhost:8000/sector-performance")
        ]);
        
        setMovers(await moversRes.json());
        setMarketMap(await mapRes.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  // track mouse for smooth tooltip
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const displayedMap = selectedSector 
    ? marketMap.filter(s => s.name === selectedSector) 
    : marketMap;

  const handleSectorToggle = (sectorName: string) => {
      setSelectedSector(prev => prev === sectorName ? null : sectorName);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] text-stone-400 gap-4">
        <Loader2 className="animate-spin text-primary" size={48} />
        <p className="text-l">Scanning Market Data...</p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-700 space-y-8 pb-10">
      
      {/* header */}
      <div>
        <h1 className="text-4xl text-white font-instrument mb-2">Market Screener</h1>
        <p className="text-gray-500">Real-time sector analysis and top movers.</p>
      </div>

      {/* heatmap container */}
      <div className="luxury-card p-1 rounded-2xl h-175 flex flex-col relative border border-white/5">
        
        {/* toolbar */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/5 bg-[#15100d] z-20 relative rounded-t-2xl">
            <div className="flex items-center">
                <h2 className="text-s font-bold text-white tracking-widest font-instrument">
                    {selectedSector ? selectedSector : "ASX 200 HEATMAP"}
                </h2>
            </div>
        </div>
        
        {/* visualisation container */}
        <div className="flex-1 min-h-0 bg-background relative rounded-b-xl overflow-hidden"> 
            
            {/* stocks (bottom) */}
            <div className="absolute inset-0 z-0 pt-0.5">
                <ResponsiveContainer width="100%" height="100%">
                    <Treemap
                        data={displayedMap}
                        dataKey="size"
                        stroke="none"
                        aspectRatio={4/3} 
                        // hover handlers
                        content={(props) => <StockContent {...props} onHover={(d: any) => setHoveredStock(d)} onLeave={() => setHoveredStock(null)} />}
                        isAnimationActive={false}
                    />
                </ResponsiveContainer>
            </div>

            {/* sector overlay */}
            <div className="absolute inset-0 z-10 pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                    <Treemap
                        data={displayedMap}
                        dataKey="size"
                        stroke="none"
                        fill="none" 
                        aspectRatio={4/3}
                        content={(props) => <SectorOverlay {...props} onSectorClick={handleSectorToggle} selectedSector={selectedSector} />}
                        isAnimationActive={false}
                    />
                </ResponsiveContainer>
            </div>

        </div>
      </div>

      {/* floating tooltip (on top of everything) */}
      <FloatingTooltip data={hoveredStock} position={mousePos} />

      {/* movers grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* top gainers */}
        <div className="luxury-card p-6 rounded-2xl">
            <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-4">
                <TrendingUp size={20} className="text-success" />
                <h2 className="text-lg font-bold text-white uppercase tracking-wider font-instrument">Top Gainers</h2>
            </div>
            <div className="space-y-2">
                {movers?.gainers.map((stock: any) => (
                    <Link href={`/stock/${stock.ticker}`} key={stock.ticker}>
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer border border-transparent hover:border-white/5">
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
                                    <span className="block text-xs text-gray-500 truncate max-w-50">{stock.name}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="block font-mono text-white text-sm">${stock.price}</span>
                                <span className="block text-xs font-bold text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                                    +{stock.change_percent}
                                </span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>

        {/* top losers */}
        <div className="luxury-card p-6 rounded-2xl">
            <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-4">
                <TrendingDown size={20} className="text-danger" />
                <h2 className="text-lg font-bold text-white uppercase tracking-wider font-instrument">Top Losers</h2>
            </div>
            <div className="space-y-2">
                {movers?.losers.map((stock: any) => (
                    <Link href={`/stock/${stock.ticker}`} key={stock.ticker}>
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer border border-transparent hover:border-white/5">
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
                                    <span className="block text-xs text-gray-500 truncate max-w-50">{stock.name}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="block font-mono text-white text-sm">${stock.price}</span>
                                <span className="block text-xs font-bold text-danger bg-danger/10 px-2 py-0.5 rounded-full border border-danger/20">
                                    {stock.change_percent}
                                </span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>

      </div>
    </div>
  );
}
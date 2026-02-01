"use client";

import { useEffect, useState } from "react";
import { 
  ScatterChart, 
  Scatter, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Label
} from "recharts";
import { Loader2, RefreshCw, Info } from "lucide-react";

const QUADRANTS = [
  {
    label: "LEADING",
    x1: 100, x2: 110, y1: 0, y2: 10,
    fill: "rgba(34, 197, 94, 0.05)", // green
    textColor: "#22c55e"
  },
  {
    label: "WEAKENING",
    x1: 100, x2: 110, y1: -10, y2: 0,
    fill: "rgba(234, 179, 8, 0.05)", // yellow
    textColor: "#eab308"
  },
  {
    label: "LAGGING",
    x1: 90, x2: 100, y1: -10, y2: 0,
    fill: "rgba(239, 68, 68, 0.05)", // red
    textColor: "#ef4444" 
  },
  {
    label: "IMPROVING",
    x1: 90, x2: 100, y1: 0, y2: 10,
    fill: "rgba(59, 130, 246, 0.05)", // blue
    textColor: "#3b82f6"
  }
];

// colors for sectors
const SECTOR_COLORS = [
  "#F59E0B", // amber
  "#10B981", // emerald
  "#3B82F6", // blue
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#EF4444", // red
  "#6366F1", // indigo
  "#14B8A6", // teal
  "#F97316", // orange
  "#84CC16"  // lime
];

export default function CyclesClient() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);

  // chart settings
  const [period, setPeriod] = useState<"weekly" | "daily">("weekly");
  const [range, setRange] = useState<number>(10);
  const [showTrails, setShowTrails] = useState(true);

  // set bounds for chart
  const [xDomain, setXDomain] = useState([96, 104]); 
  const [yDomain, setYDomain] = useState([-4, 4]);

  useEffect(() => {
    fetchCycles();
    // poll every 2s (live)
    const interval = setInterval(fetchCycles, 2000);
    return () => clearInterval(interval);
  }, [period, range]); // refetch when settings change

  const fetchCycles = async () => {
    try {
      const res = await fetch(`http://localhost:8000/cycles?frequency=${period}&range=${range}`);
      if (!res.ok) throw new Error("failed to fetch cycles");
      const json = await res.json();
      setData(json);
      
      // adjust domains based on data
      let minX = 100, maxX = 100;
      let minY = 0, maxY = 0;
      
      json.forEach((item: any) => {
        item.tail.forEach((pt: any) => {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        });
      });
      
      // add padding
      const xPad = (maxX - minX) * 0.1 || 2;
      const yPad = (maxY - minY) * 0.1 || 1;
      
      setXDomain([minX - xPad, maxX + xPad]);
      setYDomain([minY - yPad, maxY + yPad]);
      
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-surface border border-white/10 p-3 rounded-lg shadow-xl backdrop-blur-md">
          <p className="font-instrument text-lg text-primary">{dataPoint.name}</p>
          <div className="text-xs text-gray-400 mt-1 space-y-1">
            <p>RS-Ratio: <span className="text-white">{dataPoint.x}</span></p>
            <p>Momentum: <span className="text-white">{dataPoint.y}</span></p>
            <p className="opacity-50">{dataPoint.date}</p>
          </div>
        </div>
      );
    }
    return null;
  };

  // render background quadrants
  const renderQuadrants = () => {
     return (
       <>
         {/* top right - leading */}
         <ReferenceArea 
            x1={100} x2={xDomain[1]} 
            y1={0} y2={yDomain[1]} 
            fill="rgba(34, 197, 94, 0.05)" 
            strokeOpacity={0}
         />
         {/* bottom right - weakening */}
         <ReferenceArea 
            x1={100} x2={xDomain[1]} 
            y1={yDomain[0]} y2={0} 
            fill="rgba(234, 179, 8, 0.05)" 
            strokeOpacity={0}
         />
         {/* bottom left - lagging */}
         <ReferenceArea 
            x1={xDomain[0]} x2={100} 
            y1={yDomain[0]} y2={0} 
            fill="rgba(239, 68, 68, 0.05)" 
            strokeOpacity={0}
         />
         {/* top left - improving */}
         <ReferenceArea 
            x1={xDomain[0]} x2={100} 
            y1={0} y2={yDomain[1]} 
            fill="rgba(59, 130, 246, 0.05)" 
            strokeOpacity={0}
         />
         
         <Label x={xDomain[1] - (xDomain[1]-100)/2} y={yDomain[1]*0.9} value="LEADING" position="insideTopRight" fill="#22c55e" fontSize={24} fontWeight="bold" opacity={0.3} />
         <Label x={xDomain[1] - (xDomain[1]-100)/2} y={yDomain[0]*0.9} value="WEAKENING" position="insideBottomRight" fill="#eab308" fontSize={24} fontWeight="bold" opacity={0.3} />
         <Label x={xDomain[0] + (100-xDomain[0])/2} y={yDomain[0]*0.9} value="LAGGING" position="insideBottomLeft" fill="#ef4444" fontSize={24} fontWeight="bold" opacity={0.3} />
         <Label x={xDomain[0] + (100-xDomain[0])/2} y={yDomain[1]*0.9} value="IMPROVING" position="insideTopLeft" fill="#3b82f6" fontSize={24} fontWeight="bold" opacity={0.3} />
       </>
     )
  }

  return (
    <div className="p-8 max-w-400 mx-auto min-h-screen">
       <header className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
           <h1 className="mb-1 font-instrument text-4xl tracking-tight bg-linear-to-br via-stone-200 bg-clip-text text-transparent drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.5)] whitespace-nowrap overflow-hidden">
             Market Cycle Engine
           </h1>
           <p className="text-gray-400 text-sm">Relative Strength vs Momentum of sectors.</p>
        </div>

        {/* controls */}
        <div className="flex items-center gap-4 bg-surface/50 border border-white/5 rounded-full px-4 py-2 backdrop-blur-md shadow-lg">
            
            {/* period selector */}
             <div className="flex items-center gap-2 border-r border-white/10 pr-4">
                <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Period</span>
                <select 
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as any)}
                    className="bg-transparent text-sm font-medium text-white focus:outline-none cursor-pointer hover:text-primary transition-colors appearance-none"
                    style={{ backgroundImage: 'none' }} 
                >
                    <option value="weekly" className="bg-surface text-gray-200">Weekly</option>
                    <option value="daily" className="bg-surface text-gray-200">Daily</option>
                </select>
             </div>

             {/* range slider */}
             <div className="flex items-center gap-3 border-r border-white/10 pr-4">
                <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Range ({range})</span>
                <input 
                    type="range" 
                    min="2" 
                    max="20" 
                    value={range}
                    onChange={(e) => setRange(Number(e.target.value))}
                    className="w-20 accent-primary cursor-pointer h-1 bg-white/10 rounded-full appearance-none"
                />
             </div>

             {/* trails toggle */}
             <div className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-white/5" onClick={() => setShowTrails(!showTrails)}>
                <div className={`w-3 h-3 rounded-xs border ${showTrails ? 'bg-primary border-primary' : 'border-gray-500'}`}>
                    {showTrails && <div className="text-black text-[10px] flex items-center justify-center font-bold leading-none">✓</div>}
                </div>
                <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider select-none">Trail</span>
             </div>
        </div>
      </header>
      
      <div className="luxury-card flex flex-col md:flex-row h-175 md:h-200 overflow-hidden bg-black/40">
        {/* chart area */}
        <div className="flex-1 relative h-full p-4 md:p-6 min-h-125">
        {loading ? (
             <div className="absolute inset-0 flex items-center justify-center flex-col gap-4">
                <Loader2 className="animate-spin text-primary" size={40} />
                <p className="text-primary font-instrument">Calculating Orbits...</p>
             </div>
        ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{ top: 20, right: 30, bottom: 20, left: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                    type="number" 
                    dataKey="x" 
                    name="RS-Ratio" 
                    domain={xDomain} 
                    stroke="#555"
                    tick={{fill: '#888'}}
                    tickFormatter={(val) => val.toFixed(2)}
                    allowDataOverflow={true}
                >
                    <Label value="Relative Strength (RS-Ratio)" offset={0} position="insideBottom" fill="#666" />
                </XAxis>
                <YAxis 
                    type="number" 
                    dataKey="y" 
                    name="Momentum" 
                    domain={yDomain} 
                    stroke="#555"
                    tick={{fill: '#888'}}
                    tickFormatter={(val) => val.toFixed(2)}
                    allowDataOverflow={true}
                >
                    <Label value="Momentum (ROC)" angle={-90} position="insideLeft" fill="#666" style={{ textAnchor: 'middle' }} />
                </YAxis>
                
                {renderQuadrants()}
                
                <ReferenceLine x={100} stroke="#444" strokeDasharray="5 5" />
                <ReferenceLine y={0} stroke="#444" strokeDasharray="5 5" />
                
                <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                
                {data.map((sector, index) => {
                    const color = SECTOR_COLORS[index % SECTOR_COLORS.length];
                    const isHovered = hoveredSector === sector.name;
                    const isAnyHovered = hoveredSector !== null;
                    const opacity = isAnyHovered ? (isHovered ? 1 : 0.1) : 0.8;
                    const strokeWidth = isHovered ? 3 : 1.5;

                    // prepare data with arrow info
                    const scatterData = sector.tail.map((pt: any, i: number) => {
                       const isHead = i === sector.tail.length - 1;
                       
                       // calculate visual angle for arrow 
                       let angle = 0;
                       if (isHead && i > 0) {
                          const prev = sector.tail[i - 1]; 
                          // x range ~20, y range ~10. y is visually stretched 2x relative to x
                          const dx = pt.x - prev.x;
                          const dy = (pt.y - prev.y) * 2; 
                          angle = Math.atan2(dy, dx) * (180 / Math.PI);
                       }

                       return {
                        ...pt,
                        name: sector.name,
                        isHead,
                        angle
                       }
                    });

                    return (
                        <Scatter 
                            key={sector.ticker}
                            name={sector.name}
                            data={showTrails ? scatterData : [scatterData[scatterData.length - 1]]} 
                            fill={color} 
                            line={showTrails ? { stroke: color, strokeWidth: strokeWidth } : undefined}
                            shape={(props: any) => {
                                const { cx, cy, payload } = props;
                                if (payload.isHead) {
                                    return (
                                        <g transform={`translate(${cx},${cy}) rotate(${-payload.angle})`}>
                                            {/* arrow head (triangle) */}
                                            <path 
                                                d="M 10 0 L -8 7 L -8 -7 Z" 
                                                fill={color} 
                                                stroke="none"
                                                filter="drop-shadow(0px 2px 2px rgba(0,0,0,0.5))"
                                            />
                                        </g>
                                    );
                                }
                                // tail dots (small)
                                return <circle cx={cx} cy={cy} r={2} fill={color} fillOpacity={0.6} />;
                            }}
                            opacity={opacity}
                            onMouseEnter={() => setHoveredSector(sector.name)}
                            onMouseLeave={() => setHoveredSector(null)}
                            onClick={() => console.log(sector)}
                        />
                    )
                })}
              </ScatterChart>
            </ResponsiveContainer>
        )}
        </div>
        
        {/* legend sidebar */}
        {!loading && (
            <div className="w-full md:w-56 border-t md:border-t-0 md:border-l border-white/5 bg-background/30 backdrop-blur-sm p-4 overflow-y-auto">
                <h3 className="text-[10px] font-bold uppercase text-gray-500 mb-4 tracking-wider flex items-center gap-2">
                  <Info size={12} /> Sectors
                </h3>
                <div className="space-y-1">
                    {data.map((sector, index) => (
                        <div 
                            key={sector.ticker} 
                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all duration-200 group/item hover:bg-white/5 ${hoveredSector && hoveredSector !== sector.name ? 'opacity-30' : 'opacity-100'}`}
                            onMouseEnter={() => setHoveredSector(sector.name)}
                            onMouseLeave={() => setHoveredSector(null)}
                        >
                            <div 
                                className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] shrink-0" 
                                style={{ backgroundColor: SECTOR_COLORS[index % SECTOR_COLORS.length], color: SECTOR_COLORS[index % SECTOR_COLORS.length] }} 
                            />
                            <span className="text-xs text-gray-300 font-medium group-hover/item:text-white transition-colors truncate">{sector.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </div>
      
      {/* explanation */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
        <div className="luxury-card p-6 rounded-xl border border-green-500/20 bg-green-500/5 hover:bg-green-500/10 transition-colors">
            <h4 className="font-instrument text-xl font-bold text-green-500 mb-2">Leading</h4>
            <div className="text-xs font-bold uppercase tracking-wider text-green-400/70 mb-3">Top Right Quadrant</div>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">
                 Strong trend beating the market. <br/>
                 <span className="font-mono text-xs opacity-70">RS &gt; 100, Momentum +ve</span>
            </p>
            <div className="flex items-center gap-2 text-green-400 text-xs font-bold bg-green-500/10 py-2 px-3 rounded-lg border border-green-500/20 w-fit">
                <span>BUY / HOLD</span>
            </div>
        </div>
        
        <div className="luxury-card p-6 rounded-xl border border-yellow-500/20 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors">
            <h4 className="font-instrument text-xl font-bold text-yellow-500 mb-2">Weakening</h4>
            <div className="text-xs font-bold uppercase tracking-wider text-yellow-400/70 mb-3">Bottom Right Quadrant</div>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">
                 Still strong but losing momentum. <br/>
                 <span className="font-mono text-xs opacity-70">RS &gt; 100, Momentum -ve</span>
            </p>
            <div className="flex items-center gap-2 text-yellow-400 text-xs font-bold bg-yellow-500/10 py-2 px-3 rounded-lg border border-yellow-500/20 w-fit">
                <span>TAKE PROFIT</span>
            </div>
        </div>

        <div className="luxury-card p-6 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 transition-colors">
            <h4 className="font-instrument text-xl font-bold text-red-500 mb-2">Lagging</h4>
            <div className="text-xs font-bold uppercase tracking-wider text-red-400/70 mb-3">Bottom Left Quadrant</div>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">
                 Weak trend underperforming index. <br/>
                 <span className="font-mono text-xs opacity-70">RS &lt; 100, Momentum -ve</span>
            </p>
            <div className="flex items-center gap-2 text-red-400 text-xs font-bold bg-red-500/10 py-2 px-3 rounded-lg border border-red-500/20 w-fit">
                 <span>AVOID / SHORT</span>
            </div>
        </div>
        
         <div className="luxury-card p-6 rounded-xl border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-colors">
            <h4 className="font-instrument text-xl font-bold text-blue-500 mb-2">Improving</h4>
            <div className="text-xs font-bold uppercase tracking-wider text-blue-400/70 mb-3">Top Left Quadrant</div>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">
                 Momentum turning up, price cheap. <br/>
                 <span className="font-mono text-xs opacity-70">RS &lt; 100, Momentum +ve</span>
            </p>
            <div className="flex items-center gap-2 text-blue-400 text-xs font-bold bg-blue-500/10 py-2 px-3 rounded-lg border border-blue-500/20 w-fit">
                <span>WATCHLIST</span>
            </div>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { TrendingUp, ChevronUp, ChevronDown, History, AlertCircle } from "lucide-react";
import { useSidebar } from "@/context/SidebarContext"; 
import { motion, AnimatePresence } from "framer-motion";

export default function StatusBar() {
  const [account, setAccount] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);
  const { isCollapsed } = useSidebar(); 

  const fetchData = async () => {
    try {
      const [accRes, txRes] = await Promise.all([
          fetch("http://localhost:8000/account"),
          fetch("http://localhost:8000/transactions")
      ]);
      
      if (accRes.ok) setAccount(await accRes.json());
      if (txRes.ok) setTransactions(await txRes.json());
      
    } catch(e) { console.error(e) }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 1000); // poll every 1s (live updates)
    return () => clearInterval(interval);
  }, []);

  if (!account) return null;

  // calculate daily p&l (mock for now)
  const isPositive = account.total_equity >= 100000;
  const pnlColor = isPositive ? "text-success" : "text-danger";

  return (
    <>
      {/* drawwer panel + slideup */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            // dynamic left margin based on sidebar
            className="fixed bottom-10 right-0 h-64 bg-surface border-t border-white/10 z-40 shadow-2xl flex flex-col"
            style={{ left: isCollapsed ? "5rem" : "16rem" }}
          >
            <div className="p-6 grid grid-cols-4 gap-8 h-full">
                
                {/* account summary */}
                <div className="space-y-4 border-r border-white/5 pr-6">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Account Summary</h3>
                    <div>
                        <p className="text-gray-400 text-sm">Net Liquidation Value</p>
                        <p className="text-2xl font-bold text-white font-mono">${account.total_equity.toLocaleString()}</p>
                    </div>
                    <div>
                        <p className="text-gray-400 text-sm">Buying Power</p>
                        <p className="text-xl font-bold text-primary font-mono">${account.buying_power.toLocaleString()}</p>
                    </div>
                </div>

                {/* p&l stats */}
                <div className="space-y-4 border-r border-white/5 pr-6">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Performance</h3>
                    <div>
                        <p className="text-gray-400 text-sm">Unrealized P&L</p>
                        <div className={`flex items-center gap-2 ${pnlColor}`}>
                            <TrendingUp size={20} />
                            <span className="text-xl font-bold font-mono">
                                ${(account.total_equity - 100000).toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>

                {/* recent activity */}
                <div className="col-span-2 overflow-y-auto custom-scrollbar pr-2">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2 sticky top-0 bg-surface py-2">
                        <History size={14} /> Recent Orders
                    </h3>
                    
                    {transactions.length > 0 ? (
                        <div className="space-y-2">
                            {transactions.map((tx: any) => (
                                <div key={tx.id} className="flex items-center justify-between p-3 rounded bg-black/20 border border-white/5 text-xs">
                                    <div className="flex items-center gap-3">
                                        <span className={`font-bold px-2 py-0.5 rounded ${tx.type === "BUY" ? "bg-success/20 text-success" : "bg-danger/20 text-danger"}`}>
                                            {tx.type}
                                        </span>
                                        <span className="font-bold text-white">{tx.ticker}</span>
                                        <span className="text-gray-500">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <div className="font-mono text-gray-300">
                                        {tx.shares} @ ${tx.price.toFixed(2)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-black/20 rounded-lg p-4 text-center text-gray-500 text-sm italic">
                            No recent orders in this session.
                        </div>
                    )}
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* bar */}
      <motion.div 
        layout
        // dynamic left margin based on sidebar
        style={{ left: isCollapsed ? "5rem" : "16rem" }}
        className="fixed bottom-0 right-0 h-10 bg-[#15100d] border-t border-white/10 z-50 flex items-center px-4 justify-between text-xs font-mono cursor-pointer hover:bg-[#1f1814] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
            <span className="text-gray-500">Position:</span>
            <span className={`${pnlColor} font-bold animate-pulse`}>
                {isPositive ? "Profit" : "Loss"}
            </span>
            </div>
            
            <div className="h-4 w-px bg-white/10"></div>

            <div className="flex items-center gap-2">
                <span className="text-gray-500 uppercase tracking-wider font-bold">Equity</span>
                <span className="text-white font-bold">${account.total_equity.toLocaleString()}</span>
            </div>

            <div className="flex items-center gap-2">
                <span className="text-gray-500 uppercase tracking-wider font-bold">Cash</span>
                <span className="text-white">${account.cash.toLocaleString()}</span>
            </div>
        </div>

        <div className="flex items-center gap-4">
            {account.buying_power < 1000 && (
                <div className="flex items-center gap-1 text-orange-500">
                    <AlertCircle size={12} />
                    <span>Low Funds</span>
                </div>
            )}
            <div className="p-1 bg-white/5 rounded hover:bg-white/10 text-gray-400">
                {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </div>
        </div>
      </motion.div>
    </>
  );
}
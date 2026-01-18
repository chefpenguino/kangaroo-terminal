"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  ScanLine,
  Newspaper,
  BrainCircuit,
  Activity,
  ChevronLeft,
  ChevronRight,
  Star,
  Briefcase
} from "lucide-react";
import { useSidebar } from "@/context/SidebarContext"

// accepts label & icon
const NavItem = ({ href, label, icon: Icon, active, layoutId, collapsed }: any) => (
  <Link
  href={href}
  prefetch={true}
  className={`relative flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-4"} py-3 mx-2 mb-2 rounded-xl transition-colors duration-200 group ${
    active
    ? "text-white" 
    : "text-gray-500 hover:text-white hover:bg-white/5"
  }`}
  >
  {active && (
    <motion.div
    layoutId={layoutId}
    className="absolute inset-0 nav-item-active rounded-xl"
    initial={false}
    transition={{ type: "spring", stiffness: 350, damping: 30 }}
    />
  )}
  <Icon size={20} className={`relative z-10 ${active ? "text-primary" : "text-gray-500 group-hover:text-white"}`} />
  
    {!collapsed && (
      <span className="relative z-10 font-medium text-sm tracking-wide whitespace-nowrap overflow-hidden">
      {label}
    </span>
    )}
  </Link>
);

export default function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleSidebar } = useSidebar(); // use state

  return (
  <motion.aside 
    initial={{ width: 256 }}
    animate={{ width: isCollapsed ? 80 : 256 }}
    transition={{ type: "spring", stiffness: 300, damping: 30 }}
    className="fixed left-0 top-0 h-screen bg-background border-r border-white/5 flex flex-col z-50 group/sidebar"
  >
    {/* toggle button (positioned on the edge) */}
    <button 
    onClick={toggleSidebar}
    className={`absolute -right-3 top-10 -translate-y-1/2 z-50 p-1.5 bg-surface border border-primary/40 rounded-full text-primary hover:text-white hover:border-primary hover:shadow-[0_0_15px_rgba(198,142,86,0.4)] transition-all duration-300 ${isCollapsed ? "top-10" : "top-11"}`}
    >
    {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
    </button>

    {/* logo area */}
    <div className={`py-6 flex ${isCollapsed ? "justify-center px-0" : "px-5"}`}>
    <div className="flex items-center gap-2.5">
      {/* logo image */}
      <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden shadow-[0_0_12px_rgba(198,142,86,0.4)] border border-white/10 relative">
      <img
        src="/assets/circle.png"
        alt="Kangaroo Terminal Logo"
        className="w-full h-full object-cover scale-140"
      />
      </div>

      {!isCollapsed && (
        <h1 
        className="text-[1.7rem] font-instrument tracking-tight bg-linear-to-br via-stone-200 bg-clip-text text-transparent drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.5)] whitespace-nowrap overflow-hidden">
        KangarooTerminal
        </h1>
      )}
    </div>
    </div>

    {/* nav links */}
    <nav className="flex-1 mt-4">
    {!isCollapsed && <div className="px-6 mb-2 text-xs font-bold text-gray-700 uppercase tracking-wider animate-in fade-in">Menu</div>}
    
    <NavItem href="/" label="Dashboard" icon={LayoutDashboard} active={pathname === "/"} layoutId="nav-highlight" collapsed={isCollapsed} />
    <NavItem href="/watchlist" label="Watchlist" icon={Star} active={pathname === "/watchlist"} layoutId="nav-highlight" collapsed={isCollapsed} />
    <NavItem href="/screener" label="Screener" icon={ScanLine} active={pathname === "/screener"} layoutId="nav-highlight" collapsed={isCollapsed} />
    <NavItem href="/portfolio" label="Portfolio" icon={Briefcase} active={pathname === "/portfolio"} layoutId="nav-highlight" collapsed={isCollapsed} />
    
    {!isCollapsed && <div className="px-6 mb-2 mt-6 text-xs font-bold text-gray-700 uppercase tracking-wider animate-in fade-in">Intelligence</div>}
    <NavItem href="/ai" label="AI Analyst" icon={BrainCircuit} active={pathname === "/ai"} layoutId="nav-highlight" collapsed={isCollapsed} />
    </nav>

    {/* status */}
    <div className="p-4">
    <div className={`luxury-card rounded-xl flex items-center gap-3 ${isCollapsed ? "p-2 justify-center" : "p-4"}`}>
      <div className="relative shrink-0">
      <Activity size={16} className="text-success" />
      <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-success animate-pulse -mr-1 -mt-1 shadow-[0_0_10px_#4E9F76]"></div>
      </div>
      
      {!isCollapsed && (
      <div className="overflow-hidden">
        <p className="text-xs text-gray-400 font-medium whitespace-nowrap">Scraper Status</p>
        <p className="text-[10px] text-success tracking-wider uppercase font-bold whitespace-nowrap">Operational</p>
      </div>
      )}
    </div>
    </div>
  </motion.aside>
  );
}

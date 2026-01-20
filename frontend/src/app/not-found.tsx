import Link from "next/link";
import { AlertTriangle, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-[80vh] text-center">
      <div className="p-6 bg-red-500/10 rounded-full mb-6 border border-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.2)]">
        <AlertTriangle size={64} className="text-red-500" />
      </div>
      <h1 className="text-5xl font-bold text-white mb-2 font-instrument">404</h1>
      <h2 className="text-xl text-gray-400 mb-8 font-mono">TICKER_NOT_FOUND</h2>
      <p className="text-gray-500 max-w-md mb-8 leading-relaxed">
        The asset you are looking for does not exist in our database or has been delisted from the ASX.
      </p>
    </div>
  );
}
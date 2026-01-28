"use client";

import { useEffect, useState, useRef } from "react";
import { X, Loader2, MessageSquare, AlertTriangle, TrendingUp, FileText, Send } from "lucide-react";

interface DocumentViewerProps {
    isOpen: boolean;
    onClose: () => void;
    docUrl: string;
    docTitle: string;
    ticker: string;
}

export default function DocumentViewer({ isOpen, onClose, docUrl, docTitle, ticker }: DocumentViewerProps) {
    const [analysis, setAnalysis] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [chatInput, setChatInput] = useState("");
    const [chatHistory, setChatHistory] = useState<any[]>([]);
    const [chatLoading, setChatLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("analysis"); // analysis | chat

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && docUrl && !analysis) {
            analyseDocument();
        }
    }, [isOpen, docUrl]);

    // scroll to bottom of chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatHistory, activeTab]);

    const analyseDocument = async () => {
        setLoading(true);
        try {
            const res = await fetch("http://localhost:8000/filings/analyse", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: docUrl, ticker })
            });
            const data = await res.json();
            setAnalysis(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const sendChatMessage = async () => {
        if (!chatInput.trim()) return;

        const userMsg = { role: "user", content: chatInput };
        setChatHistory(prev => [...prev, userMsg]);
        setChatInput("");
        setChatLoading(true);

        try {
            const res = await fetch("http://localhost:8000/filings/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: docUrl,
                    history: chatHistory,
                    question: userMsg.content
                })
            });
            const data = await res.json();
            setChatHistory(prev => [...prev, { role: "assistant", content: data.answer }]);
        } catch (e) {
            console.error(e);
        } finally {
            setChatLoading(false);
        }
    };

    if (!isOpen) return null;

    // helper to normalise guidance
    const renderGuidance = (guidance: any) => {
        if (!guidance) return "No explicit guidance provided.";
        if (typeof guidance === "string") return guidance;
        if (typeof guidance === "object") {
            return Object.entries(guidance).map(([key, val]) => `${key}: ${val}`).join("\n");
        }
        return String(guidance);
    };

    // helper to normalize risks 
    const getRisksArray = (risks: any): string[] => {
        if (!risks) return ["No specific risks identified."];
        if (Array.isArray(risks)) return risks.length > 0 ? risks : ["No specific risks identified."];
        if (typeof risks === "string") return risks ? [risks] : ["No specific risks identified."];
        return [String(risks)];
    };

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/95 backdrop-blur-xl transition-opacity"
                onClick={onClose}
            />

            <div className="luxury-card w-full max-w-[95vw] h-[90vh] relative z-10 rounded-2xl flex flex-col animate-in fade-in zoom-in-95 duration-300 shadow-2xl border border-white/10 overflow-hidden">

                {/* header */}
                <div className="flex justify-between items-center px-8 py-5 border-b border-white/5 bg-background/95 backdrop-blur">
                    <div className="flex items-center gap-3">
                        <h1 className="text-[1.7rem] font-instrument tracking-tight bg-linear-to-br from-white via-stone-200 to-stone-400 bg-clip-text text-transparent drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.5)]">
                            KangarooTerminal
                        </h1>
                        <div className="h-6 w-px bg-white/20"></div>
                        <div>
                            <p className="text-sm text-gray-400 leading-tight">{ticker} Filing</p>
                            <p className="text-xs text-gray-600 truncate max-w-md">{docTitle}</p>
                        </div>
                    </div>

                    {/* close */}
                    <button
                        onClick={onClose}
                        className="luxury-icon-button"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* content */}
                <div className="flex-1 flex overflow-hidden bg-background">

                    {/* left: PDF viewer */}
                    <div className="w-1/2 h-full bg-black border-r border-white/5 relative hidden lg:flex flex-col">
                        <div className="flex-1 relative">
                            {/* direct embed */}
                            <embed
                                src={docUrl}
                                type="application/pdf"
                                className="w-full h-full"
                            />
                        </div>
                        <div className="absolute bottom-4 right-4">
                            <a
                                href={docUrl}
                                target="_blank"
                                className="bg-black/70 hover:bg-black text-white text-xs px-3 py-2 rounded-lg backdrop-blur flex items-center gap-2 border border-white/10 transition-colors"
                            >
                                <FileText size={12} /> Open Original
                            </a>
                        </div>
                    </div>

                    {/* right: ai stuff */}
                    <div className="w-full lg:w-1/2 flex flex-col">

                        {/* tabs */}
                        <div className="flex border-b border-white/5 bg-background/50">
                            <button
                                onClick={() => setActiveTab("analysis")}
                                className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-all ${activeTab === "analysis" ? "text-primary border-b-2 border-primary bg-primary/5" : "text-gray-500 hover:text-gray-300"}`}
                            >
                                AI Analysis
                            </button>
                            <button
                                onClick={() => setActiveTab("chat")}
                                className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-all ${activeTab === "chat" ? "text-primary border-b-2 border-primary bg-primary/5" : "text-gray-500 hover:text-gray-300"}`}
                            >
                                Chat with Doc
                            </button>
                        </div>

                        {/* analysis view */}
                        {activeTab === "analysis" && (
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 bg-background">
                                {loading ? (
                                    <div className="flex flex-col items-center justify-center h-full space-y-4">
                                        <div className="relative">
                                            <Loader2 className="animate-spin text-primary" size={48} />
                                            <div className="absolute inset-0 blur-xl bg-primary/20 rounded-full"></div>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-white font-bold text-lg animate-pulse">Reading Document...</p>
                                            <p className="text-gray-500 text-sm">Extracting guidance, risks, and sentiment.</p>
                                        </div>
                                    </div>
                                ) : analysis ? (
                                    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">

                                        {/* sentiment thermometer */}
                                        <div className="bg-white/5 rounded-xl p-6 border border-white/5">
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className="text-sm font-bold text-gray-400 uppercase">Management Sentiment</h3>
                                                <span className={`text-2xl font-bold ${analysis.sentiment_score > 60 ? "text-success" : analysis.sentiment_score < 40 ? "text-danger" : "text-yellow-500"}`}>
                                                    {analysis.sentiment_score}/100
                                                </span>
                                            </div>
                                            {/* bar */}
                                            <div className="h-4 bg-black/50 rounded-full overflow-hidden relative mb-2">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-1000 ${analysis.sentiment_score > 60 ? "bg-success" : analysis.sentiment_score < 40 ? "bg-danger" : "bg-yellow-500"}`}
                                                    style={{ width: `${analysis.sentiment_score}%` }}
                                                />
                                            </div>
                                            <p className="text-sm text-gray-300 italic">"{analysis.sentiment_reasoning}"</p>
                                        </div>

                                        {/* executive summary */}
                                        <div>
                                            <h3 className="text-primary font-instrument text-2xl italic mb-3 flex items-center gap-2">
                                                <FileText size={20} /> Executive Summary
                                            </h3>
                                            <ul className="space-y-3">
                                                {analysis.summary?.map((item: string, i: number) => (
                                                    <li key={i} className="flex gap-3 text-gray-300 text-sm leading-relaxed">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                                                        {item}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        {/* guidance */}
                                        <div className="bg-blue-500/5 border-l-2 border-blue-500 p-4 rounded-r-xl">
                                            <h3 className="text-blue-400 font-bold uppercase text-xs mb-2 flex items-center gap-2">
                                                <TrendingUp size={14} /> Forward Guidance
                                            </h3>
                                            <p className="text-gray-300 text-sm whitespace-pre-wrap">{renderGuidance(analysis.guidance)}</p>
                                        </div>

                                        {/* red flags */}
                                        <div className="bg-red-500/5 border-l-2 border-red-500 p-4 rounded-r-xl">
                                            <h3 className="text-red-400 font-bold uppercase text-xs mb-2 flex items-center gap-2">
                                                <AlertTriangle size={14} /> Key Risks
                                            </h3>
                                            <ul className="space-y-2">
                                                {getRisksArray(analysis.risks).map((risk: string, i: number) => (
                                                    <li key={i} className="text-gray-300 text-sm flex gap-2">
                                                        <span className="text-red-500">•</span> {risk}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-full text-red-400">Analysis Failed</div>
                                )}
                            </div>
                        )}

                        {/* chat view */}
                        {activeTab === "chat" && (
                            <div className="flex-1 flex flex-col h-full bg-background relative">
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-32">
                                    {/* empty state */}
                                    {chatHistory.length === 0 && (
                                        <div className="flex flex-col items-center justify-center h-full opacity-30">
                                            <MessageSquare size={48} className="mb-4" />
                                            <p className="text-gray-500">Ask questions about this specific document.</p>
                                        </div>
                                    )}

                                    {chatHistory.map((msg, i) => (
                                        <div key={i} className={`flex gap-5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                            {msg.role === "assistant" && (
                                                <div className="w-10 h-10 rounded-2xl bg-linear-to-br from-surface to-[#0A0806] border border-white/10 flex items-center justify-center shrink-0 mt-1 shadow-[0_0_15px_rgba(255,255,255,0.05)]">
                                                    <div
                                                        className="w-6 h-6 bg-linear-to-b from-white to-gray-400"
                                                        style={{
                                                            maskImage: "url('/assets/kangaroo-chat-icon.png')",
                                                            maskSize: "contain",
                                                            maskRepeat: "no-repeat",
                                                            maskPosition: "center",
                                                            WebkitMaskImage: "url('/assets/kangaroo-chat-icon.png')",
                                                            WebkitMaskSize: "contain",
                                                            WebkitMaskRepeat: "no-repeat",
                                                            WebkitMaskPosition: "center"
                                                        }}
                                                    />
                                                </div>
                                            )}

                                            <div className={`flex flex-col gap-2 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                                                {msg.content && (
                                                    <div className={`rounded-2xl p-6 text-[15px] leading-relaxed shadow-xl backdrop-blur-sm ${msg.role === "user"
                                                            ? "bg-linear-to-br from-white/10 to-white/5 text-white rounded-tr-sm border border-white/10"
                                                            : "bg-linear-to-br from-surface to-[#15100d] text-gray-200 rounded-tl-sm border border-white/5 w-full ring-1 ring-black/50"
                                                        }`}>
                                                        <div
                                                            className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-strong:text-primary prose-a:text-blue-400 prose-ul:my-2 prose-img:rounded-xl prose-img:border prose-img:border-white/10"
                                                            dangerouslySetInnerHTML={{
                                                                __html: msg.content.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {msg.role === "user" && (
                                                <div className="w-10 h-10 rounded-2xl bg-linear-to-br from-white/10 to-white/5 border border-white/20 flex items-center justify-center shrink-0 mt-1 shadow-lg">
                                                    <FileText size={18} className="text-white" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {chatLoading && (
                                        <div className="flex justify-start gap-5">
                                            <div className="w-10 h-10 rounded-2xl bg-linear-to-br from-surface to-[#0A0806] border border-white/10 flex items-center justify-center shrink-0">
                                                <Loader2 size={16} className="animate-spin text-primary" />
                                            </div>
                                            <div className="bg-linear-to-br from-surface to-[#15100d] text-gray-400 p-4 rounded-2xl rounded-tl-sm border border-white/5 ring-1 ring-black/50">
                                                <Loader2 size={16} className="animate-spin" />
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* input */}
                                <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-center px-4 pointer-events-none">
                                    <div className="w-[90%] pointer-events-auto rounded-full shadow-[0_0_50px_rgba(0,0,0,0.8)]">
                                        <form onSubmit={(e) => { e.preventDefault(); sendChatMessage(); }} className="relative flex items-center gap-2 bg-surface border border-white/10 rounded-full p-2 ring-1 ring-white/5 transition-colors focus-within:border-white/20 focus-within:ring-white/5 backdrop-blur-xl shadow-[inset_0_2px_15px_rgba(0,0,0,0.6)]">
                                            <div className="pl-4 text-gray-500 transition-colors">
                                                <MessageSquare size={18} />
                                            </div>
                                            <input
                                                className="flex-1 bg-transparent border-none py-3 px-2 text-white placeholder-gray-500 focus:outline-none focus:ring-0 text-sm"
                                                placeholder={chatLoading ? "AI is thinking..." : "Ask about this document..."}
                                                value={chatInput}
                                                onChange={(e) => setChatInput(e.target.value)}
                                                disabled={chatLoading}
                                            />
                                            <button
                                                type="submit"
                                                disabled={!chatInput.trim() || chatLoading}
                                                className="p-3 bg-white text-black rounded-full transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:shadow-[0_0_25px_rgba(255,255,255,0.4)]"
                                            >
                                                <Send size={16} strokeWidth={2.5} />
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
}

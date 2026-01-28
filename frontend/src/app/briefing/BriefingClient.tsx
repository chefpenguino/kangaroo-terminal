"use client";

import { useEffect, useState } from "react";
import { Play, Pause, RotateCcw, Newspaper } from "lucide-react";

interface BriefingData {
    overnight_wrap: string;
    portfolio_impact: string;
    action_items: string;
    vibe: string;
    error?: string;
}

export default function BriefingClient() {
    const [data, setData] = useState<BriefingData | null>(null);
    const [loading, setLoading] = useState(true);
    const [speaking, setSpeaking] = useState(false);

    useEffect(() => {
        fetchBriefing();
    }, []);

    const fetchBriefing = async () => {
        setLoading(true);
        try {
            const res = await fetch("http://localhost:8000/briefing/generate");
            const json = await res.json();
            setData(json);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSpeak = () => {
        if (!data) return;

        if (speaking) {
            window.speechSynthesis.cancel();
            setSpeaking(false);
            return;
        }

        // helper (strip html tags)
        const strip = (html: string) => html.replace(/<[^>]*>?/gm, '');

        const text = `
            Good morning. Here is your executive briefing.
            The Vibe for today is: ${data.vibe}.
            
            Overnight Wrap:
            ${strip(data.overnight_wrap)}
            
            Portfolio Impact:
            ${strip(data.portfolio_impact)}
            
            Action Items:
            ${strip(data.action_items)}
        `;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        // find a good voice
        // self-note: later replace this with elevenlabs api for more natural human-like tts
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.name.includes("Google US English") || v.name.includes("Daniel"));
        if (preferred) utterance.voice = preferred;

        utterance.onend = () => setSpeaking(false);

        setSpeaking(true);
        window.speechSynthesis.speak(utterance);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="text-gray-400 animate-pulse font-instrument italic text-xl">Creating your morning note...</p>
                <p className="text-xs text-gray-600">Aggregating market data, portfolio contexts, and scan signals.</p>
            </div>
        );
    }

    if (!data || data.error) {
        return (
            <div className="p-10 text-center">
                <h2 className="text-red-500 text-xl font-bold">Briefing Unavailable</h2>
                <p className="text-gray-400 mt-2">{data?.error || "Connection to the briefing engine failed."}</p>
                <button onClick={fetchBriefing} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded hover:bg-primary/30 transition">
                    Retry
                </button>
            </div>
        );
    }

    const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    return (
        <div className="max-w-5xl mx-auto p-6">

            {/* newspaper header */}
            <header className="border-b-[3px] border-double border-primary/40 pb-6 mb-8 text-center relative">
                <div className="absolute top-0 right-0">
                    <button
                        onClick={handleSpeak}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${speaking ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'}`}
                    >
                        {speaking ? <Pause size={18} /> : <Play size={18} />}
                        <span className="text-sm font-medium">{speaking ? "Stop Reading" : "Listen"}</span>
                    </button>
                </div>

                <div className="flex items-center justify-center gap-3 mb-2 opacity-80">
                    <Newspaper size={20} className="text-primary" />
                    <span className="uppercase tracking-[0.3em] text-xs font-bold text-gray-400">Executive Intelligence</span>
                </div>

                <h1 className="text-6xl md:text-7xl font-instrument text-white tracking-tight leading-none mb-2">
                    The Morning Note
                </h1>

                <div className="flex items-center justify-center gap-4 text-sm text-gray-500 font-instrument italic border-t border-b border-gray-800 py-2 mt-4 max-w-2xl mx-auto">
                    <span>{today}</span>
                    <span>•</span>
                    <span>Sydney, Australia</span>
                    <span>•</span>
                    <span>Kangaroo Terminal</span>
                </div>
            </header>

            {/* vibe check */}
            <div className="bg-linear-to-r from-gray-900 to-black border-l-4 border-primary p-6 mb-10 shadow-lg">
                <span className="text-xs font-bold text-primary uppercase tracking-widest mb-1 block">The Daily Vibe</span>
                <p className="text-2xl md:text-3xl font-instrument text-white italic">
                    "{data.vibe}"
                </p>
            </div>

            {/* content grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">

                {/* left column (main) */}
                <div className="lg:col-span-8 space-y-10">

                    <section>
                        <h3 className="text-2xl font-instrument text-white border-b border-gray-800 pb-2 mb-4">
                            The Overnight Wrap
                        </h3>
                        <div
                            className="prose prose-invert prose-p:text-gray-300 prose-headings:text-gray-200 prose-strong:text-primary max-w-none text-lg leading-relaxed font-serif"
                            dangerouslySetInnerHTML={{ __html: data.overnight_wrap }}
                        />
                    </section>

                    <section>
                        <h3 className="text-2xl font-instrument text-white border-b border-gray-800 pb-2 mb-4">
                            Portfolio Impact
                        </h3>
                        <div
                            className="prose prose-invert prose-p:text-gray-300 prose-headings:text-gray-200 prose-strong:text-emerald-400 max-w-none text-lg leading-relaxed font-serif"
                            dangerouslySetInnerHTML={{ __html: data.portfolio_impact }}
                        />
                    </section>
                </div>

                {/* right column (sidebar) */}
                <div className="lg:col-span-4 space-y-8">

                    <div className="bg-gray-900/50 p-6 rounded-lg border border-gray-800">
                        <h3 className="text-xl font-instrument text-primary mb-4 flex items-center gap-2">
                            <span>🎯</span> Action Items
                        </h3>
                        <div
                            className="prose prose-sm prose-invert prose-li:text-gray-300 prose-ul:pl-4 marker:text-primary"
                            dangerouslySetInnerHTML={{ __html: data.action_items }}
                        />
                    </div>

                    <div className="border-t border-gray-800 pt-6">
                        <p className="text-xs text-gray-600 text-center leading-relaxed">
                            Disclaimer: This briefing is generated by AI (Kangaroo/Gemini) and does not constitute financial advice.
                            Past performance is not indicative of future results.
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
}

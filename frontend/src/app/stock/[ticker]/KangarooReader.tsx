"use client";

import { X, Loader2, ArrowDownRight, ExternalLink } from "lucide-react";

interface KangarooReaderProps {
    selectedArticle: string | null;
    onClose: () => void;
    reading: boolean;
    articleContent: any;
}

export default function KangarooReader({
    selectedArticle,
    onClose,
    reading,
    articleContent
}: KangarooReaderProps) {
    if (!selectedArticle) return null;

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/95 backdrop-blur-xl transition-opacity"
                onClick={onClose}
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
                        onClick={onClose}
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
    );
}

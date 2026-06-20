"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowLeft, BarChart2 } from "lucide-react";
import Navbar from "../../components/Navigation/Navbar";

export default function OptimizePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg-main text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto px-4 text-center py-20 relative">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400 mb-6 animate-pulse">
          <Sparkles className="h-10 w-10" />
        </div>

        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 text-white">
          Options Strategy{" "}
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
            Optimizer
          </span>
        </h1>
        
        <p className="text-slate-400 text-md max-w-xl mx-auto mb-8 leading-relaxed font-medium">
          Enter a target price, target date, and investment amount to let our algorithms search through thousands of options strategy structures and surface the highest potential returns.
        </p>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto mb-10 text-left">
          <div className="bg-[#0f1524]/60 p-5 rounded-2xl border border-slate-900 shadow-xl space-y-2">
            <span className="text-xs font-black tracking-widest text-[#00df89] uppercase">Max Return</span>
            <p className="text-xs text-slate-300 font-medium">Sort results by maximum absolute percentage returns for your target price.</p>
          </div>
          <div className="bg-[#0f1524]/60 p-5 rounded-2xl border border-slate-900 shadow-xl space-y-2">
            <span className="text-xs font-black tracking-widest text-[#38bdf8] uppercase">Probability Sort</span>
            <p className="text-xs text-slate-300 font-medium">Sort by the mathematical probability of reaching break-even or target threshold.</p>
          </div>
          <div className="bg-[#0f1524]/60 p-5 rounded-2xl border border-slate-900 shadow-xl space-y-2">
            <span className="text-xs font-black tracking-widest text-[#e945c7] uppercase">Custom Capital</span>
            <p className="text-xs text-slate-300 font-medium">Limit searches to match your specific risk tolerance and budget size.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => router.push("/build")}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/25 transition duration-150 flex items-center justify-center gap-2"
          >
            <BarChart2 className="h-4 w-4" /> Go to leg builder
          </button>
          
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold text-sm rounded-xl transition duration-150 flex items-center justify-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </button>
        </div>
      </main>
    </div>
  );
}

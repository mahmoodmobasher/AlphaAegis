"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowLeft, BarChart2 } from "lucide-react";
import Navbar from "../../components/Navigation/Navbar";

export default function FlowPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg-main text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto px-4 text-center py-20 relative">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 mb-6 animate-pulse">
          <Activity className="h-10 w-10" />
        </div>

        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 text-white">
          Unusual Options{" "}
          <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-indigo-400 bg-clip-text text-transparent">
            Flow
          </span>
        </h1>
        
        <p className="text-slate-400 text-md max-w-xl mx-auto mb-8 leading-relaxed font-medium">
          Track large block trades, sweeps, and high volume sweeps in real time. Filter by trade size, underlying index, bullish or bearish intent, and spot options activity anomalies.
        </p>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto mb-10 text-left">
          <div className="bg-[#0f1524]/60 p-5 rounded-2xl border border-slate-900 shadow-xl space-y-2">
            <span className="text-xs font-black tracking-widest text-[#00df89] uppercase">Block Trades</span>
            <p className="text-xs text-slate-300 font-medium">Real-time alerts for large blocks executed directly on the exchanges.</p>
          </div>
          <div className="bg-[#0f1524]/60 p-5 rounded-2xl border border-slate-900 shadow-xl space-y-2">
            <span className="text-xs font-black tracking-widest text-[#38bdf8] uppercase">Order Sweeps</span>
            <p className="text-xs text-slate-300 font-medium">Detect smart money executing order sweeps across multiple exchanges instantly.</p>
          </div>
          <div className="bg-[#0f1524]/60 p-5 rounded-2xl border border-slate-900 shadow-xl space-y-2">
            <span className="text-xs font-black tracking-widest text-[#e945c7] uppercase">Sentiment Alerts</span>
            <p className="text-xs text-slate-300 font-medium">Proprietary AI sentiment calculations tagging orders as bullish or bearish aggressive sweeps.</p>
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

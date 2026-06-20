"use client";
import React from "react";
import { Sparkles } from "lucide-react";

export default function Hero() {
  return (
    <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-24 pb-12 relative z-10">
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 font-bold text-xs uppercase tracking-widest mb-6 animate-pulse">
        <Sparkles className="h-3.5 w-3.5" /> Visual Options Toolkit
      </div>
      <h1 className="text-5xl md:text-7xl font-black tracking-tight text-white mb-6 leading-tight max-w-4xl mx-auto">
        The ultimate options{" "}
        <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
          strategy visualizer
        </span>
      </h1>
      <p className="text-slate-400 text-lg md:text-xl font-medium max-w-2xl mx-auto mb-10 leading-relaxed">
        Optimize your portfolios, track unusual flow, and simulate payoffs with the most powerful analysis suite on the market.
      </p>
    </header>
  );
}

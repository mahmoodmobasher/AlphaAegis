"use client";

import React from "react";
import { Info, AlertCircle } from "lucide-react";

interface FinanceSourceBannerProps {
  source?: string | null;
}

export function FinanceSourceBanner({ source }: FinanceSourceBannerProps) {
  if (source !== "yahoo") return null;

  return (
    <div className="w-full bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-amber-500/10 border border-amber-500/20 rounded-xl p-3 px-4 flex items-center justify-between text-amber-200 text-xs md:text-sm shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-300 mb-4">
      <div className="flex items-center gap-2.5">
        <div className="p-1 bg-amber-500/20 rounded-lg text-amber-400">
          <Info size={16} className="animate-pulse" />
        </div>
        <div>
          <span className="font-semibold text-amber-300">Public Fallback Mode:</span>{" "}
          Data is provided by <span className="font-semibold text-slate-100 underline decoration-amber-400/50 underline-offset-2">Yahoo Finance</span>. Real-time pricing or Interactive Brokers features might be limited.
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-1.5 text-xs text-amber-400/70 bg-amber-500/10 py-1 px-2.5 rounded-full border border-amber-500/10">
        <AlertCircle size={12} />
        <span>Delayed Data</span>
      </div>
    </div>
  );
}

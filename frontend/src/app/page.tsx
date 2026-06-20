"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, TrendingUp, Sparkles, Activity, Eye } from "lucide-react";
import Hero from "@/components/Landing/Hero";
import OptionCard from "@/components/Landing/OptionCard";
import Navbar from "../components/Navigation/Navbar";

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col relative overflow-hidden">
      
      {/* Background Curved Vector Wave Lines & Glow Gradients */}
      <div className="absolute top-0 left-0 right-0 h-[450px] pointer-events-none opacity-40 z-0">
        {/* Glow overlay */}
        <div className="absolute top-[-20%] left-[50%] -translate-x-[50%] w-[1000px] h-[400px] bg-indigo-500/10 blur-[150px] rounded-full"></div>
        
        {/* SVG Curved Waves */}
        <svg className="w-full h-full text-indigo-500/30" viewBox="0 0 1440 400" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 120 C 300 240, 700 80, 1000 180 C 1200 240, 1350 150, 1440 100" stroke="currentColor" strokeWidth="1.5" />
          <path d="M0 140 C 320 270, 680 100, 980 200 C 1180 260, 1360 180, 1440 130" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
          <path d="M0 160 C 340 300, 660 120, 960 220 C 1160 280, 1370 210, 1440 160" stroke="currentColor" strokeWidth="2" opacity="0.5" />
          <path d="M0 180 C 360 330, 640 140, 940 240 C 1140 300, 1380 240, 1440 190" stroke="currentColor" strokeWidth="0.8" />
        </svg>
      </div>

      <Navbar />

      {/* Hero Section */}
      <Hero />

      {/* 3-Column Core Features Section (From User Screenshot) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10 flex-1 flex flex-col justify-center">
        
        {/* Background wave vectors behind the grid */}
        <div className="absolute inset-x-0 top-0 h-[200px] pointer-events-none opacity-20">
          <svg className="w-full h-full text-indigo-400" viewBox="0 0 1200 150" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 0,30 C 300,100 600,0 900,80 C 1050,120 1150,50 1200,30" stroke="currentColor" strokeWidth="1.2" />
            <path d="M 0,45 C 320,115 580,15 880,95 C 1030,135 1160,65 1200,45" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 3" />
            <path d="M 0,60 C 340,130 560,30 860,110 C 1010,150 1170,80 1200,60" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 pt-10 border-t border-slate-900/60">
          <OptionCard title="Predict your Strategy" description="Use the strategy builder to calculate and visualize the expected profit and loss." icon={<Activity className="h-6 w-6 text-indigo-400" />} />
          <OptionCard title="Optimize an Idea" description="Use the options optimizer to find the best trades for a given target price and date." icon={<TrendingUp className="h-6 w-6 text-emerald-400" />} />
          <OptionCard title="View Unusual Trades" description="Follow the smart money by watching large and unusual trades as they are made." icon={<Eye className="h-6 w-6 text-rose-400" />} />
        </div>
      </section>

      {/* Footer Branding */}
      <footer className="border-t border-slate-900 bg-slate-950/20 py-8 text-center text-xs font-bold text-slate-500 tracking-wider relative z-10">
        © 2026 AlphaAegis. Powered by Black-Scholes pricing engines.
      </footer>

    </div>
  );
}

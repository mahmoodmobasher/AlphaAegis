"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Radio,
  ArrowLeft,
  Clock,
  AlertCircle,
  HelpCircle
} from "lucide-react";
import Navbar from "@/components/Navigation/Navbar";
import { useStrategyStore } from "@/store/useStrategyStore";
import { feedsApi } from "@/services/api";

interface FeedItem {
  headline: string;
  source: string;
  timestamp: string;
  sentiment: number;
  iv_adj: number;
  spot_shock: number;
}

export default function RssFeedPage() {
  const store = useStrategyStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Enforce hydration and authentication checks
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !store.isAuthenticated) {
      router.push("/login");
    }
  }, [mounted, store.isAuthenticated, router]);

  // Keep a timer to refresh relative timestamps every 100ms for microsecond-level accuracy
  useEffect(() => {
    if (!mounted || !store.isAuthenticated) return;
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 100);
    return () => clearInterval(interval);
  }, [mounted, store.isAuthenticated]);

  const fetchFeeds = async () => {
    if (!store.token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await feedsApi.getRecentFeeds(store.token);
      setFeeds(data || []);
    } catch (err: any) {
      console.error("Failed to fetch RSS feeds:", err);
      setError(err.message || "Failed to load recent RSS feeds.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mounted && store.isAuthenticated && store.token) {
      fetchFeeds();
    }
  }, [mounted, store.isAuthenticated, store.token]);

  if (!mounted || !store.isAuthenticated) {
    return null;
  }

  // Parse ISO string to UTC Date reliably
  const parseUtcDate = (isoString: string) => {
    if (!isoString) return new Date();
    let formatted = isoString;
    if (!isoString.endsWith("Z") && !isoString.includes("+") && !isoString.match(/-\d{2}:\d{2}$/)) {
      formatted = isoString + "Z";
    }
    return new Date(formatted);
  };

  // Format relative timestamp with microsecond precision
  const getRelativeTime = (isoString: string) => {
    if (!isoString) return "N/A";
    try {
      const past = parseUtcDate(isoString);
      const diffMs = currentTime.getTime() - past.getTime();
      const diffSec = diffMs / 1000;

      const dotIndex = isoString.indexOf(".");
      let microStr = "000000";
      if (dotIndex !== -1) {
        const parts = isoString.substring(dotIndex + 1).split(/[^0-9]/);
        if (parts[0]) {
          microStr = parts[0].substring(0, 6).padEnd(6, "0");
        }
      }

      if (diffSec < 0) {
        return `0.000${microStr.substring(3)}s ago`;
      }

      const secondsFloor = Math.floor(diffSec);
      const msFraction = Math.floor(diffMs % 1000).toString().padStart(3, "0");
      const microFraction = microStr.substring(3);
      return `${secondsFloor}.${msFraction}${microFraction}s ago`;
    } catch (e) {
      return isoString;
    }
  };

  const getSourceBadgeClass = (source: string) => {
    switch (source.toLowerCase()) {
      case "cnbc":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "yahoo":
      case "yahoo finance":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "marketwatch":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    }
  };

  const getSentimentBadgeClass = (score: number) => {
    if (score > 0.1) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (score < -0.1) return "bg-rose-500/10 text-rose-400 border-rose-500/20";
    return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  };

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col relative font-sans">

      {/* Background Curved Vector Wave Lines & Glow Gradients */}
      <div className="absolute top-0 left-0 right-0 h-[450px] pointer-events-none opacity-40 z-0">
        <div className="absolute top-[-20%] left-[50%] -translate-x-[50%] w-[1000px] h-[400px] bg-indigo-500/10 blur-[150px] rounded-full"></div>
        <svg className="w-full h-full text-indigo-500/30" viewBox="0 0 1440 400" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 120 C 300 240, 700 80, 1000 180 C 1200 240, 1350 150, 1440 100" stroke="currentColor" strokeWidth="1.5" />
          <path d="M0 140 C 320 270, 680 100, 980 200 C 1180 260, 1360 180, 1440 130" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
        </svg>
      </div>

      <Navbar />

      <div className="max-w-5xl w-full mx-auto px-4 py-8 relative z-10 flex-1 flex flex-col justify-start">

        {/* Navigation & Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push("/portfolio")}
            className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition duration-150 group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Portfolio
          </button>

          <span className="text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg font-mono">
            Feed Channel: alphaaegis-macro-events
          </span>
        </div>

        {/* Main Feed Card */}
        <div className="bg-slate-950/95 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-md mb-8 flex-1 flex flex-col">

          {/* Card Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-900">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-650/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                <Radio className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-black bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
                  Live RSS Wires Monitor
                </h1>
                <p className="text-slate-400 text-xs mt-0.5">
                  Verify real-time macroeconomic sentiment and risk adjustments streaming into your pipeline
                </p>
              </div>
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchFeeds}
              disabled={loading}
              className="self-end sm:self-center flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-500/20 transition duration-150"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh Feed
            </button>
          </div>

          {/* Success / Error Messages */}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Feeds List Container - UNCONSTRAINED SCROLL VIEW FOR ALL 50+ ITEMS */}
          <div className="flex-1 space-y-4 pr-1">
            {loading && feeds.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-xs font-semibold">
                <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin mb-4" />
                Connecting to local Redis cache registry...
              </div>
            ) : feeds.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-slate-900 rounded-xl">
                <HelpCircle className="h-10 w-10 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-bold">No active wires captured in cache</p>
                <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">
                  Ensure the backend multi-feed aggregator is running and feeding headlines into Redis.
                </p>
              </div>
            ) : (
              feeds.map((feed, index) => {
                return (
                  <div
                    key={index}
                    className="p-4 bg-slate-900/40 border border-slate-900 hover:border-slate-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition duration-150"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Source Chip */}
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getSourceBadgeClass(feed.source)}`}>
                          {feed.source}
                        </span>

                        {/* Sentiment Chip */}
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getSentimentBadgeClass(feed.sentiment)}`}>
                          Sentiment: {feed.sentiment > 0 ? "+" : ""}{feed.sentiment.toFixed(2)}
                        </span>
                      </div>

                      {/* Headline Text */}
                      <p className="text-sm font-semibold text-slate-100 leading-relaxed">
                        {feed.headline}
                      </p>

                      {/* Volatility & Spot Shock parameters */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500 text-xs">
                        <span className="flex items-center gap-1">
                          IV Adjustment:{" "}
                          <strong className={feed.iv_adj > 0 ? "text-rose-400" : feed.iv_adj < 0 ? "text-emerald-400" : "text-slate-400"}>
                            {feed.iv_adj > 0 ? "+" : ""}{feed.iv_adj.toFixed(2)}%
                          </strong>
                        </span>
                        <span className="flex items-center gap-1">
                          Spot Shock Scenario:{" "}
                          <strong className={feed.spot_shock > 0 ? "text-emerald-400" : feed.spot_shock < 0 ? "text-rose-400" : "text-slate-400"}>
                            {feed.spot_shock > 0 ? "+" : ""}{feed.spot_shock.toFixed(2)}%
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Precise relative timestamp */}
                    <div className="flex flex-col items-end justify-center text-right border-t border-slate-900/60 md:border-none pt-2 md:pt-0">
                      <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-indigo-400">
                        <Clock className="h-3 w-3 text-indigo-400" />
                        <span>{getRelativeTime(feed.timestamp)}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-600 mt-0.5">
                        {new Date(parseUtcDate(feed.timestamp)).toLocaleTimeString()} (UTC)
                      </span>
                    </div>

                  </div>
                );
              })
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
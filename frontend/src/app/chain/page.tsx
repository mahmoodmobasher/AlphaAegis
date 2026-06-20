"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Layers, 
  ArrowRight, 
  Info,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Check,
  X
} from "lucide-react";
import Navbar from "../../components/Navigation/Navbar";
import { useStrategyStore } from "../../store/useStrategyStore";
import { FinanceSourceBanner } from "../../components/Disclaimer/FinanceSourceBanner";

interface OptionContract {
  bid: number;
  ask: number;
  last: number;
  volume: number;
  open_interest: number;
  iv: number;
  delta: number;
  gamma?: number;
  vega?: number;
}

interface ChainRow {
  strike: number;
  call: OptionContract;
  put: OptionContract;
}

interface ChainData {
  underlying_symbol: string;
  underlying_price: number;
  expiration_date: string;
  days_to_expiration: number;
  options: ChainRow[];
  source?: string | null;
}

const POPULAR_TICKERS = ["AAPL", "TSLA", "MSFT", "SPY", "QQQ", "NVDA", "AMD", "AMZN", "META", "NFLX"];

export default function OptionChainPage() {
  const router = useRouter();
  const store = useStrategyStore();
  const [isPending, startTransition] = useTransition();

  const [symbol, setSymbol] = useState("AAPL");
  const [searchInput, setSearchInput] = useState("AAPL");
  
  const [expirations, setExpirations] = useState<string[]>([]);
  const [selectedExpiration, setSelectedExpiration] = useState<string>("");
  
  const [chainData, setChainData] = useState<ChainData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [strikeRange, setStrikeRange] = useState<number>(12); // Count of strikes to show
  const [sortBy, setSortBy] = useState<"strike" | "volume" | "oi">("strike");

  // Visual Feedback for added legs
  const [addedLegFeedback, setAddedLegFeedback] = useState<string | null>(null);

  // Layout Minimized Panel State
  const [isMinimized, setIsMinimized] = useState(false);

  // Clear any existing legs in store when option chain mounts
  useEffect(() => {
    store.clearStrategy();
  }, []);

  // Fetch expirations when symbol changes
  useEffect(() => {
    async function fetchExpirations() {
      setIsLoading(true);
      setError(null);
      try {
        const headers: Record<string, string> = {};
        let url = `http://localhost:8000/api/chain/expirations?symbol=${symbol}`;
        
        if (store.isAuthenticated && store.token) {
          headers["Authorization"] = `Bearer ${store.token}`;
          const activeConfigId = localStorage.getItem("active_ib_config_id");
          if (activeConfigId) {
            url += `&config_id=${activeConfigId}`;
          }
        }

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error("Failed to fetch expiration dates");
        const data = await res.json();
        setExpirations(data);
        if (data.length > 0) {
          setSelectedExpiration(data[0]);
        }
      } catch (err: any) {
        setError(err.message || "Something went wrong fetching expirations");
      } finally {
        setIsLoading(false);
      }
    }
    fetchExpirations();
  }, [symbol, store.isAuthenticated, store.token]);

  // Fetch option chain data
  useEffect(() => {
    if (!selectedExpiration) return;
    
    async function fetchChain() {
      setIsLoading(true);
      try {
        const headers: Record<string, string> = {};
        let url = `http://localhost:8000/api/chain?symbol=${symbol}&expiration=${selectedExpiration}`;
        
        if (store.isAuthenticated && store.token) {
          headers["Authorization"] = `Bearer ${store.token}`;
          const activeConfigId = localStorage.getItem("active_ib_config_id");
          if (activeConfigId) {
            url += `&config_id=${activeConfigId}`;
          }
        }

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error("Failed to fetch option chain");
        const data = await res.json();
        setChainData(data);
      } catch (err: any) {
        setError(err.message || "Failed to fetch chain data");
      } finally {
        setIsLoading(false);
      }
    }
    fetchChain();
  }, [symbol, selectedExpiration, store.isAuthenticated, store.token]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSymbol(searchInput.trim().toUpperCase());
    }
  };

  const handleSelectTicker = (ticker: string) => {
    setSearchInput(ticker);
    setSymbol(ticker);
  };

  const handleLegClick = (
    optionType: "CALL" | "PUT",
    action: "BUY" | "SELL",
    strike: number,
    premium: number
  ) => {
    if (!chainData) return;
    
    // Set matching ticker metadata in store
    store.setUnderlyingSymbol(chainData.underlying_symbol);
    store.setUnderlyingPrice(chainData.underlying_price);

    // Calculate days to expiration
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(selectedExpiration);
    const diffTime = exp.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Add leg to Zustand builder
    store.addLeg({
      optionType,
      action,
      strikePrice: strike,
      expirationDate: selectedExpiration,
      daysToExpiration: Math.max(0, diffDays),
      quantity: 1,
      premium: premium
    });

    // Provide visual feedback
    const legLabel = `${action} ${selectedExpiration} $${strike} ${optionType}`;
    setAddedLegFeedback(legLabel);
    setTimeout(() => setAddedLegFeedback(null), 4000);
  };

  // Filter option chain strikes centered around spot price
  const getFilteredOptions = () => {
    if (!chainData) return [];
    
    const spot = chainData.underlying_price;
    const sorted = [...chainData.options].sort((a, b) => a.strike - b.strike);
    
    // Find index of strike closest to spot
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < sorted.length; i++) {
      const diff = Math.abs(sorted[i].strike - spot);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    
    // Slice range centered around closestIdx
    const half = Math.floor(strikeRange / 2);
    const start = Math.max(0, closestIdx - half);
    const end = Math.min(sorted.length, closestIdx + half + 1);
    
    return sorted.slice(start, end);
  };

  const filteredOptions = getFilteredOptions();

  // Find the strike closest to the spot price (ATM Strike)
  const atmStrike = React.useMemo(() => {
    if (!chainData || chainData.options.length === 0) return null;
    const spot = chainData.underlying_price;
    let closestStrike = chainData.options[0].strike;
    let minDiff = Math.abs(closestStrike - spot);
    
    for (let i = 1; i < chainData.options.length; i++) {
      const diff = Math.abs(chainData.options[i].strike - spot);
      if (diff < minDiff) {
        minDiff = diff;
        closestStrike = chainData.options[i].strike;
      }
    }
    return closestStrike;
  }, [chainData]);

  return (
    <div className="min-h-screen bg-bg-main text-slate-100 flex flex-col font-sans">
      <Navbar />

      <main className={`flex-1 max-w-7xl w-full mx-auto px-4 pt-8 flex flex-col gap-6 transition-all duration-300 ${
        store.legs.length > 0 && !isMinimized ? "pb-72" : "pb-16"
      }`}>
        
        {chainData && <FinanceSourceBanner source={chainData.source} />}

        {/* Top Header Ticker Panel */}
        <div className="bg-bg-panel border border-border-panel p-5 rounded-2xl shadow-xl flex flex-col md:flex-row gap-5 items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-4 items-center w-full md:w-auto">
            <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Search Ticker..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-text-main rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none uppercase font-bold tracking-wider"
              />
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-text-muted" />
            </form>
            
            <div className="flex flex-wrap gap-1.5 justify-center">
              {POPULAR_TICKERS.map((t) => (
                <button
                  key={t}
                  onClick={() => handleSelectTicker(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    symbol === t
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                      : "bg-slate-900/60 border border-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {chainData && (
            <div className="flex items-center gap-6 bg-slate-900/40 border border-slate-900 p-3 px-6 rounded-xl self-stretch md:self-auto justify-around">
              <div className="flex flex-col">
                <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Spot Price</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-extrabold text-lg text-white font-mono">
                    ${chainData.underlying_price.toFixed(2)}
                  </span>
                  <span className="flex items-center text-xs font-bold text-emerald-400">
                    <TrendingUp className="h-3.5 w-3.5" /> +1.24%
                  </span>
                </div>
              </div>
              <div className="h-8 w-px bg-slate-800"></div>
              <div className="flex flex-col">
                <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Expiry DTE</span>
                <span className="font-bold text-sm text-text-sub mt-1">
                  {chainData.days_to_expiration} days
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Expirations Date Selector */}
        {expirations.length > 0 && (
          <div className="flex flex-col gap-2 bg-bg-panel border border-border-panel p-4 rounded-2xl shadow-lg">
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider px-1">Expiration Dates</span>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {expirations.map((exp) => {
                const dateObj = new Date(exp + "T12:00:00");
                const formatted = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                const isSelected = selectedExpiration === exp;
                
                return (
                  <button
                    key={exp}
                    onClick={() => setSelectedExpiration(exp)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex flex-col items-center gap-0.5 shrink-0 border ${
                      isSelected
                        ? "bg-indigo-600/10 border-indigo-500 text-indigo-400 shadow-md shadow-indigo-500/5"
                        : "bg-slate-900/60 border-slate-800/80 hover:border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span>{formatted}</span>
                    <span className="text-[9px] opacity-75 font-medium">{exp}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-950 border border-slate-900 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-sub">
            <SlidersHorizontal className="h-4 w-4 text-indigo-400" />
            <span>Strikes Count:</span>
            <select
              value={strikeRange}
              onChange={(e) => setStrikeRange(parseInt(e.target.value))}
              className="bg-slate-900 border border-slate-800 text-text-main rounded-md px-2 py-1 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
            >
              <option value={8}>8 Strikes</option>
              <option value={12}>12 Strikes</option>
              <option value={16}>16 Strikes</option>
              <option value={20}>20 Strikes</option>
              <option value={30}>All Strikes</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <Info className="h-3.5 w-3.5 text-indigo-500" />
            <span>Click Buy to Buy (+), Click Sell to Sell (-). Legs accumulate in builder.</span>
          </div>
        </div>

        {/* Main Double Chain Matrix */}
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-24 bg-bg-panel border border-border-panel rounded-2xl">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            <p className="text-xs text-text-muted mt-3 font-semibold uppercase tracking-wider">Fetching Option Matrix...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl">
            <p className="font-bold text-sm">Failed to Load Options Chain</p>
            <p className="text-xs mt-1">{error}</p>
          </div>
        ) : chainData && filteredOptions.length > 0 ? (
          <div className="bg-bg-panel border border-border-panel rounded-2xl shadow-xl overflow-hidden">
            {/* Area labels for Calls and Puts */}
            <div className="grid grid-cols-19 text-xs font-black tracking-widest text-center py-2 bg-slate-950 border-b border-slate-900">
              <div className="col-span-9 bg-indigo-500/10 text-indigo-400 py-1.5 uppercase rounded-tl-xl border-r border-slate-900">
                Calls
              </div>
              <div className="col-span-1 bg-slate-900/50 text-text-muted py-1.5 font-bold border-x border-slate-900">
                Strike
              </div>
              <div className="col-span-9 bg-purple-500/10 text-purple-400 py-1.5 uppercase rounded-tr-xl border-l border-slate-900">
                Puts
              </div>
            </div>

            {/* Headers grid */}
            <div className="grid grid-cols-19 bg-slate-900/80 border-b border-slate-800 text-[10px] text-text-muted uppercase tracking-wider font-extrabold text-center py-3">
              {/* Calls headers */}
              <div className="col-span-1">IV</div>
              <div className="col-span-1">Vol</div>
              <div className="col-span-1">OI</div>
              <div className="col-span-1">Delta</div>
              <div className="col-span-1">Gamma</div>
              <div className="col-span-1">Vega</div>
              <div className="col-span-1">Last</div>
              <div className="col-span-1 text-sky-400">Sell</div>
              <div className="col-span-1 text-red-400">Buy</div>
              
              {/* Strike header */}
              <div className="col-span-1 text-text-main font-black bg-slate-950 py-1 -my-1 border-x border-slate-800">Strike</div>
              
              {/* Puts headers */}
              <div className="col-span-1 text-sky-400">Sell</div>
              <div className="col-span-1 text-red-400">Buy</div>
              <div className="col-span-1">Last</div>
              <div className="col-span-1">Vega</div>
              <div className="col-span-1">Gamma</div>
              <div className="col-span-1">Delta</div>
              <div className="col-span-1">OI</div>
              <div className="col-span-1">Vol</div>
              <div className="col-span-1">IV</div>
            </div>

            {/* List Rows */}
            <div className="divide-y divide-slate-900">
              {filteredOptions.map((row) => {
                const spot = chainData.underlying_price;
                const isPutITM = row.strike > spot; // Puts are ITM if Strike > Spot
                const isCallITM = row.strike < spot; // Calls are ITM if Strike < Spot
                const isATM = row.strike === atmStrike;

                return (
                  <div 
                    key={row.strike} 
                    className={`grid grid-cols-19 text-xs text-center items-center hover:bg-slate-900/40 transition-colors border-y ${
                      isATM 
                        ? "border-amber-500/35 bg-amber-500/5 shadow-inner" 
                        : "border-transparent"
                    }`}
                  >
                    {/* --- CALLS SECTION --- */}
                    <div className={`col-span-1 py-3 font-mono text-text-muted text-[10px] ${isCallITM ? "bg-indigo-950/15" : ""}`}>
                      {(row.call.iv * 100).toFixed(0)}%
                    </div>
                    <div className={`col-span-1 py-3 font-mono text-text-sub text-[10px] ${isCallITM ? "bg-indigo-950/15" : ""}`}>
                      {row.call.volume.toLocaleString()}
                    </div>
                    <div className={`col-span-1 py-3 font-mono text-text-muted text-[10px] ${isCallITM ? "bg-indigo-950/15" : ""}`}>
                      {row.call.open_interest.toLocaleString()}
                    </div>
                    <div className={`col-span-1 py-3 font-mono font-medium text-emerald-400/80 text-[10px] ${isCallITM ? "bg-indigo-950/15" : ""}`}>
                      {row.call.delta.toFixed(2)}
                    </div>
                    <div className={`col-span-1 py-3 font-mono text-text-muted text-[10px] ${isCallITM ? "bg-indigo-950/15" : ""}`}>
                      {row.call.gamma ? row.call.gamma.toFixed(3) : "0.000"}
                    </div>
                    <div className={`col-span-1 py-3 font-mono text-text-muted text-[10px] ${isCallITM ? "bg-indigo-950/15" : ""}`}>
                      {row.call.vega ? row.call.vega.toFixed(3) : "0.000"}
                    </div>
                    <div className={`col-span-1 py-3 font-mono text-text-main ${isCallITM ? "bg-indigo-950/15" : ""}`}>
                      ${row.call.last.toFixed(2)}
                    </div>
                    
                    {/* Call Bid - Sell */}
                    <button 
                      onClick={() => handleLegClick("CALL", "SELL", row.strike, row.call.bid)}
                      className={`col-span-1 py-3 font-mono font-bold text-sky-400 hover:bg-sky-500/20 active:bg-sky-500/35 transition cursor-pointer select-none ${isCallITM ? "bg-indigo-950/25" : ""}`}
                    >
                      ${row.call.bid.toFixed(2)}
                    </button>
                    
                    {/* Call Ask - Buy */}
                    <button 
                      onClick={() => handleLegClick("CALL", "BUY", row.strike, row.call.ask)}
                      className={`col-span-1 py-3 font-mono font-bold text-red-400 hover:bg-red-500/20 active:bg-red-500/35 border-r border-slate-900/60 transition cursor-pointer select-none ${isCallITM ? "bg-indigo-950/25" : ""}`}
                    >
                      ${row.call.ask.toFixed(2)}
                    </button>

                    {/* --- CENTER STRIKE --- */}
                    <div className={`col-span-1 py-3 font-extrabold font-mono border-x border-slate-800 text-[13px] shadow-inner transition duration-150 ${
                      isATM 
                        ? "text-amber-400 bg-amber-500/20 border-y border-amber-500/40 scale-105 z-10 font-black shadow-lg" 
                        : "text-white bg-slate-950/90"
                    }`}>
                      {row.strike.toFixed(1)}
                    </div>

                    {/* --- PUTS SECTION --- */}
                    {/* Put Bid - Sell */}
                    <button 
                      onClick={() => handleLegClick("PUT", "SELL", row.strike, row.put.bid)}
                      className={`col-span-1 py-3 font-mono font-bold text-sky-400 hover:bg-sky-500/20 active:bg-sky-500/35 border-l border-slate-900/60 transition cursor-pointer select-none ${isPutITM ? "bg-purple-950/25" : ""}`}
                    >
                      ${row.put.bid.toFixed(2)}
                    </button>
                    
                    {/* Put Ask - Buy */}
                    <button 
                      onClick={() => handleLegClick("PUT", "BUY", row.strike, row.put.ask)}
                      className={`col-span-1 py-3 font-mono font-bold text-red-400 hover:bg-red-500/20 active:bg-red-500/35 transition cursor-pointer select-none ${isPutITM ? "bg-purple-950/25" : ""}`}
                    >
                      ${row.put.ask.toFixed(2)}
                    </button>

                    <div className={`col-span-1 py-3 font-mono text-text-main ${isPutITM ? "bg-purple-950/15" : ""}`}>
                      ${row.put.last.toFixed(2)}
                    </div>
                    <div className={`col-span-1 py-3 font-mono text-text-muted text-[10px] ${isPutITM ? "bg-purple-950/15" : ""}`}>
                      {row.put.vega ? row.put.vega.toFixed(3) : "0.000"}
                    </div>
                    <div className={`col-span-1 py-3 font-mono text-text-muted text-[10px] ${isPutITM ? "bg-purple-950/15" : ""}`}>
                      {row.put.gamma ? row.put.gamma.toFixed(3) : "0.000"}
                    </div>
                    <div className={`col-span-1 py-3 font-mono font-medium text-rose-400/80 text-[10px] ${isPutITM ? "bg-purple-950/15" : ""}`}>
                      {row.put.delta.toFixed(2)}
                    </div>
                    <div className={`col-span-1 py-3 font-mono text-text-muted text-[10px] ${isPutITM ? "bg-purple-950/15" : ""}`}>
                      {row.put.open_interest.toLocaleString()}
                    </div>
                    <div className={`col-span-1 py-3 font-mono text-text-sub text-[10px] ${isPutITM ? "bg-purple-950/15" : ""}`}>
                      {row.put.volume.toLocaleString()}
                    </div>
                    <div className={`col-span-1 py-3 font-mono text-text-muted text-[10px] ${isPutITM ? "bg-purple-950/15" : ""}`}>
                      {(row.put.iv * 100).toFixed(0)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl">
            <p className="text-sm font-semibold text-text-muted">No contracts available for the selected parameters.</p>
          </div>
        )}

      </main>

      {/* Floating Action / Selected Legs Panel */}
      {store.legs.length > 0 && !isMinimized && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-3xl bg-[#0f1524]/95 backdrop-blur border border-indigo-500/40 p-4 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-400" />
              <p className="text-xs font-bold text-white">{store.legs.length} Option Legs Loaded</p>
              <p className="text-[10px] text-text-sub">Active Symbol: <span className="font-bold font-mono text-indigo-400">{store.underlyingSymbol}</span></p>
            </div>
            <button 
              onClick={() => setIsMinimized(true)}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition"
              title="Minimize Panel"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
            {store.legs.map((leg) => (
              <div key={leg.id} className="flex items-center justify-between text-sm text-white bg-slate-900/30 rounded px-2 py-1">
                <span>{leg.action} {leg.optionType} ${leg.strikePrice.toFixed(2)} ({leg.expirationDate})</span>
                <button onClick={() => store.removeLeg(leg.id)} className="text-red-400 hover:text-red-300">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              startTransition(() => {
                router.push("/build");
              });
            }}
            disabled={isPending}
            className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-1.5 transition disabled:opacity-50"
          >
            {isPending ? "Routing..." : "Analyze in Builder"} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Minimized Pill in Bottom-Right */}
      {store.legs.length > 0 && isMinimized && (
        <button
          onClick={() => setIsMinimized(false)}
          className="fixed bottom-6 right-6 z-40 bg-indigo-600 hover:bg-indigo-500 border border-indigo-400/30 text-white p-3 px-4 rounded-xl shadow-2xl flex items-center gap-2 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <Layers className="h-4 w-4" />
          <span className="font-bold text-xs">{store.legs.length} Legs Loaded</span>
          <ChevronUp className="h-4 w-4" />
        </button>
      )}

      {/* Mini notification popup */}
      {addedLegFeedback && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-950/90 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200">
          <Check className="h-4 w-4 stroke-[3px]" />
          <div className="text-xs">
            <span className="font-semibold text-white">Leg Added:</span> {addedLegFeedback}
          </div>
        </div>
      )}
    </div>
  );
}

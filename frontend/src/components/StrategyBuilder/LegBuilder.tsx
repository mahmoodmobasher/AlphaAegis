"use client";

import React, { useMemo } from "react";
import { Plus, Trash2, ShieldAlert } from "lucide-react";
import { OptionLeg, OptionType, OptionAction } from "../../types";
import { calculateBSClient } from "../../utils/pricing";

interface LegBuilderProps {
  legs: OptionLeg[];
  underlyingPrice: number;
  impliedVolatility: number;
  riskFreeRate: number;
  addLeg: (leg?: Partial<OptionLeg>) => void;
  removeLeg: (id: string) => void;
  updateLeg: (id: string, updates: Partial<OptionLeg>) => void;
  clearStrategy: () => void;
  activeLegId?: string | null;
  setActiveLegId?: (id: string | null) => void;
}

export default function LegBuilder({
  legs,
  underlyingPrice,
  impliedVolatility,
  riskFreeRate,
  addLeg,
  removeLeg,
  updateLeg,
  clearStrategy,
  activeLegId,
  setActiveLegId
}: LegBuilderProps) {
  
  // Expiration Date calculation Helper
  const getExpirationDaysStr = (expDateStr: string) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const exp = new Date(expDateStr);
    const diffTime = exp.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? `${diffDays}d` : "Expired";
  };

  // Pre-configured strategy setups
  const loadPreset = (name: string) => {
    clearStrategy();
    const currentPrice = underlyingPrice;
    
    // Helper to get rounded strike prices
    const getStrike = (offset: number) => {
      const strike = Math.round(currentPrice / 5) * 5 + offset;
      return strike;
    };

    const d = new Date();
    d.setDate(d.getDate() + 30);
    const expDate = d.toISOString().split("T")[0];

    switch (name) {
      case "bull_call":
        addLeg({ optionType: "CALL", action: "BUY", strikePrice: getStrike(0), expirationDate: expDate, premium: 4.5 });
        addLeg({ optionType: "CALL", action: "SELL", strikePrice: getStrike(10), expirationDate: expDate, premium: 1.5 });
        break;
      case "bear_put":
        addLeg({ optionType: "PUT", action: "BUY", strikePrice: getStrike(0), expirationDate: expDate, premium: 4.0 });
        addLeg({ optionType: "PUT", action: "SELL", strikePrice: getStrike(-10), expirationDate: expDate, premium: 1.2 });
        break;
      case "straddle":
        addLeg({ optionType: "CALL", action: "BUY", strikePrice: getStrike(0), expirationDate: expDate, premium: 4.5 });
        addLeg({ optionType: "PUT", action: "BUY", strikePrice: getStrike(0), expirationDate: expDate, premium: 4.0 });
        break;
      case "strangle":
        addLeg({ optionType: "PUT", action: "BUY", strikePrice: getStrike(-5), expirationDate: expDate, premium: 2.2 });
        addLeg({ optionType: "CALL", action: "BUY", strikePrice: getStrike(5), expirationDate: expDate, premium: 2.5 });
        break;
      case "iron_condor":
        // Buy Put A, Sell Put B, Sell Call C, Buy Call D
        addLeg({ optionType: "PUT", action: "BUY", strikePrice: getStrike(-15), expirationDate: expDate, premium: 0.8 });
        addLeg({ optionType: "PUT", action: "SELL", strikePrice: getStrike(-5), expirationDate: expDate, premium: 2.0 });
        addLeg({ optionType: "CALL", action: "SELL", strikePrice: getStrike(5), expirationDate: expDate, premium: 2.3 });
        addLeg({ optionType: "CALL", action: "BUY", strikePrice: getStrike(15), expirationDate: expDate, premium: 0.9 });
        break;
      default:
        break;
    }
  };

  return (
    <div className="bg-bg-panel border border-border-panel p-5 rounded-2xl shadow-xl flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-4">
        <div>
          <h2 className="text-lg font-bold text-text-main">Option Legs Builder</h2>
          <p className="text-xs text-text-sub">Add up to 4 legs to create customized spreads and check their combined Greeks.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => loadPreset("bull_call")}
            className="px-2.5 py-1 text-xs bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 text-slate-300 transition"
          >
            Bull Call
          </button>
          <button
            onClick={() => loadPreset("bear_put")}
            className="px-2.5 py-1 text-xs bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 text-slate-300 transition"
          >
            Bear Put
          </button>
          <button
            onClick={() => loadPreset("straddle")}
            className="px-2.5 py-1 text-xs bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 text-slate-300 transition"
          >
            Straddle
          </button>
          <button
            onClick={() => loadPreset("iron_condor")}
            className="px-2.5 py-1 text-xs bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 text-slate-300 transition"
          >
            Iron Condor
          </button>
          <button
            onClick={clearStrategy}
            className="px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-md transition"
          >
            Reset
          </button>
        </div>
      </div>

      {legs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed border-slate-800 rounded-xl text-center">
          <ShieldAlert className="h-10 w-10 text-slate-600 mb-3" />
          <p className="text-sm text-text-sub font-medium">Your strategy workspace is empty</p>
          <p className="text-xs text-text-muted mt-1 mb-4 max-w-xs">Use the presets above or add a manual Call/Put option leg to begin.</p>
          <div className="flex gap-2">
            <button
              onClick={() => addLeg({ optionType: "CALL" })}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg shadow-md transition"
            >
              <Plus className="h-3.5 w-3.5" /> Call Leg
            </button>
            <button
              onClick={() => addLeg({ optionType: "PUT" })}
              className="flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs rounded-lg shadow-md transition"
            >
              <Plus className="h-3.5 w-3.5" /> Put Leg
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {legs.map((leg, index) => {
            // Calculate Greeks on-the-fly for individual leg feedback
            const bs = calculateBSClient(
              underlyingPrice,
              leg.strikePrice,
              leg.daysToExpiration,
              impliedVolatility,
              riskFreeRate,
              leg.optionType
            );
            const isLong = leg.action === "BUY";
            const mult = isLong ? 1.0 : -1.0;

            const getLegBorderClass = () => {
              if (leg.optionType === "CALL") {
                return leg.action === "BUY"
                  ? "border-l-[5px] border-l-[#00df89] border-y-slate-800 border-r-slate-800"
                  : "border-l-[5px] border-l-[#00df89]/30 border-y-slate-800 border-r-slate-800";
              } else {
                return leg.action === "BUY"
                  ? "border-l-[5px] border-l-[#ff3a60] border-y-slate-800 border-r-slate-800"
                  : "border-l-[5px] border-l-[#ff3a60]/30 border-y-slate-800 border-r-slate-800";
              }
            };

            const isActive = leg.id === activeLegId;
            return (
              <div 
                key={leg.id}
                onClick={() => setActiveLegId && setActiveLegId(leg.id)}
                className={`border rounded-xl p-4 transition duration-200 bg-slate-950/40 hover:bg-slate-950/60 cursor-pointer ${
                  isActive ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-slate-900" : ""
                } ${getLegBorderClass()}`}
              >
                {/* Leg Header / Control row */}
                <div className="grid grid-cols-2 sm:grid-cols-6 lg:grid-cols-7 gap-3 items-center">
                  
                  {/* Action Selector */}
                  <div className="flex flex-col">
                    <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-1">Action</span>
                    <select
                      value={leg.action}
                      onChange={(e) => updateLeg(leg.id, { action: e.target.value as OptionAction })}
                      className="bg-slate-800 border border-slate-700 text-text-main rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                    >
                      <option value="BUY">BUY (Long)</option>
                      <option value="SELL">SELL (Short)</option>
                    </select>
                  </div>

                  {/* Quantity Input */}
                  <div className="flex flex-col">
                    <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-1">Quantity</span>
                    <input
                      type="number"
                      min={1}
                      value={leg.quantity}
                      onChange={(e) => updateLeg(leg.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="bg-slate-800 border border-slate-700 text-text-main rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none w-full"
                    />
                  </div>

                  {/* Strike Price */}
                  <div className="flex flex-col">
                    <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-1">Strike ($)</span>
                    <input
                      type="number"
                      step={0.5}
                      min={0.5}
                      value={leg.strikePrice}
                      onChange={(e) => updateLeg(leg.id, { strikePrice: Math.max(0.5, parseFloat(e.target.value) || 0) })}
                      className="bg-slate-800 border border-slate-700 text-text-main rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none w-full"
                    />
                  </div>

                  {/* Option Type */}
                  <div className="flex flex-col">
                    <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-1">Type</span>
                    <select
                      value={leg.optionType}
                      onChange={(e) => updateLeg(leg.id, { optionType: e.target.value as OptionType })}
                      className="bg-slate-800 border border-slate-700 text-text-main rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                    >
                      <option value="CALL">CALL</option>
                      <option value="PUT">PUT</option>
                    </select>
                  </div>

                  {/* Expiration Date */}
                  <div className="flex flex-col sm:col-span-2 lg:col-span-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Expiration</span>
                      <span className="text-[10px] text-indigo-400 font-semibold">{getExpirationDaysStr(leg.expirationDate)}</span>
                    </div>
                    <input
                      type="date"
                      value={leg.expirationDate}
                      onChange={(e) => updateLeg(leg.id, { expirationDate: e.target.value })}
                      className="bg-slate-800 border border-slate-700 text-text-main rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none w-full"
                    />
                  </div>

                  {/* Premium / Entry Price */}
                  <div className="flex flex-col">
                    <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-1">Premium ($)</span>
                    <input
                      type="number"
                      step={0.05}
                      min={0.01}
                      value={leg.premium}
                      onChange={(e) => updateLeg(leg.id, { premium: Math.max(0.01, parseFloat(e.target.value) || 0) })}
                      className="bg-slate-800 border border-slate-700 text-text-main rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none w-full"
                    />
                  </div>

                  {/* Actions / Delete */}
                  <div className="flex items-end justify-end h-full">
                    <button
                      onClick={() => removeLeg(leg.id)}
                      className="p-2 text-text-muted hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                      title="Remove Leg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Greeks Grid for this leg */}
                <div className="grid grid-cols-5 gap-2 mt-4 pt-3 border-t border-slate-800 text-center">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-text-muted uppercase tracking-wider">Delta (Δ)</span>
                    <span className={`text-xs font-semibold mt-0.5 ${(bs.delta * mult) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {(bs.delta * mult).toFixed(3)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-text-muted uppercase tracking-wider">Gamma (Γ)</span>
                    <span className={`text-xs font-semibold mt-0.5 ${(bs.gamma * mult) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {(bs.gamma * mult).toFixed(4)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-text-muted uppercase tracking-wider">Theta (Θ)</span>
                    <span className={`text-xs font-semibold mt-0.5 ${(bs.theta * mult) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {(bs.theta * mult).toFixed(3)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-text-muted uppercase tracking-wider">Vega (ν)</span>
                    <span className={`text-xs font-semibold mt-0.5 ${(bs.vega * mult) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {(bs.vega * mult).toFixed(3)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-text-muted uppercase tracking-wider">Rho (ρ)</span>
                    <span className={`text-xs font-semibold mt-0.5 ${(bs.rho * mult) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {(bs.rho * mult).toFixed(3)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {legs.length < 4 && (
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => addLeg({ optionType: "CALL" })}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-emerald-400 font-semibold text-xs rounded-xl shadow transition"
              >
                <Plus className="h-4 w-4" /> Add Call Leg
              </button>
              <button
                onClick={() => addLeg({ optionType: "PUT" })}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-rose-400 font-semibold text-xs rounded-xl shadow transition"
              >
                <Plus className="h-4 w-4" /> Add Put Leg
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend
} from "recharts";
import { OptionLeg } from "../../types";
import { calculateBSClient } from "../../utils/pricing";
import PnLTable from "./PnLTable";


interface PnLChartProps {
  legs: OptionLeg[];
  underlyingPrice: number;
  impliedVolatility: number;
  riskFreeRate: number;
}

export default function PnLChart({
  legs,
  underlyingPrice,
  impliedVolatility,
  riskFreeRate
}: PnLChartProps) {
  const [activeView, setActiveView] = useState<"graph" | "table">("graph");

  // Simulator state: Target days to simulate (from 0 = Expiration to Max Expiration Days)
  const maxDays = useMemo(() => {
    if (legs.length === 0) return 30;
    return Math.max(...legs.map(l => l.daysToExpiration), 1);
  }, [legs]);

  const [simDays, setSimDays] = useState<number>(maxDays);

  // Sync simDays when maxDays changes (on option expiry change or analysis selection)
  React.useEffect(() => {
    setSimDays(maxDays);
  }, [maxDays]);


  // Auto-fit stock price range based on strike prices and underlying price
  const chartRange = useMemo(() => {
    const defaultMin = underlyingPrice * 0.8;
    const defaultMax = underlyingPrice * 1.2;

    if (legs.length === 0) {
      return { min: defaultMin, max: defaultMax };
    }

    const strikes = legs.map(l => l.strikePrice);
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);
    
    // Choose wide bounds around strikes and spot
    const absoluteMin = Math.min(minStrike, underlyingPrice) * 0.8;
    const absoluteMax = Math.max(maxStrike, underlyingPrice) * 1.2;
    
    // Clamp to logical limits (price cannot be negative)
    return {
      min: Math.max(0.1, absoluteMin),
      max: absoluteMax
    };
  }, [legs, underlyingPrice]);

  // Generate chart data points
  const chartData = useMemo(() => {
    const pointsCount = 60;
    const step = (chartRange.max - chartRange.min) / (pointsCount - 1);
    const data = [];

    for (let i = 0; i < pointsCount; i++) {
      const currentPrice = chartRange.min + i * step;
      
      let expProfitLoss = 0;
      let todayProfitLoss = 0;

      legs.forEach(leg => {
        const isLong = leg.action === "BUY";
        const sign = isLong ? 1.0 : -1.0;
        const K = leg.strikePrice;
        
        // --- Expiration P&L calculation (analytical) ---
        let expVal = 0;
        if (leg.optionType === "CALL") {
          expVal = Math.max(currentPrice - K, 0);
        } else {
          expVal = Math.max(K - currentPrice, 0);
        }
        
        // P&L at expiration: (Intrinsic Value - Entry Premium) * Quantity * 100 (for Long)
        // Or: (Entry Premium - Intrinsic Value) * Quantity * 100 (for Short)
        const expPnL = (expVal - leg.premium) * leg.quantity * 100 * sign;
        expProfitLoss += expPnL;

        // --- Simulated Target Date P&L (Black-Scholes) ---
        // SimDays is number of days remaining. If we are simulating "simDays" remaining out of total "daysToExpiration"
        const remainingDays = Math.max(0, simDays);
        const bs = calculateBSClient(
          currentPrice,
          K,
          remainingDays,
          impliedVolatility,
          riskFreeRate,
          leg.optionType
        );
        
        // P&L today: (BS Price - Entry Premium) * Quantity * 100 (for Long)
        // Or: (Entry Premium - BS Price) * Quantity * 100 (for Short)
        const todayPnL = (bs.price - leg.premium) * leg.quantity * 100 * sign;
        todayProfitLoss += todayPnL;
      });

      data.push({
        price: parseFloat(currentPrice.toFixed(2)),
        "At Expiration": parseFloat(expProfitLoss.toFixed(2)),
        "Target Date": parseFloat(todayProfitLoss.toFixed(2)),
        "Zero Line": 0
      });
    }

    return data;
  }, [legs, chartRange, simDays, impliedVolatility, riskFreeRate]);

  // Compute key summary statistics
  const stats = useMemo(() => {
    if (legs.length === 0) {
      return { 
        maxProfit: "$0.00", 
        maxLoss: "$0.00", 
        netCost: 0, 
        type: "Net Debit", 
        minPnLValue: 0, 
        maxPnLValue: 0 
      };
    }

    let netCost = 0;
    legs.forEach(leg => {
      const factor = leg.action === "BUY" ? 1 : -1;
      netCost += leg.premium * leg.quantity * 100 * factor;
    });

    // We can sample the generated chart data to find max profit, max loss
    const expirationValues = chartData.map(d => d["At Expiration"]);
    const minPnl = Math.min(...expirationValues);
    const maxPnl = Math.max(...expirationValues);

    // Estimate if profit/loss is uncapped by looking at endpoints
    const leftEndpoint = expirationValues[0];
    const rightEndpoint = expirationValues[expirationValues.length - 1];
    
    // Check if the strategy values grow outward
    const isLeftGrowing = leftEndpoint > expirationValues[1];
    const isRightGrowing = rightEndpoint > expirationValues[expirationValues.length - 2];

    const isUnlimitedProfit = isLeftGrowing || isRightGrowing;
    const isUnlimitedLoss = (leftEndpoint < expirationValues[1] && minPnl === leftEndpoint) || 
                            (rightEndpoint < expirationValues[expirationValues.length - 2] && minPnl === rightEndpoint);

    return {
      netCost: Math.abs(netCost),
      type: netCost >= 0 ? "Net Debit" : "Net Credit",
      maxProfit: isUnlimitedProfit ? "Unlimited" : `$${maxPnl.toFixed(2)}`,
      maxLoss: isUnlimitedLoss ? "Unlimited" : `$${Math.abs(minPnl).toFixed(2)}`,
      minPnLValue: minPnl,
      maxPnLValue: maxPnl
    };
  }, [chartData, legs]);

  // Custom tooltips to show detail on legs P&L
  const customTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const price = data.price;
      const expVal = data["At Expiration"];
      const targetVal = data["Target Date"];
      
      return (
        <div className="glass-panel p-3 rounded-lg border border-slate-700 shadow-xl text-sm max-w-xs">
          <p className="font-semibold text-slate-200 border-b border-slate-700 pb-1 mb-2">
            Stock Price: <span className="text-emerald-400">${price}</span>
          </p>
          <div className="space-y-1 mb-2">
            <p className="flex justify-between">
              <span className="text-slate-400">Target Date P&L:</span>
              <span className={targetVal >= 0 ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
                {targetVal >= 0 ? "+" : ""}${targetVal}
              </span>
            </p>
            <p className="flex justify-between">
              <span className="text-slate-400">At Expiration P&L:</span>
              <span className={expVal >= 0 ? "text-emerald-500 font-medium" : "text-rose-500 font-medium"}>
                {expVal >= 0 ? "+" : ""}${expVal}
              </span>
            </p>
          </div>
          {legs.length > 0 && (
            <div className="border-t border-slate-800 pt-2 mt-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Individual Legs (At Exp)</p>
              <div className="space-y-1 max-h-32 overflow-y-auto text-xs">
                {legs.map((leg, index) => {
                  const isLong = leg.action === "BUY";
                  const K = leg.strikePrice;
                  let v = 0;
                  if (leg.optionType === "CALL") {
                    v = Math.max(price - K, 0);
                  } else {
                    v = Math.max(K - price, 0);
                  }
                  const pnl = (v - leg.premium) * leg.quantity * 100 * (isLong ? 1.0 : -1.0);
                  return (
                    <div key={leg.id} className="flex justify-between text-slate-300">
                      <span>{leg.action} {leg.quantity}x ${K} {leg.optionType}:</span>
                      <span className={pnl >= 0 ? "text-emerald-500" : "text-rose-500"}>
                        {pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full flex flex-col space-y-4">
      {/* View Switcher Tabs */}
      <div className="flex gap-1.5 bg-slate-950/60 p-1 border border-slate-800 rounded-xl max-w-[280px]">
        <button
          onClick={() => setActiveView("graph")}
          className={`flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeView === "graph"
              ? "bg-indigo-600 text-white shadow shadow-indigo-500/10"
              : "text-text-sub hover:text-text-main"
          }`}
        >
          Payoff Graph
        </button>
        <button
          onClick={() => setActiveView("table")}
          className={`flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeView === "table"
              ? "bg-indigo-600 text-white shadow shadow-indigo-500/10"
              : "text-text-sub hover:text-text-main"
          }`}
        >
          P&L Matrix
        </button>
      </div>

      {activeView === "graph" ? (
        <>
          {/* Simulation days slider */}
          <div className="bg-bg-panel border border-border-panel p-4 rounded-xl shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
              <div>
                <h3 className="font-semibold text-text-main flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                  Time Simulation: <span className="text-indigo-400 font-mono">{simDays} days</span> remaining
                </h3>
                <p className="text-xs text-text-muted">Simulate the effect of time decay (Theta) on P&L curve before expiration.</p>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-text-sub">
                <span>0 (Exp)</span>
                <input
                  type="range"
                  min={0}
                  max={maxDays}
                  value={simDays}
                  onChange={(e) => setSimDays(parseInt(e.target.value))}
                  className="w-32 sm:w-48 accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
                <span>{maxDays} (Today)</span>
              </div>
            </div>
          </div>

          {/* Main interactive chart */}
          <div className="bg-bg-panel border border-border-panel p-4 rounded-xl shadow-lg relative min-h-[380px] w-full">
            {legs.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-900/10 rounded-xl">
                <div className="text-indigo-400 mb-2 font-semibold text-lg">No option legs selected</div>
                <p className="text-text-muted text-sm max-w-sm">Add option contracts below to start simulating options strategies and visualize payoff diagrams.</p>
              </div>
            ) : null}

            <div className="h-[300px] w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis 
                    dataKey="price" 
                    stroke="#64748b" 
                    tickLine={false} 
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis 
                    stroke="#64748b" 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(value) => `$${value}`}
                    dx={-10}
                  />
                  <Tooltip content={customTooltip} cursor={{ stroke: "#4f46e5", strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  
                  {/* Zero line */}
                  <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
                  
                  {/* Current stock price indicator */}
                  <ReferenceLine 
                    x={underlyingPrice} 
                    stroke="#4f46e5" 
                    strokeWidth={1.5} 
                    strokeDasharray="3 3"
                    label={{ value: `Spot: $${underlyingPrice}`, position: "top", fill: "#818cf8", fontSize: 10, fontWeight: "bold" }} 
                  />
                  
                  {/* Strike price indicators for each leg */}
                  {legs.map((leg) => (
                    <ReferenceLine 
                      key={leg.id}
                      x={leg.strikePrice} 
                      stroke={leg.optionType === "CALL" ? "#00df89" : "#ff3a60"} 
                      strokeWidth={1.5} 
                      strokeDasharray="3 3"
                      label={{ 
                        value: `${leg.strikePrice}${leg.optionType === "CALL" ? "C" : "P"}`, 
                        position: "bottom", 
                        fill: leg.optionType === "CALL" ? "#00df89" : "#ff3a60", 
                        fontSize: 9,
                        fontWeight: "bold"
                      }} 
                    />
                  ))}
                  
                  {/* Expiration line */}
                  <Line
                    type="monotone"
                    dataKey="At Expiration"
                    stroke="#ff3a60"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="4 4"
                    activeDot={{ r: 4 }}
                  />
                  
                  {/* Today / Target Date line */}
                  <Line
                    type="monotone"
                    dataKey="Target Date"
                    stroke="#00df89"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : (
        <PnLTable
          legs={legs}
          underlyingPrice={underlyingPrice}
          impliedVolatility={impliedVolatility}
          riskFreeRate={riskFreeRate}
        />
      )}

      {/* Summary figures */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-bg-panel border border-border-panel p-4 rounded-xl flex flex-col justify-between shadow-lg">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Strategy Type</span>
          <span className="text-lg font-bold text-text-main mt-1 flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${stats.type === "Net Debit" ? "bg-amber-500" : "bg-teal-500"}`}></span>
            {stats.type}
          </span>
        </div>
        <div className="bg-bg-panel border border-border-panel p-4 rounded-xl flex flex-col justify-between shadow-lg">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Net Cost</span>
          <span className="text-lg font-bold text-text-main mt-1">${stats.netCost.toFixed(2)}</span>
        </div>
        <div className="bg-bg-panel border border-border-panel p-4 rounded-xl flex flex-col justify-between shadow-lg">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Max Profit</span>
          <span className={`text-lg font-bold mt-1 ${stats.maxProfit === "Unlimited" || stats.maxPnLValue > 0 ? "text-emerald-400" : "text-text-main"}`}>
            {stats.maxProfit}
          </span>
        </div>
        <div className="bg-bg-panel border border-border-panel p-4 rounded-xl flex flex-col justify-between shadow-lg">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Max Loss</span>
          <span className={`text-lg font-bold mt-1 ${stats.maxLoss !== "Unlimited" ? "text-rose-400" : "text-text-main"}`}>
            {stats.maxLoss}
          </span>
        </div>
      </div>
    </div>
  );
}

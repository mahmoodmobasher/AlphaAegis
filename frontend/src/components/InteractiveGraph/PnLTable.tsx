"use client";

import React, { useMemo } from "react";
import { OptionLeg } from "../../types";
import { calculateBSClient } from "../../utils/pricing";

interface PnLTableProps {
  legs: OptionLeg[];
  underlyingPrice: number;
  impliedVolatility: number;
  riskFreeRate: number;
}

export default function PnLTable({
  legs,
  underlyingPrice,
  impliedVolatility,
  riskFreeRate
}: PnLTableProps) {
  // Expiration days context
  const maxDays = useMemo(() => {
    if (legs.length === 0) return 30;
    return Math.max(...legs.map(l => l.daysToExpiration), 1);
  }, [legs]);

  // Define date columns (5 columns: Today, 75%, 50%, 25%, Exp)
  const columns = useMemo(() => {
    const dates: { days: number; label: string; ratio: number }[] = [];
    const steps = [1.0, 0.75, 0.5, 0.25, 0.0];
    
    steps.forEach((ratio) => {
      const days = Math.round(maxDays * ratio);
      
      // Generate standard readable label
      let label = "";
      if (ratio === 1.0) label = "Today";
      else if (ratio === 0.0) label = "Exp";
      else label = `-${Math.round(maxDays * (1 - ratio))}d`;
      
      dates.push({
        days,
        label,
        ratio
      });
    });
    
    return dates;
  }, [maxDays]);

  // Define price levels (11 rows centered on underlyingPrice)
  const rows = useMemo(() => {
    // Percent offsets around current stock price
    const offsets = [-0.15, -0.10, -0.075, -0.05, -0.025, 0.0, 0.025, 0.05, 0.075, 0.10, 0.15];
    
    return offsets.map(pct => {
      const price = underlyingPrice * (1 + pct);
      return {
        price: parseFloat(price.toFixed(2)),
        percentage: pct * 100
      };
    }).reverse(); // Display high prices at the top, low at the bottom
  }, [underlyingPrice]);

  // Compute cell P&L values
  const matrixData = useMemo(() => {
    let maxAbsVal = 1.0; // Avoid division by zero
    
    const grid = rows.map((row) => {
      const rowCells = columns.map((col) => {
        let netPnL = 0;
        
        legs.forEach((leg) => {
          const isLong = leg.action === "BUY";
          const sign = isLong ? 1.0 : -1.0;
          const K = leg.strikePrice;
          
          if (col.days === 0) {
            // Analytical expiration value
            let intrinsic = 0;
            if (leg.optionType === "CALL") {
              intrinsic = Math.max(row.price - K, 0);
            } else {
              intrinsic = Math.max(K - row.price, 0);
            }
            netPnL += (intrinsic - leg.premium) * leg.quantity * 100 * sign;
          } else {
            // Black-Scholes simulated value
            const bs = calculateBSClient(
              row.price,
              K,
              col.days,
              impliedVolatility,
              riskFreeRate,
              leg.optionType
            );
            netPnL += (bs.price - leg.premium) * leg.quantity * 100 * sign;
          }
        });
        
        const roundedPnL = parseFloat(netPnL.toFixed(2));
        if (Math.abs(roundedPnL) > maxAbsVal) {
          maxAbsVal = Math.abs(roundedPnL);
        }
        
        return {
          val: roundedPnL
        };
      });
      
      return {
        price: row.price,
        percentage: row.percentage,
        cells: rowCells
      };
    });
    
    return { grid, maxAbsVal };
  }, [rows, columns, legs, impliedVolatility, riskFreeRate]);

  // Helper to color grid cells dynamically
  const getCellBgStyle = (val: number, maxAbs: number) => {
    if (val === 0) return { backgroundColor: "transparent" };
    
    // Scale intensity linearly relative to highest value in matrix, capped at 85% opacity
    const ratio = Math.min(Math.abs(val) / maxAbs, 1.0);
    const alpha = Math.max(0.15, ratio * 0.75);
    
    if (val > 0) {
      // HSL for Profit Green (#00df89)
      return {
        backgroundColor: `rgba(0, 223, 137, ${alpha.toFixed(2)})`,
        color: "#ffffff"
      };
    } else {
      // HSL for Loss Red (#ff3a60)
      return {
        backgroundColor: `rgba(255, 58, 96, ${alpha.toFixed(2)})`,
        color: "#ffffff"
      };
    }
  };

  if (legs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-900/10 rounded-xl min-h-[350px] border border-dashed border-slate-800">
        <p className="text-text-muted text-sm">Add option contracts to display the P&L Matrix grid.</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-panel border border-border-panel p-4 rounded-xl shadow-lg flex flex-col space-y-3 w-full overflow-hidden">
      <div className="flex justify-between items-center pb-2 border-b border-slate-800">
        <div>
          <h3 className="font-bold text-sm text-text-main flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
            Payoff P&L Matrix
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5">Payoff matrix at various stock price offsets and days to expiry.</p>
        </div>
        <span className="text-[10px] bg-slate-900 border border-slate-800 text-text-sub font-mono px-2 py-0.5 rounded">
          Max Matrix Value: ${matrixData.maxAbsVal.toFixed(0)}
        </span>
      </div>

      <div className="overflow-x-auto w-full">
        <table className="w-full text-[11px] border-collapse min-w-[500px]">
          <thead>
            <tr>
              <th className="py-2 px-3 text-left text-text-muted font-bold uppercase tracking-wider border-b border-slate-800 w-1/4">Stock Price</th>
              {columns.map((col, idx) => (
                <th key={idx} className="py-2 px-1 text-center text-text-muted font-bold uppercase tracking-wider border-b border-slate-800">
                  <div className="flex flex-col">
                    <span className="text-text-main font-semibold">{col.label}</span>
                    <span className="text-[9px] text-text-muted normal-case font-mono mt-0.5">{col.days} days</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrixData.grid.map((row, rowIdx) => {
              const isSpotRow = Math.abs(row.percentage) < 0.1;
              return (
                <tr 
                  key={rowIdx} 
                  className={`hover:bg-slate-800/20 transition-colors ${
                    isSpotRow ? "bg-indigo-950/20 border-y border-indigo-500/20 font-bold" : "border-b border-slate-800/30"
                  }`}
                >
                  <td className="py-2.5 px-3 text-left font-mono text-text-sub flex items-center justify-between">
                    <span>${row.price.toFixed(2)}</span>
                    <span className={`text-[9px] font-semibold px-1 py-0.5 rounded ${
                      row.percentage === 0 
                        ? "text-slate-400" 
                        : row.percentage > 0 ? "text-emerald-400" : "text-rose-400"
                    }`}>
                      {row.percentage === 0 ? "0.0%" : `${row.percentage > 0 ? "+" : ""}${row.percentage.toFixed(1)}%`}
                    </span>
                  </td>
                  {row.cells.map((cell, cellIdx) => (
                    <td 
                      key={cellIdx} 
                      style={getCellBgStyle(cell.val, matrixData.maxAbsVal)} 
                      className="p-1.5 text-center font-mono font-semibold border border-slate-800/10 text-xs"
                    >
                      {cell.val >= 0 ? "+" : ""}${Math.abs(cell.val).toFixed(0)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center text-[9px] text-text-muted pt-1">
        <span>Rows center on simulated spot price.</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-emerald-500/40 inline-block"></span> Profit
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-rose-500/40 inline-block"></span> Loss
          </span>
        </div>
      </div>
    </div>
  );
}

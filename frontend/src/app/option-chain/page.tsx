"use client";

import React, { useState } from "react";
import { ibApi } from "@/services/api";
import { useStrategyStore } from "@/store/useStrategyStore";

export default function OptionChainPage() {
  const store = useStrategyStore();
  const [symbol, setSymbol] = useState("");
  const [chain, setChain] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChain = async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const activeConfigIdStr = localStorage.getItem("active_ib_config_id");
      const activeConfigId = activeConfigIdStr ? Number(activeConfigIdStr) : null;
      const data = await ibApi.getOptionChain(symbol, activeConfigId, store.token);
      setChain(data);
    } catch (e: any) {
      setError(e.message || "Failed to fetch option chain");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-black flex items-center justify-center p-8">
      <div className="bg-slate-800/60 backdrop-blur-md rounded-2xl shadow-xl border border-slate-700 w-full max-w-3xl p-8 animate-in fade-in zoom-in-95 duration-200">
        <h1 className="text-3xl font-bold text-slate-100 mb-6 text-center">Option Chain Lookup</h1>
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            placeholder="Underlying Symbol (e.g., AAPL)"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="flex-1 p-2 bg-slate-800 text-slate-100 rounded border border-slate-600"
          />
          <button
            onClick={fetchChain}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-md transition"
          >
            {loading ? "Loading..." : "Fetch"}
          </button>
        </div>
        {error && <p className="text-red-400 mb-2">{error}</p>}
        {chain.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-200">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Trade Date/Month</th>
                  <th className="px-3 py-2">Strike</th>
                  <th className="px-3 py-2">Right</th>
                  <th className="px-3 py-2">Exchange</th>
                  <th className="px-3 py-2">Currency</th>
                  <th className="px-3 py-2">Local Symbol</th>
                </tr>
              </thead>
              <tbody>
                {chain.map((c, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-slate-800/30" : "bg-slate-700/30"}>
                    <td className="px-3 py-1">{c.symbol}</td>
                    <td className="px-3 py-1">{c.lastTradeDateOrContractMonth}</td>
                    <td className="px-3 py-1">{c.strike}</td>
                    <td className="px-3 py-1">{c.right}</td>
                    <td className="px-3 py-1">{c.exchange}</td>
                    <td className="px-3 py-1">{c.currency}</td>
                    <td className="px-3 py-1">{c.localSymbol}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

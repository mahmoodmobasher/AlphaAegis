import React from 'react';
import { usePortfolioStore } from '../../store/usePortfolioStore';

export default function ShockSliders() {
  const spotPrice = usePortfolioStore((state) => state.spotPrice);
  const setSpotPrice = usePortfolioStore((state) => state.setSpotPrice);
  const volatility = usePortfolioStore((state) => state.volatility);
  const setVolatility = usePortfolioStore((state) => state.setVolatility);

  const spotShock = ((spotPrice - 180) / 180) * 100;
  const ivShock = ((volatility - 0.28) / 0.28) * 100;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
      <div className="space-y-2">
        <div className="flex justify-between text-[11px] font-bold">
          <span className="text-white">Underlying Spot Price Shock</span>
          <span className={`font-mono ${spotShock > 0 ? "text-emerald-400" : spotShock < 0 ? "text-rose-400" : "text-text-muted"}`}>
            {spotShock > 0 ? "+" : ""}{spotShock.toFixed(1)}% (${spotPrice.toFixed(2)})
          </span>
        </div>
        <input
          type="range"
          min="126"
          max="234"
          step="1"
          value={spotPrice}
          onChange={(e) => setSpotPrice(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none border border-slate-800"
        />
        <div className="flex justify-between text-[9px] text-text-muted font-medium">
          <span>-30% Shock ($126.00)</span>
          <span>Base Case ($180.00)</span>
          <span>+30% Shock ($234.00)</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-[11px] font-bold">
          <span className="text-white">Implied Volatility (IV) Shock</span>
          <span className={`font-mono ${ivShock > 0 ? "text-indigo-400" : ivShock < 0 ? "text-amber-500" : "text-text-muted"}`}>
            {ivShock > 0 ? "+" : ""}{ivShock.toFixed(1)}% ({(volatility * 100).toFixed(0)}%)
          </span>
        </div>
        <input
          type="range"
          min="0.14"
          max="0.70"
          step="0.01"
          value={volatility}
          onChange={(e) => setVolatility(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none border border-slate-800"
        />
        <div className="flex justify-between text-[9px] text-text-muted font-medium">
          <span>-50% IV Vol (14%)</span>
          <span>Base Case (28%)</span>
          <span>+150% Vol Spike (70%)</span>
        </div>
      </div>
    </div>
  );
}

export function HistoricalPresets() {
  const spotPrice = usePortfolioStore((state) => state.spotPrice);
  const setSpotPrice = usePortfolioStore((state) => state.setSpotPrice);
  const volatility = usePortfolioStore((state) => state.volatility);
  const setVolatility = usePortfolioStore((state) => state.setVolatility);

  const spotShock = ((spotPrice - 180) / 180) * 100;
  const ivShock = ((volatility - 0.28) / 0.28) * 100;

  const setShocks = (spotS: number, ivS: number) => {
    setSpotPrice(180 * (1 + spotS / 100));
    setVolatility(0.28 * (1 + ivS / 100));
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-[10px] text-text-muted font-bold mr-1">Historical Presets:</span>
      <button
        onClick={() => setShocks(-10.0, 30.0)}
        className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition ${
          Math.abs(spotShock + 10.0) < 0.1 && Math.abs(ivShock - 30.0) < 0.1
            ? "bg-indigo-600 text-white border-indigo-500 shadow"
            : "bg-slate-900 border-slate-800 text-text-sub hover:text-text-main"
        }`}
      >
        Tech Correction (-10% Spot, +30% IV)
      </button>
      <button
        onClick={() => setShocks(-2.0, 50.0)}
        className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition ${
          Math.abs(spotShock + 2.0) < 0.1 && Math.abs(ivShock - 50.0) < 0.1
            ? "bg-indigo-600 text-white border-indigo-500 shadow"
            : "bg-slate-900 border-slate-800 text-text-sub hover:text-text-main"
        }`}
      >
        Vol Spike (-2% Spot, +50% IV)
      </button>
      <button
        onClick={() => setShocks(-20.0, 100.0)}
        className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition ${
          Math.abs(spotShock + 20.0) < 0.1 && Math.abs(ivShock - 100.0) < 0.1
            ? "bg-indigo-600 text-white border-indigo-500 shadow"
            : "bg-slate-900 border-slate-800 text-text-sub hover:text-text-main"
        }`}
      >
        Black Monday (-20% Spot, +100% IV)
      </button>
      <button
        onClick={() => setShocks(5.0, -15.0)}
        className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition ${
          Math.abs(spotShock - 5.0) < 0.1 && Math.abs(ivShock + 15.0) < 0.1
            ? "bg-indigo-600 text-white border-indigo-500 shadow"
            : "bg-slate-900 border-slate-800 text-text-sub hover:text-text-main"
        }`}
      >
        Market Recovery (+5% Spot, -15% IV)
      </button>
      {(Math.abs(spotShock) > 0.1 || Math.abs(ivShock) > 0.1) && (
        <button
          onClick={() => setShocks(0.0, 0.0)}
          className="px-2.5 py-1 text-[10px] font-bold rounded-lg border bg-rose-950/30 border-rose-900 text-rose-400 hover:bg-rose-950/60 transition"
        >
          Reset Shocks
        </button>
      )}
    </div>
  );
}

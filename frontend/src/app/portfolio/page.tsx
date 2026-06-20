"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { 
  Briefcase, 
  TrendingUp, 
  TrendingDown, 
  Trash2, 
  Layers, 
  Plus, 
  X, 
  BookOpen, 
  Info,
  ChevronDown,
  ChevronUp,
  LineChart,
  Lock,
  ArrowRight,
  Sparkles,
  PieChart,
  RefreshCw,
  Server,
  AlertCircle,
  ShieldAlert,
  Gauge,
  Activity,
  Camera,
  ArrowUpDown,
  SlidersHorizontal,
  MessageSquare,
  Check,
  FileText
} from "lucide-react";
import Navbar from "../../components/Navigation/Navbar";
import { useStrategyStore } from "../../store/useStrategyStore";
import { portfolioApi, ibApi, riskApi, agentsApi } from "../../services/api";
import { usePortfolioStore } from "../../store/usePortfolioStore";
import ShockSliders, { HistoricalPresets } from "../../components/InteractiveGraph/ShockSliders";


interface LegCalc {
  id: number;
  sec_type?: string;
  option_type: string;
  action: string;
  strike_price: number;
  expiration_date: string;
  quantity: number;
  entry_premium: number;
  current_price: number;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
}

interface Position {
  id: number;
  name: string;
  underlying_symbol: string;
  underlying_price: number;
  quantity: number;
  entry_price: number;
  entry_cost: number;
  current_value: number;
  total_pnl: number;
  total_pnl_percent: number;
  strategy?: string;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  legs: LegCalc[];
  created_at: string;
}

interface PortfolioSummary {
  total_entry_cost: number;
  total_current_value: number;
  total_pnl: number;
  total_pnl_percent: number;
  net_liquidation?: number;
  total_cash_value?: number;
  buying_power?: number;
  maint_margin_req?: number;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
}

interface SectorExposure {
  sector: string;
  value: number;
  percentage: number;
}

interface WatchlistItem {
  id: number;
  symbol: string;
}

interface Note {
  id: number;
  symbol: string;
  note_text: string;
  created_at: string;
}

interface NormalizedPosition {
  symbol: string;
  type: string;
  spotPrice: number;
  quantity: number;
  marketValue: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

const calculateStressTest = (normalizedPositions: NormalizedPosition[]) => {
  const shifts = [-0.10, -0.05, -0.02, 0.0, 0.02, 0.05, 0.10];
  return shifts.map(p => {
    let deltaImpact = 0;
    let gammaImpact = 0;
    
    normalizedPositions.forEach(pos => {
      const deltaS = pos.spotPrice * p;
      deltaImpact += pos.delta * deltaS;
      gammaImpact += 0.5 * pos.gamma * deltaS * deltaS;
    });
    
    const netImpact = deltaImpact + gammaImpact;
    return {
      percent: p,
      percentStr: `${p >= 0 ? "+" : ""}${(p * 100).toFixed(0)}%`,
      deltaImpact,
      gammaImpact,
      netImpact
    };
  });
};

const getAssetBreakdown = (normalizedPositions: NormalizedPosition[]) => {
  const breakdown: Record<string, {
    symbol: string;
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    marketValue: number;
    positionCount: number;
  }> = {};
  
  normalizedPositions.forEach(pos => {
    const sym = pos.symbol.toUpperCase();
    if (!breakdown[sym]) {
      breakdown[sym] = {
        symbol: sym,
        delta: 0,
        gamma: 0,
        theta: 0,
        vega: 0,
        marketValue: 0,
        positionCount: 0
      };
    }
    
    breakdown[sym].delta += pos.delta;
    breakdown[sym].gamma += pos.gamma;
    breakdown[sym].theta += pos.theta;
    breakdown[sym].vega += pos.vega;
    breakdown[sym].marketValue += pos.marketValue;
    breakdown[sym].positionCount += 1;
  });
  
  return Object.values(breakdown);
};

export default function PortfolioPage() {
  const router = useRouter();
  const store = useStrategyStore();
  const [isPending, startTransition] = useTransition();

  const [portfolioData, setPortfolioData] = useState<{
    positions: Position[];
    summary: PortfolioSummary;
    sector_exposure: SectorExposure[];
  } | null>(null);
  
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [newWatchlistSymbol, setNewWatchlistSymbol] = useState("");
  
  // Note journaling
  const [activeNoteSymbol, setActiveNoteSymbol] = useState("AAPL");
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNoteText, setNewNoteText] = useState("");

  const [expandedPositions, setExpandedPositions] = useState<Record<number, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State variables for Interactive Brokers live dashboard
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<"local" | "ib">("local");
  const [ibPortfolioData, setIbPortfolioData] = useState<any | null>(null);
  const [ibLoading, setIbLoading] = useState(false);
  const [ibError, setIbError] = useState<string | null>(null);
  const [activeIbConfigId, setActiveIbConfigId] = useState<number | null>(null);
  const [riskAnalyzerOpen, setRiskAnalyzerOpen] = useState(true);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // Risk Analytics States
  const [riskData, setRiskData] = useState<any | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [customJson, setCustomJson] = useState<string>("");
  const [showCustomJsonInput, setShowCustomJsonInput] = useState(false);
  const [customJsonActive, setCustomJsonActive] = useState(false);
  const [riskTab, setRiskTab] = useState<"factors" | "beta_delta" | "stress" | "committee">("factors");
  const [macroHeadline, setMacroHeadline] = useState<string | null>(null);
  const [macroSentimentScore, setMacroSentimentScore] = useState<number | null>(null);

  // Zustand Store selectors
  const activePositions = usePortfolioStore((state) => state.activePositions);
  const spotPrice = usePortfolioStore((state) => state.spotPrice);
  const volatility = usePortfolioStore((state) => state.volatility);
  const setSpotPrice = usePortfolioStore((state) => state.setSpotPrice);
  const setVolatility = usePortfolioStore((state) => state.setVolatility);
  const aiCommentary = usePortfolioStore((state) => state.aiCommentary);
  const setAiCommentary = usePortfolioStore((state) => state.setAiCommentary);

  // Mapped shocks for derived compatibility
  const spotShock = ((spotPrice - 180) / 180) * 100;
  const ivShock = ((volatility - 0.28) / 0.28) * 100;
  const debouncedSpotShock = spotShock;
  const debouncedIvShock = ivShock;

  // Reset shocks when view mode changes
  useEffect(() => {
    setSpotPrice(180.00);
    setVolatility(0.28);
  }, [viewMode, setSpotPrice, setVolatility]);

  // WebSocket event-driven communication
  useEffect(() => {
    if (!store.token || !store.isAuthenticated) return;
    
    // Connect to WebSocket gateway
    const ws = new WebSocket("ws://localhost:8000/ws/portfolio-analytics");
    
    ws.onopen = () => {
      console.log("WebSocket connected to portfolio-analytics");
      sendWebSocketPayload();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          console.error("WebSocket calculation error:", data.error);
          setRiskError(data.error);
        } else {
          setRiskData(data);
          setRiskError(null);
          
          if (data.debate_logs) {
            setDebateLogs(data.debate_logs);
          }
          if (data.advisory_report) {
            setAdvisoryReport(data.advisory_report);
          }
          if (data.summary_report) {
            setSummaryReport(data.summary_report);
          }
          if (data.recommendations) {
            setRecommendations(data.recommendations);
          }
          if (data.macro_headline) {
            setMacroHeadline(data.macro_headline);
          }
          if (data.macro_sentiment_score !== undefined) {
            setMacroSentimentScore(data.macro_sentiment_score);
          }
          
          if (data.greeks_commentary) {
            usePortfolioStore.getState().setAiCommentary(data.greeks_commentary);
          }
        }
      } catch (err) {
        console.error("Error parsing WebSocket JSON frame:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    const sendWebSocketPayload = () => {
      if (ws.readyState === WebSocket.OPEN) {
        const spotShockPct = ((spotPrice - 180) / 180) * 100;
        const ivShockPct = ((volatility - 0.28) / 0.28) * 100;

        let payload: any;
        if (customJsonActive) {
          try {
            payload = JSON.parse(customJson);
            payload.shock_scenario = {
              spot_shock_pct: spotShockPct,
              iv_shock_pct: ivShockPct
            };
          } catch (e) {
            console.error("Failed to parse custom JSON sandbox input for WebSocket", e);
            return;
          }
        } else {
          const activeData = viewMode === "local" ? portfolioData : ibPortfolioData;
          if (!activeData || !activeData.positions || activeData.positions.length === 0) {
            return;
          }

          const positions = activeData.positions.map((pos: any) => {
            const isOptionCombo = pos.legs && pos.legs.length > 0;
            if (isOptionCombo) {
              return {
                ticker: pos.underlying_symbol || pos.symbol,
                type: "OPTION_COMBINATION",
                strategy_name: pos.strategy || pos.name,
                size: pos.quantity || 1,
                underlying_beta_to_spx: pos.underlying_symbol === "TQQQ" ? 3.02 : (pos.underlying_symbol === "NVDA" ? 1.85 : 1.0),
                legs: pos.legs.map((leg: any) => {
                  const oType = (leg.option_type || "CALL").toUpperCase();
                  const action = (leg.action || "BUY").toUpperCase();
                  const pType = action === "BUY" ? "LONG" : "SHORT";
                  let deltaVal = leg.greeks?.delta !== undefined ? leg.greeks.delta : 0.50;
                  return {
                    strike: leg.strike_price,
                    type: oType,
                    expiration: leg.expiration_date || "2026-06-05",
                    position_type: pType,
                    delta: deltaVal,
                    premium: leg.entry_premium || leg.premium || 2.50
                  };
                })
              };
            } else {
              const sharesQty = pos.legs && pos.legs.length > 0 ? pos.legs[0].quantity : pos.quantity;
              const avgCost = pos.legs && pos.legs.length > 0 ? pos.legs[0].entry_premium : pos.entry_price;
              return {
                ticker: pos.underlying_symbol || pos.symbol,
                type: "EQUITY",
                size: sharesQty || 1,
                avg_price: avgCost || 100.0,
                current_price: pos.underlying_price || 100.0,
                underlying_beta_to_spx: pos.underlying_symbol === "NVDA" ? 1.85 : (pos.underlying_symbol === "MSFT" ? 1.25 : 1.0)
              };
            }
          });

          const summary = {
            net_liquidity: activeData.summary?.net_liquidation || activeData.summary?.total_current_value || 5000.0,
            excess_liquidity: activeData.summary?.buying_power || 3000.0,
            maintenance_margin: activeData.summary?.maint_margin_req || 3000.0,
            daily_pnl: activeData.summary?.total_pnl || 0.0
          };

          payload = {
            portfolio_summary: summary,
            positions: positions,
            shock_scenario: {
              spot_shock_pct: spotShockPct,
              iv_shock_pct: ivShockPct
            }
          };
        }

        ws.send(JSON.stringify(payload));
      }
    };

    const timer = setTimeout(() => {
      sendWebSocketPayload();
    }, 150);

    return () => {
      clearTimeout(timer);
      ws.close();
    };
  }, [activePositions, spotPrice, volatility, portfolioData, ibPortfolioData, viewMode, store.isAuthenticated, customJsonActive, customJson]);

  // AI Committee & Command Bar States
  const [commandQuery, setCommandQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<any>(null);
  const [activeFiltersMessage, setActiveFiltersMessage] = useState<string | null>(null);
  const [commandLoading, setCommandLoading] = useState(false);

  const [debateLogs, setDebateLogs] = useState<any[]>([]);
  const [advisoryReport, setAdvisoryReport] = useState("");
  const [summaryReport, setSummaryReport] = useState("");
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [debateLoading, setDebateLoading] = useState(false);
  const [debateError, setDebateError] = useState<string | null>(null);

  const [initialRiskSnapshot, setInitialRiskSnapshot] = useState<any>(null);
  const [stagedRecommendationId, setStagedRecommendationId] = useState<string | null>(null);
  const [orderExecutedMessage, setOrderExecutedMessage] = useState<string | null>(null);

  const getRiskPositionInfo = (ticker: string, strategyName?: string) => {
    if (!riskData || !riskData.positions) return null;
    return riskData.positions.find((p: any) => 
      p.ticker.toUpperCase() === ticker.toUpperCase() && 
      (p.strategy_name || "").replace(/\s/g, "").toUpperCase() === (strategyName || "").replace(/\s/g, "").toUpperCase()
    );
  };

  const getRiskLegInfo = (posRiskInfo: any, strike: number, type: string, expiration: string, positionType: string) => {
    if (!posRiskInfo || !posRiskInfo.legs) return null;
    const normExp = (e: string) => e.replace(/[-]/g, "");
    return posRiskInfo.legs.find((l: any) => 
      Math.abs(l.strike - strike) < 0.05 && 
      l.type.toUpperCase() === type.toUpperCase() && 
      normExp(l.expiration) === normExp(expiration) && 
      l.position_type.toUpperCase() === positionType.toUpperCase()
    );
  };

  const filterPosition = (pos: any) => {
    if (!activeFilters) return true;
    
    // Check ticker
    if (activeFilters.ticker) {
      const ticker = (pos.underlying_symbol || pos.symbol || "").toUpperCase();
      if (ticker !== activeFilters.ticker.toUpperCase()) return false;
    }
    
    // Check asset type
    if (activeFilters.asset_type) {
      const isOption = pos.legs && pos.legs.length > 0;
      if (activeFilters.asset_type === "OPTION" && !isOption) return false;
      if (activeFilters.asset_type === "EQUITY" && isOption) return false;
    }
    
    const riskInfo = getRiskPositionInfo(pos.underlying_symbol || pos.symbol, pos.strategy || pos.name);
    
    // Check early assignment risk
    if (activeFilters.early_assignment_risk) {
      const riskLevel = riskInfo?.early_assignment_risk || "Low";
      if (riskLevel.toLowerCase() !== activeFilters.early_assignment_risk.toLowerCase()) return false;
    }
    
    // Check position type (LONG or SHORT)
    if (activeFilters.position_type) {
      if (pos.legs && pos.legs.length > 0) {
        const hasMatchingLeg = pos.legs.some((l: any) => {
          const action = (l.action || "").toUpperCase();
          const pType = (action === "SELL" || action === "SHORT" || action === "SELL") ? "SHORT" : "LONG";
          return pType === activeFilters.position_type;
        });
        if (!hasMatchingLeg) return false;
      } else {
        const qty = pos.quantity || 0;
        const pType = qty >= 0 ? "LONG" : "SHORT";
        if (pType !== activeFilters.position_type) return false;
      }
    }
    
    // Check DTE
    if (activeFilters.expiration_days_lte !== undefined) {
      if (pos.legs && pos.legs.length > 0) {
        const hasMatchingDte = pos.legs.some((l: any) => {
          if (!l.expiration_date) return false;
          let expiryStr = l.expiration_date;
          if (expiryStr && expiryStr.length === 8 && !expiryStr.includes("-")) {
            expiryStr = `${expiryStr.substring(0, 4)}-${expiryStr.substring(4, 6)}-${expiryStr.substring(6, 8)}`;
          }
          const exp = new Date(expiryStr);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const diffTime = exp.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return !isNaN(diffDays) && diffDays <= activeFilters.expiration_days_lte;
        });
        if (!hasMatchingDte) return false;
      } else {
        return false;
      }
    }
    
    // Check factor concentration
    if (activeFilters.factor_high) {
      const factorName = activeFilters.factor_high.toLowerCase();
      if (riskData?.factor_exposure?.stock_factors) {
        const ticker = (pos.underlying_symbol || pos.symbol || "").toUpperCase();
        const factorEntry = riskData.factor_exposure.stock_factors.find((f: any) => f.ticker.toUpperCase() === ticker);
        if (factorEntry) {
          const val = factorEntry[factorName] || 0;
          if (val <= 0.1) return false;
        } else {
          return false;
        }
      } else {
        return false;
      }
    }
    
    return true;
  };

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandQuery.trim()) return;
    setCommandLoading(true);
    try {
      const res = await agentsApi.sendCommand(commandQuery, store.token);
      setActiveFilters(res.filters);
      setActiveFiltersMessage(res.message);
    } catch (err: any) {
      console.error("Command parsing failed", err);
      alert(err.message || "Failed to parse command");
    } finally {
      setCommandLoading(false);
    }
  };

  const runCommitteeReview = async () => {
    if (!store.token) return;
    setDebateLoading(true);
    setDebateError(null);
    try {
      const activeData = viewMode === "local" ? portfolioData : ibPortfolioData;
      if (!activeData || !activeData.positions || activeData.positions.length === 0) {
        setDebateError("No active positions to analyze. Please add positions first.");
        setDebateLoading(false);
        return;
      }

      const positions = activeData.positions.map((pos: any) => {
        const isOptionCombo = pos.legs && pos.legs.length > 0;
        if (isOptionCombo) {
          return {
            ticker: pos.underlying_symbol || pos.symbol,
            type: "OPTION_COMBINATION",
            strategy_name: pos.strategy || pos.name,
            size: pos.quantity || 1,
            underlying_beta_to_spx: pos.underlying_symbol === "TQQQ" ? 3.02 : (pos.underlying_symbol === "NVDA" ? 1.85 : 1.0),
            legs: pos.legs.map((leg: any) => {
              const oType = (leg.option_type || "CALL").toUpperCase();
              const action = (leg.action || "BUY").toUpperCase();
              const pType = action === "BUY" ? "LONG" : "SHORT";
              let deltaVal = leg.greeks?.delta !== undefined ? leg.greeks.delta : 0.50;
              return {
                strike: leg.strike_price,
                type: oType,
                expiration: leg.expiration_date || "2026-06-05",
                position_type: pType,
                delta: deltaVal,
                premium: leg.entry_premium || leg.premium || 2.50
              };
            })
          };
        } else {
          const sharesQty = pos.legs && pos.legs.length > 0 ? pos.legs[0].quantity : pos.quantity;
          const avgCost = pos.legs && pos.legs.length > 0 ? pos.legs[0].entry_premium : pos.entry_price;
          return {
            ticker: pos.underlying_symbol || pos.symbol,
            type: "EQUITY",
            size: sharesQty || 1,
            avg_price: avgCost || 100.0,
            current_price: pos.underlying_price || 100.0,
            underlying_beta_to_spx: pos.underlying_symbol === "NVDA" ? 1.85 : (pos.underlying_symbol === "MSFT" ? 1.25 : 1.0)
          };
        }
      });

      const summary = {
        net_liquidity: activeData.summary?.net_liquidation || activeData.summary?.total_current_value || 5000.0,
        excess_liquidity: activeData.summary?.buying_power || 3000.0,
        maintenance_margin: activeData.summary?.maint_margin_req || 3000.0,
        daily_pnl: activeData.summary?.total_pnl || 0.0
      };

      const payload = {
        portfolio_summary: summary,
        positions: positions
      };

      const res = await agentsApi.getDebate(payload, store.token);
      setDebateLogs(res.debate_logs || []);
      setAdvisoryReport(res.advisory_report || "");
      setSummaryReport(res.summary_report || "");
      setRecommendations(res.recommendations || []);
    } catch (err: any) {
      console.error("Committee review failed", err);
      setDebateError(err.message || "Failed to execute multi-agent committee debate.");
    } finally {
      setDebateLoading(false);
    }
  };

  const handleStageRecommendation = (rec: any) => {
    try {
      let baseline: any;
      if (customJsonActive && customJson.trim()) {
        baseline = JSON.parse(customJson);
      } else {
        const activeData = viewMode === "local" ? portfolioData : ibPortfolioData;
        if (!activeData || !activeData.positions) {
          alert("No active portfolio to stage recommendation onto.");
          return;
        }
        const positions = activeData.positions.map((pos: any) => {
          const isOptionCombo = pos.legs && pos.legs.length > 0;
          if (isOptionCombo) {
            return {
              ticker: pos.underlying_symbol || pos.symbol,
              type: "OPTION_COMBINATION",
              strategy_name: pos.strategy || pos.name,
              size: pos.quantity || 1,
              underlying_beta_to_spx: pos.underlying_symbol === "TQQQ" ? 3.02 : (pos.underlying_symbol === "NVDA" ? 1.85 : 1.0),
              legs: pos.legs.map((leg: any) => {
                const oType = (leg.option_type || "CALL").toUpperCase();
                const action = (leg.action || "BUY").toUpperCase();
                const pType = action === "BUY" ? "LONG" : "SHORT";
                let deltaVal = leg.greeks?.delta !== undefined ? leg.greeks.delta : 0.50;
                return {
                  strike: leg.strike_price,
                  type: oType,
                  expiration: leg.expiration_date || "2026-06-05",
                  position_type: pType,
                  delta: deltaVal,
                  premium: leg.entry_premium || leg.premium || 2.50
                };
              })
            };
          } else {
            const sharesQty = pos.legs && pos.legs.length > 0 ? pos.legs[0].quantity : pos.quantity;
            const avgCost = pos.legs && pos.legs.length > 0 ? pos.legs[0].entry_premium : pos.entry_price;
            return {
              ticker: pos.underlying_symbol || pos.symbol,
              type: "EQUITY",
              size: sharesQty || 1,
              avg_price: avgCost || 100.0,
              current_price: pos.underlying_price || 100.0,
              underlying_beta_to_spx: pos.underlying_symbol === "NVDA" ? 1.85 : (pos.underlying_symbol === "MSFT" ? 1.25 : 1.0)
            };
          }
        });

        const summary = {
          net_liquidity: activeData.summary?.net_liquidation || activeData.summary?.total_current_value || 5000.0,
          excess_liquidity: activeData.summary?.buying_power || 3000.0,
          maintenance_margin: activeData.summary?.maint_margin_req || 3000.0,
          daily_pnl: activeData.summary?.total_pnl || 0.0
        };

        baseline = {
          portfolio_summary: summary,
          positions: positions
        };
      }

      const staged = JSON.parse(JSON.stringify(baseline));
      const draft = rec.trade_draft;
      
      let found = false;
      for (let i = 0; i < staged.positions.length; i++) {
        const pos = staged.positions[i];
        if (pos.ticker.toUpperCase() === draft.ticker.toUpperCase() && pos.type === draft.type) {
          if (pos.type === "OPTION_COMBINATION") {
            pos.size += draft.size;
            if (pos.size <= 0) {
              staged.positions.splice(i, 1);
            }
            found = true;
            break;
          } else if (pos.type === "EQUITY") {
            pos.size += draft.size;
            if (pos.size <= 0) {
              staged.positions.splice(i, 1);
            }
            found = true;
            break;
          }
        }
      }

      if (!found) {
        staged.positions.push(draft);
      }

      const stagedStr = JSON.stringify(staged, null, 2);
      setCustomJson(stagedStr);
      setCustomJsonActive(true);
      setShowCustomJsonInput(true);
      
      fetchRiskAnalytics(staged);
      setInitialRiskSnapshot(riskData);
      setStagedRecommendationId(rec.id);
      
      alert(`Staged recommendation '${rec.description}' in Sandbox! Scroll to the Sandbox to check the pre-trade impact.`);
    } catch (e: any) {
      alert("Failed to stage recommendation: " + e.message);
    }
  };

  const handleApproveRecommendation = async (rec: any) => {
    try {
      setOrderExecutedMessage(`Routing order for ${rec.ticker}...`);
      if (viewMode === "local" && store.token) {
        const targetPos = portfolioData?.positions.find(p => p.underlying_symbol.toUpperCase() === rec.ticker.toUpperCase());
        if (targetPos) {
          if (rec.action === "TRIM" || rec.action === "CLOSE") {
            const draft = rec.trade_draft;
            const newQty = targetPos.quantity + draft.size;
            if (newQty <= 0) {
              await portfolioApi.deletePosition(store.token, targetPos.id);
            } else {
              await portfolioApi.deletePosition(store.token, targetPos.id);
              if (newQty > 0) {
                await portfolioApi.savePosition(
                  store.token,
                  targetPos.name,
                  targetPos.underlying_symbol,
                  targetPos.entry_price,
                  newQty,
                  targetPos.legs.map((l: any) => ({
                    optionType: l.option_type,
                    action: l.action,
                    strikePrice: l.strike_price,
                    expirationDate: l.expiration_date,
                    quantity: l.quantity,
                    premium: l.entry_premium
                  }))
                );
              }
            }
          } else {
            const draft = rec.trade_draft;
            await portfolioApi.savePosition(
              store.token,
              `${draft.ticker} ${rec.action} Hedge`,
              draft.ticker,
              draft.current_price || draft.avg_price || 100.0,
              draft.size,
              draft.legs?.map((l: any) => ({
                optionType: l.type,
                action: l.position_type === "LONG" ? "BUY" : "SELL",
                strikePrice: l.strike,
                expirationDate: l.expiration,
                quantity: draft.size,
                premium: 2.50
              })) || []
            );
          }
        } else {
          const draft = rec.trade_draft;
          await portfolioApi.savePosition(
            store.token,
            `${draft.ticker} ${rec.action} Adjust`,
            draft.ticker,
            draft.current_price || draft.avg_price || 100.0,
            draft.size,
            draft.legs?.map((l: any) => ({
              optionType: l.type,
              action: l.position_type === "LONG" ? "BUY" : "SELL",
              strikePrice: l.strike,
              expirationDate: l.expiration,
              quantity: draft.size,
              premium: 2.50
            })) || []
          );
        }
      }
      
      setTimeout(async () => {
        setOrderExecutedMessage(`Successfully executed trade adjustment: ${rec.description}. Portfolio state re-synced!`);
        await fetchAllData();
        setInitialRiskSnapshot(null);
        setStagedRecommendationId(null);
      }, 1000);
      
    } catch (err: any) {
      alert("Execution failed: " + err.message);
      setOrderExecutedMessage(null);
    }
  };

  const handleApproveAllRecommendations = async () => {
    if (recommendations.length === 0) return;
    setOrderExecutedMessage("Executing all staged investment recommendations...");
    try {
      for (const rec of recommendations) {
        if (viewMode === "local" && store.token) {
          const targetPos = portfolioData?.positions.find(p => p.underlying_symbol.toUpperCase() === rec.ticker.toUpperCase());
          if (targetPos) {
            if (rec.action === "TRIM" || rec.action === "CLOSE") {
              const draft = rec.trade_draft;
              const newQty = targetPos.quantity + draft.size;
              if (newQty <= 0) {
                await portfolioApi.deletePosition(store.token, targetPos.id);
              } else {
                await portfolioApi.deletePosition(store.token, targetPos.id);
                if (newQty > 0) {
                  await portfolioApi.savePosition(
                    store.token,
                    targetPos.name,
                    targetPos.underlying_symbol,
                    targetPos.entry_price,
                    newQty,
                    targetPos.legs.map((l: any) => ({
                      optionType: l.option_type,
                      action: l.action,
                      strikePrice: l.strike_price,
                      expirationDate: l.expiration_date,
                      quantity: l.quantity,
                      premium: l.entry_premium
                    }))
                  );
                }
              }
            } else {
              const draft = rec.trade_draft;
              await portfolioApi.savePosition(
                store.token,
                `${draft.ticker} ${rec.action} Hedge`,
                draft.ticker,
                draft.current_price || draft.avg_price || 100.0,
                draft.size,
                draft.legs?.map((l: any) => ({
                  optionType: l.type,
                  action: l.position_type === "LONG" ? "BUY" : "SELL",
                  strikePrice: l.strike,
                  expirationDate: l.expiration,
                  quantity: draft.size,
                  premium: 2.50
                })) || []
              );
            }
          } else {
            const draft = rec.trade_draft;
            await portfolioApi.savePosition(
              store.token,
              `${draft.ticker} ${rec.action} Adjust`,
              draft.ticker,
              draft.current_price || draft.avg_price || 100.0,
              draft.size,
              draft.legs?.map((l: any) => ({
                optionType: l.type,
                action: l.position_type === "LONG" ? "BUY" : "SELL",
                strikePrice: l.strike,
                expirationDate: l.expiration,
                quantity: draft.size,
                premium: 2.50
              })) || []
            );
          }
        }
      }
      
      setTimeout(async () => {
        setOrderExecutedMessage("All staged recommendations successfully approved and executed! Portfolio state re-synced.");
        await fetchAllData();
        setInitialRiskSnapshot(null);
        setStagedRecommendationId(null);
      }, 1500);
      
    } catch (err: any) {
      alert("Approve All failed: " + err.message);
      setOrderExecutedMessage(null);
    }
  };

  useEffect(() => {
    if (riskTab === "committee" && debateLogs.length === 0 && !debateLoading && store.isAuthenticated) {
      runCommitteeReview();
    }
  }, [riskTab, store.isAuthenticated]);

  // Example scenario pre-population
  useEffect(() => {
    const examplePayload = {
      portfolio_summary: {
        net_liquidity: 5400.00,
        excess_liquidity: 3000.00,
        maintenance_margin: 3000.00,
        daily_pnl: -162.00
      },
      positions: [
        {
          ticker: "TQQQ",
          type: "OPTION_COMBINATION",
          strategy_name: "Jun05 75/70 Bull Put",
          size: 1,
          underlying_beta_to_spx: 3.02,
          legs: [
            {strike: 75.0, type: "PUT", expiration: "2026-06-05", position_type: "SHORT", delta: -0.42},
            {strike: 70.0, type: "PUT", expiration: "2026-06-05", position_type: "LONG", delta: 0.21}
          ]
        },
        {
          ticker: "NVDA",
          type: "EQUITY",
          size: 4,
          avg_price: 218.57,
          current_price: 223.86,
          underlying_beta_to_spx: 1.85
        }
      ]
    };
    setCustomJson(JSON.stringify(examplePayload, null, 2));
  }, []);

  const fetchRiskAnalytics = async (customPayload?: any) => {
    if (!store.token) return;
    setRiskLoading(true);
    setRiskError(null);
    try {
      let payload = customPayload;
      if (!payload) {
        // Build payload dynamically from current active portfolio
        const activeData = viewMode === "local" ? portfolioData : ibPortfolioData;
        if (!activeData || !activeData.positions || activeData.positions.length === 0) {
          setRiskData(null);
          setRiskLoading(false);
          return;
        }

        const positions = activeData.positions.map((pos: any) => {
          const isOptionCombo = pos.legs && pos.legs.length > 0;
          if (isOptionCombo) {
            return {
              ticker: pos.underlying_symbol || pos.symbol,
              type: "OPTION_COMBINATION",
              strategy_name: pos.strategy || pos.name,
              size: pos.quantity || 1,
              underlying_beta_to_spx: pos.underlying_symbol === "TQQQ" ? 3.02 : (pos.underlying_symbol === "NVDA" ? 1.85 : 1.0),
              legs: pos.legs.map((leg: any) => {
                const oType = (leg.option_type || "CALL").toUpperCase();
                const action = (leg.action || "BUY").toUpperCase();
                const pType = action === "BUY" ? "LONG" : "SHORT";
                let deltaVal = leg.greeks?.delta !== undefined ? leg.greeks.delta : 0.50;
                return {
                  strike: leg.strike_price,
                  type: oType,
                  expiration: leg.expiration_date || "2026-06-05",
                  position_type: pType,
                  delta: deltaVal,
                  premium: leg.entry_premium || leg.premium || 2.50
                };
              })
            };
          } else {
            // Equity position
            const sharesQty = pos.legs && pos.legs.length > 0 ? pos.legs[0].quantity : pos.quantity;
            const avgCost = pos.legs && pos.legs.length > 0 ? pos.legs[0].entry_premium : pos.entry_price;
            return {
              ticker: pos.underlying_symbol || pos.symbol,
              type: "EQUITY",
              size: sharesQty || 1,
              avg_price: avgCost || 100.0,
              current_price: pos.underlying_price || 100.0,
              underlying_beta_to_spx: pos.underlying_symbol === "NVDA" ? 1.85 : (pos.underlying_symbol === "MSFT" ? 1.25 : 1.0)
            };
          }
        });

        const summary = {
          net_liquidity: activeData.summary?.net_liquidation || activeData.summary?.total_current_value || 5000.0,
          excess_liquidity: activeData.summary?.buying_power || 3000.0,
          maintenance_margin: activeData.summary?.maint_margin_req || 3000.0,
          daily_pnl: activeData.summary?.total_pnl || 0.0
        };

        payload = {
          portfolio_summary: summary,
          positions: positions,
          shock_scenario: {
            spot_shock_pct: debouncedSpotShock,
            iv_shock_pct: debouncedIvShock
          }
        };
      }

      const res = await riskApi.analyzePortfolio(payload, store.token);
      setRiskData(res);
    } catch (err: any) {
      console.error("Failed to fetch risk analytics", err);
      setRiskError(err.message || "Failed to calculate institutional risk metrics.");
    } finally {
      setRiskLoading(false);
    }
  };

  // Trigger risk analysis dynamically with a 150ms debounce when real portfolio details load,
  // view mode switches, or spot/IV shocks change.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (store.isAuthenticated) {
        if (customJsonActive) {
          try {
            const parsed = JSON.parse(customJson);
            parsed.shock_scenario = {
              spot_shock_pct: debouncedSpotShock,
              iv_shock_pct: debouncedIvShock
            };
            fetchRiskAnalytics(parsed);
          } catch (e) {
            console.error("Failed to parse custom JSON sandbox input", e);
          }
        } else {
          fetchRiskAnalytics();
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [debouncedSpotShock, debouncedIvShock, portfolioData, ibPortfolioData, viewMode, store.isAuthenticated, customJsonActive]);

  const handleSubmitCustomJson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customJson.trim()) return;
    try {
      const parsed = JSON.parse(customJson);
      if (!parsed.portfolio_summary || !parsed.positions) {
        alert("Invalid format: JSON must contain 'portfolio_summary' and 'positions' fields.");
        return;
      }
      parsed.shock_scenario = {
        spot_shock_pct: debouncedSpotShock,
        iv_shock_pct: debouncedIvShock
      };
      setCustomJsonActive(true);
      await fetchRiskAnalytics(parsed);
    } catch (err: any) {
      alert("Invalid JSON format: " + err.message);
    }
  };

  const handleResetToRealPortfolio = () => {
    setCustomJsonActive(false);
    fetchRiskAnalytics();
  };


  // Local Portfolio Sorting & Grouping
  const [localSortField, setLocalSortField] = useState<"name" | "value" | "pnl" | "pnlPercent" | "quantity">("name");
  const [localSortDirection, setLocalSortDirection] = useState<"asc" | "desc">("asc");
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({
    Stocks: false,
    Options: false,
    Currencies: false,
  });

  // IB Portfolio Sorting & Grouping
  const [ibSortField, setIbSortField] = useState<"name" | "value" | "pnl" | "pnlPercent" | "quantity">("name");
  const [ibSortDirection, setIbSortDirection] = useState<"asc" | "desc">("asc");
  const [collapsedIbCategories, setCollapsedIbCategories] = useState<Record<string, boolean>>({
    Stocks: false,
    Options: false,
    Currencies: false,
  });

  // Fetch portfolio, watchlist, and notes
  const fetchAllData = async () => {
    if (!store.token) return;
    setIsLoading(true);
    setError(null);
    try {
      // 1. Fetch Portfolio
      const portData = await portfolioApi.getPortfolio(store.token);
      setPortfolioData(portData);

      // Sync local positions to usePortfolioStore
      if (portData && portData.positions) {
        const mappedPositions = portData.positions.flatMap((pos: any) => 
          (pos.legs || []).map((leg: any) => ({
            id: String(leg.id),
            symbol: pos.underlying_symbol || pos.symbol || "",
            strike: leg.strike_price,
            expiration: leg.expiration_date,
            type: leg.option_type as "CALL" | "PUT",
            quantity: leg.quantity,
            action: leg.action as "BUY" | "SELL"
          }))
        );
        usePortfolioStore.getState().setActivePositions(mappedPositions);
      }
      
      // 2. Fetch Watchlist
      const wlData = await portfolioApi.getWatchlist(store.token);
      setWatchlist(wlData);
      
      // 3. Fetch Notes
      if (activeNoteSymbol) {
        const notesData = await portfolioApi.getNotes(store.token, activeNoteSymbol);
        setNotes(notesData);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load portfolio data");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchIbPortfolio = async (configId: number) => {
    if (!store.token) return;
    setIbLoading(true);
    setIbError(null);
    try {
      const res = await ibApi.getIbPortfolio(configId, store.token);
      setIbPortfolioData(res);

      // Sync IB positions to usePortfolioStore
      if (res && res.positions) {
        const mappedPositions = res.positions.flatMap((pos: any) => 
          (pos.legs || []).map((leg: any) => ({
            id: String(leg.id || Math.random().toString()),
            symbol: pos.underlying_symbol || pos.symbol || "",
            strike: leg.strike_price,
            expiration: leg.expiration_date,
            type: leg.option_type as "CALL" | "PUT",
            quantity: leg.quantity,
            action: leg.action as "BUY" | "SELL"
          }))
        );
        usePortfolioStore.getState().setActivePositions(mappedPositions);
      }
    } catch (err: any) {
      console.error("Failed to load IB portfolio data", err);
      setIbError(err.message || "Failed to load live Interactive Brokers data. Please check if TWS or IB Gateway is running locally on the configured port.");
    } finally {
      setIbLoading(false);
    }
  };

  const handleRefreshIb = () => {
    if (activeIbConfigId) {
      fetchIbPortfolio(activeIbConfigId);
    }
  };

  const handleSnapshotIb = async () => {
    console.log("handleSnapshotIb clicked! activeIbConfigId:", activeIbConfigId, "token:", store.token ? "PRESENT" : "MISSING");
    if (!activeIbConfigId || !store.token) {
      console.warn("Snapshot cancelled because activeIbConfigId or token is missing!");
      return;
    }
    
    setSnapshotLoading(true);
    try {
      console.log("Calling snapshotIbPortfolio API with current page data...");
      const positionsToSend = ibPortfolioData?.positions?.map((pos: any) => ({
        name: pos.name,
        underlying_symbol: pos.underlying_symbol,
        entry_price: pos.entry_price || 0.0,
        quantity: pos.quantity || 1,
        legs: pos.legs?.map((leg: any) => ({
          sec_type: leg.sec_type || "OPT",
          option_type: leg.option_type || "",
          action: leg.action,
          strike_price: leg.strike_price,
          expiration_date: leg.expiration_date || "",
          quantity: leg.quantity,
          premium: leg.entry_premium
        })) || []
      })) || [];

      const netLiquidation = ibPortfolioData?.summary?.NetLiquidation?.value 
        ? parseFloat(ibPortfolioData.summary.NetLiquidation.value) 
        : undefined;
      const totalCashValue = ibPortfolioData?.summary?.TotalCashValue?.value
        ? parseFloat(ibPortfolioData.summary.TotalCashValue.value)
        : undefined;
      const buyingPower = ibPortfolioData?.summary?.BuyingPower?.value
        ? parseFloat(ibPortfolioData.summary.BuyingPower.value)
        : undefined;
      const maintMarginReq = ibPortfolioData?.summary?.MaintMarginReq?.value
        ? parseFloat(ibPortfolioData.summary.MaintMarginReq.value)
        : undefined;

      const res = await portfolioApi.snapshotIbPortfolio(
        activeIbConfigId,
        store.token,
        positionsToSend,
        netLiquidation,
        totalCashValue,
        buyingPower,
        maintMarginReq
      );
      console.log("API response received:", res);
      // Refresh local portfolio data first
      await fetchAllData();
      // Switch view mode to local to see the results immediately
      setViewMode("local");
      // Show confirmation alert to user
      alert(`Snapshot captured successfully! Imported ${res.positions_imported || 0} position(s).`);
    } catch (err: any) {
      console.error("Failed to capture IB snapshot", err);
      alert(err.message || "Failed to capture IB portfolio snapshot.");
    } finally {
      setSnapshotLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    if (store.isAuthenticated) {
      const storedActiveId = localStorage.getItem("active_ib_config_id");
      if (storedActiveId) {
        const configId = Number(storedActiveId);
        setActiveIbConfigId(configId);
        setViewMode("ib");
        fetchIbPortfolio(configId);
      } else {
        setActiveIbConfigId(null);
        setViewMode("local");
      }
      fetchAllData();
    }
  }, [store.isAuthenticated, store.token, activeNoteSymbol]);

  // Toggle position expansion
  const toggleExpand = (id: number) => {
    setExpandedPositions(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const toggleCategory = (category: string) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const getPositionCategory = (pos: Position) => {
    const sym = pos.underlying_symbol.toUpperCase();
    if (sym.includes("/") || (sym.includes(".") && (sym.includes("USD") || sym.includes("EUR") || sym.includes("JPY") || sym.includes("GBP") || sym.includes("CAD") || sym.includes("AUD") || sym.includes("CHF")))) {
      return "Currencies";
    }
    if (pos.legs && pos.legs.length > 0) {
      const hasOptions = pos.legs.some((l: any) => l.sec_type === "OPT" || (l.sec_type !== "STK" && l.option_type));
      if (hasOptions) return "Options";
    }
    return "Stocks";
  };

  const getSortedPositions = (positions: Position[]) => {
    const sorted = [...positions];
    sorted.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (localSortField === "name") {
        valA = (a.name || "").toLowerCase();
        valB = (b.name || "").toLowerCase();
      } else if (localSortField === "value") {
        valA = a.current_value || 0;
        valB = b.current_value || 0;
      } else if (localSortField === "pnl") {
        valA = a.total_pnl || 0;
        valB = b.total_pnl || 0;
      } else if (localSortField === "pnlPercent") {
        valA = a.total_pnl_percent || 0;
        valB = b.total_pnl_percent || 0;
      } else if (localSortField === "quantity") {
        valA = a.quantity || 0;
        valB = b.quantity || 0;
      }

      if (valA < valB) return localSortDirection === "asc" ? -1 : 1;
      if (valA > valB) return localSortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  };

  const groupedLocalPositions = React.useMemo(() => {
    if (!portfolioData?.positions) return { Stocks: [], Options: [], Currencies: [] };

    const sorted = getSortedPositions(portfolioData.positions);
    const filtered = sorted.filter(filterPosition);
    const groups: { Stocks: Position[]; Options: Position[]; Currencies: Position[] } = {
      Stocks: [],
      Options: [],
      Currencies: [],
    };

    filtered.forEach(pos => {
      const category = getPositionCategory(pos);
      if (category === "Currencies") {
        groups.Currencies.push(pos);
      } else if (category === "Options") {
        groups.Options.push(pos);
      } else {
        groups.Stocks.push(pos);
      }
    });

    return groups;
  }, [portfolioData?.positions, localSortField, localSortDirection, activeFilters, riskData]);

  const handleIbSort = (field: typeof ibSortField) => {
    if (ibSortField === field) {
      setIbSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setIbSortField(field);
      setIbSortDirection("asc");
    }
  };

  const getSortedIbPositions = (positions: any[]) => {
    if (!positions) return [];
    const sorted = [...positions];
    sorted.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (ibSortField === "name") {
        valA = (a.name || "").toLowerCase();
        valB = (b.name || "").toLowerCase();
      } else if (ibSortField === "value") {
        valA = a.current_value || 0;
        valB = b.current_value || 0;
      } else if (ibSortField === "pnl") {
        valA = a.total_pnl || 0;
        valB = b.total_pnl || 0;
      } else if (ibSortField === "pnlPercent") {
        valA = a.total_pnl_percent || 0;
        valB = b.total_pnl_percent || 0;
      } else if (ibSortField === "quantity") {
        valA = a.quantity || 0;
        valB = b.quantity || 0;
      } else {
        valA = (a.name || "").toLowerCase();
        valB = (b.name || "").toLowerCase();
      }

      if (valA < valB) return ibSortDirection === "asc" ? -1 : 1;
      if (valA > valB) return ibSortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  };

  const groupedIbPositions = React.useMemo(() => {
    if (!ibPortfolioData?.positions) return { Stocks: [], Options: [], Currencies: [] };

    const sorted = getSortedIbPositions(ibPortfolioData.positions);
    const filtered = sorted.filter(filterPosition);
    const groups: { Stocks: Position[]; Options: Position[]; Currencies: Position[] } = {
      Stocks: [],
      Options: [],
      Currencies: [],
    };

    filtered.forEach(pos => {
      const category = getPositionCategory(pos);
      if (category === "Currencies") {
        groups.Currencies.push(pos);
      } else if (category === "Options") {
        groups.Options.push(pos);
      } else {
        groups.Stocks.push(pos);
      }
    });

    return groups;
  }, [ibPortfolioData?.positions, ibSortField, ibSortDirection, activeFilters, riskData]);

  const toggleIbCategory = (category: string) => {
    setCollapsedIbCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Close portfolio position
  const handleClosePosition = async (id: number) => {
    if (!store.token) return;
    if (!confirm("Are you sure you want to close this position?")) return;
    try {
      await portfolioApi.deletePosition(store.token, id);
      // Refresh
      fetchAllData();
    } catch (err: any) {
      alert(err.message || "Failed to close position");
    }
  };

  // Analyze open position in Builder page
  const handleAnalyzeInBuilder = (pos: Position) => {
    // Clear current builder strategy
    store.clearStrategy();
    
    // Set matching ticker metadata in store
    store.setUnderlyingSymbol(pos.underlying_symbol);
    store.setUnderlyingPrice(pos.underlying_price);

    // Map portfolio legs back to builder leg specs
    pos.legs.forEach(leg => {
      // Calculate days to expiration
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let expiryStr = leg.expiration_date;
      if (expiryStr && expiryStr.length === 8 && !expiryStr.includes("-")) {
        expiryStr = `${expiryStr.substring(0, 4)}-${expiryStr.substring(4, 6)}-${expiryStr.substring(6, 8)}`;
      }
      
      const exp = new Date(expiryStr);
      let diffTime = exp.getTime() - today.getTime();
      let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (isNaN(diffDays)) {
        diffDays = 30; // fallback standard
      }
      
      store.addLeg({
        optionType: leg.option_type as "CALL" | "PUT",
        action: leg.action as "BUY" | "SELL",
        strikePrice: leg.strike_price,
        expirationDate: expiryStr,
        daysToExpiration: Math.max(0, diffDays),
        quantity: leg.quantity,
        premium: leg.entry_premium
      });
    });

    // Navigate to builder
    startTransition(() => {
      router.push("/build");
    });
  };

  // Watchlist Actions
  const handleAddWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store.token || !newWatchlistSymbol.trim()) return;
    try {
      await portfolioApi.addWatchlist(store.token, newWatchlistSymbol.trim());
      setNewWatchlistSymbol("");
      // Refresh watchlist
      const wlData = await portfolioApi.getWatchlist(store.token);
      setWatchlist(wlData);
    } catch (err: any) {
      alert(err.message || "Failed to add to watchlist");
    }
  };

  const handleRemoveWatchlist = async (symbol: string) => {
    if (!store.token) return;
    try {
      await portfolioApi.deleteWatchlist(store.token, symbol);
      // Refresh watchlist
      const wlData = await portfolioApi.getWatchlist(store.token);
      setWatchlist(wlData);
    } catch (err: any) {
      alert(err.message || "Failed to remove from watchlist");
    }
  };

  // Journal Notes Actions
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store.token || !newNoteText.trim() || !activeNoteSymbol) return;
    try {
      await portfolioApi.addNote(store.token, activeNoteSymbol, newNoteText.trim());
      setNewNoteText("");
      // Refresh notes
      const notesData = await portfolioApi.getNotes(store.token, activeNoteSymbol);
      setNotes(notesData);
    } catch (err: any) {
      alert(err.message || "Failed to add journal entry");
    }
  };

  // Helper to get deterministic mock ticker price
  const getWatchlistPrice = (sym: string) => {
    const prices: Record<string, number> = {
      "AAPL": 185.50, "TSLA": 178.20, "MSFT": 422.30, "SPY": 512.40, 
      "QQQ": 438.10, "NVDA": 875.12, "AMD": 160.45, "AMZN": 185.20
    };
    return prices[sym.toUpperCase()] || 120.45;
  };

  const getNormalizedPositions = (): NormalizedPosition[] => {
    if (viewMode === "local") {
      if (!portfolioData?.positions) return [];
      return portfolioData.positions.map(pos => ({
        symbol: pos.underlying_symbol,
        type: "Local Strategy",
        spotPrice: pos.underlying_price,
        quantity: pos.quantity,
        marketValue: pos.current_value,
        delta: pos.greeks.delta,
        gamma: pos.greeks.gamma,
        theta: pos.greeks.theta,
        vega: pos.greeks.vega
      }));
    } else {
      if (!ibPortfolioData?.positions) return [];
      return ibPortfolioData.positions.map((pos: any) => ({
        symbol: pos.underlying_symbol,
        type: pos.strategy,
        spotPrice: pos.underlying_price,
        quantity: pos.quantity,
        marketValue: pos.current_value,
        delta: pos.greeks?.delta || 0.0,
        gamma: pos.greeks?.gamma || 0.0,
        theta: pos.greeks?.theta || 0.0,
        vega: pos.greeks?.vega || 0.0
      }));
    }
  };

  const normalizedPositions = getNormalizedPositions();
  const stressTestData = calculateStressTest(normalizedPositions);
  const assetBreakdown = getAssetBreakdown(normalizedPositions);
  const activeGreeks = viewMode === "local" ? portfolioData?.summary?.greeks : ibPortfolioData?.summary?.greeks;

  return (
    <div className="min-h-screen bg-bg-main text-slate-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">
        {!mounted ? (
          <div className="flex-1 flex flex-col items-center justify-center py-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          </div>
        ) : !store.isAuthenticated ? (
          /* Locked State for Unauthenticated Users */
          <div className="max-w-xl mx-auto text-center py-20 relative">
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none"></div>

            <div className="p-5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400 inline-block mb-6 shadow-xl shadow-indigo-500/5">
              <Lock className="h-10 w-10 animate-bounce" />
            </div>

            <h1 className="text-3xl font-black tracking-tight mb-3 text-white">
              Unlock Your <span className="bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">Portfolio Dashboard</span>
            </h1>
            
            <p className="text-slate-400 text-sm max-w-md mx-auto mb-8 leading-relaxed font-medium">
              Track open options positions, analyze portfolio-wide Greeks (Delta, Gamma, Theta, Vega), record trade logs, and review asset sector allocation in real time.
            </p>

            <div className="p-6 bg-bg-panel border border-border-panel rounded-2xl shadow-xl space-y-4 max-w-sm mx-auto text-left">
              <h3 className="font-bold text-sm text-text-main">Access Portfolio</h3>
              <p className="text-xs text-text-sub">Please log in or sign up via the top navigation bar to access portfolio management features.</p>
              
              <button
                onClick={() => {
                  // Direct user to Navbar login by giving tips
                  alert("Please click the 'Log In' button in the top right of the navigation bar to sign in!");
                }}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-1.5 transition"
              >
                Sign In To Unlock <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* Authenticated Dashboard layout */
          <div className="space-y-6">
            {/* Command Bar Component */}
            <div className="w-full">
              <div className="relative bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl shadow-xl flex items-center p-1.5 focus-within:border-indigo-500/50 transition duration-300">
                <div className="pl-3.5 pr-2 flex items-center">
                  <Sparkles className="h-4 w-4 text-indigo-400" />
                </div>
                <form onSubmit={handleCommandSubmit} className="flex-1 flex items-center">
                  <input
                    type="text"
                    value={commandQuery}
                    onChange={(e) => setCommandQuery(e.target.value)}
                    className="w-full bg-transparent text-slate-100 placeholder-slate-400 text-xs py-2 focus:outline-none focus:ring-0 border-none"
                    placeholder='Query portfolio... e.g., "Show me all short positions expiring in under 14 days" or "Filter out assets with high factor exposure to Momentum"'
                  />
                  {commandQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setCommandQuery("");
                        setActiveFilters(null);
                        setActiveFiltersMessage(null);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-200 transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={commandLoading}
                    className="ml-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider transition flex items-center gap-1.5"
                  >
                    {commandLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Run"}
                  </button>
                </form>
              </div>
              
              {/* Active Filters Badge */}
              {activeFilters && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Active Filters:</span>
                  <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-xl text-[10px] font-bold">
                    <span>{activeFiltersMessage || "Filters Applied"}</span>
                    <button
                      onClick={() => {
                        setCommandQuery("");
                        setActiveFilters(null);
                        setActiveFiltersMessage(null);
                      }}
                      className="text-indigo-400 hover:text-indigo-200 ml-1 transition"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Main Content: Positions & Summary (8 Cols) */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              
              {/* Tab Selector */}
              <div className="flex bg-slate-950 border border-slate-900 p-1.5 rounded-2xl max-w-md">
                <button
                  onClick={() => setViewMode("local")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
                    viewMode === "local"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Local Saved Portfolio
                </button>
                <button
                  onClick={() => {
                    setViewMode("ib");
                    if (activeIbConfigId) {
                      fetchIbPortfolio(activeIbConfigId);
                    }
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
                    viewMode === "ib"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Interactive Brokers Live
                  {activeIbConfigId && !ibError ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                  )}
                </button>
              </div>

              {viewMode === "local" ? (
                <>
                  {/* Summary Cards Grid */}
                  {portfolioData && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {portfolioData.summary.net_liquidation !== undefined && portfolioData.summary.net_liquidation > 0 ? (
                        <>
                          <div className="bg-bg-panel border border-border-panel p-4 rounded-2xl shadow-lg">
                            <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Net Liquidation</span>
                            <p className="text-xl font-extrabold text-white mt-1 font-mono">
                              ${(riskData?.portfolio_summary?.net_liquidity ?? portfolioData.summary.net_liquidation).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div className="bg-bg-panel border border-border-panel p-4 rounded-2xl shadow-lg">
                            <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Total Cash Value</span>
                            <p className="text-xl font-extrabold text-white mt-1 font-mono">
                              ${portfolioData.summary.total_cash_value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "$0.00"}
                            </p>
                          </div>
                          <div className="bg-bg-panel border border-border-panel p-4 rounded-2xl shadow-lg">
                            <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Buying Power</span>
                            <p className="text-xl font-extrabold text-white mt-1 font-mono">
                              ${(riskData?.portfolio_summary?.excess_liquidity ?? portfolioData.summary.buying_power)?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "$0.00"}
                            </p>
                          </div>
                          <div className="bg-bg-panel border border-border-panel p-4 rounded-2xl shadow-lg">
                            <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Maint Margin Req</span>
                            <p className="text-xl font-extrabold text-white mt-1 font-mono">
                              ${(riskData?.portfolio_summary?.maintenance_margin ?? portfolioData.summary.maint_margin_req)?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "$0.00"}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="bg-bg-panel border border-border-panel p-4 rounded-2xl shadow-lg">
                            <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Current Net Value</span>
                            <p className="text-xl font-extrabold text-white mt-1 font-mono">
                              ${portfolioData.summary.total_current_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                          
                          <div className="bg-bg-panel border border-border-panel p-4 rounded-2xl shadow-lg">
                            <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Total Entry Cost</span>
                            <p className="text-sm font-bold text-text-sub mt-2 font-mono">
                              ${portfolioData.summary.total_entry_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                          
                          <div className="bg-bg-panel border border-border-panel p-4 rounded-2xl shadow-lg">
                            <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Total P&L</span>
                            <div className="flex items-baseline gap-1.5 mt-1 font-mono">
                              <span className={`text-xl font-extrabold ${portfolioData.summary.total_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                ${portfolioData.summary.total_pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className={`text-[10px] font-bold ${portfolioData.summary.total_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                ({portfolioData.summary.total_pnl_percent >= 0 ? "+" : ""}{portfolioData.summary.total_pnl_percent.toFixed(1)}%)
                              </span>
                            </div>
                          </div>

                          <div className="bg-bg-panel border border-border-panel p-4 rounded-2xl shadow-lg">
                            <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Daily P&L</span>
                            <div className="flex items-baseline gap-1.5 mt-1 font-mono">
                              <span className={`text-sm font-bold ${portfolioData.summary.total_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                ${(portfolioData.summary.total_pnl * 0.12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-[9px] text-text-muted">Est</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Portfolio Greeks Panel */}
                  {portfolioData && (
                    <div className="bg-slate-950 border border-slate-900 p-4 rounded-2xl shadow-md space-y-3">
                      <h3 className="text-xs font-bold text-text-main flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-indigo-400" />
                        Portfolio aggregated Greeks
                      </h3>
                      <div className="grid grid-cols-5 gap-2 text-center text-xs">
                        <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-800/80">
                          <span className="text-[9px] text-text-muted block font-bold">Delta (Δ)</span>
                          <span className={`font-mono font-bold ${portfolioData.summary.greeks.delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {portfolioData.summary.greeks.delta.toFixed(2)}
                          </span>
                        </div>
                        <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-800/80">
                          <span className="text-[9px] text-text-muted block font-bold">Gamma (Γ)</span>
                          <span className={`font-mono font-bold ${portfolioData.summary.greeks.gamma >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {portfolioData.summary.greeks.gamma.toFixed(3)}
                          </span>
                        </div>
                        <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-800/80">
                          <span className="text-[9px] text-text-muted block font-bold">Theta (Θ)</span>
                          <span className={`font-mono font-bold ${portfolioData.summary.greeks.theta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {portfolioData.summary.greeks.theta.toFixed(2)}
                          </span>
                        </div>
                        <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-800/80">
                          <span className="text-[9px] text-text-muted block font-bold">Vega (ν)</span>
                          <span className={`font-mono font-bold ${portfolioData.summary.greeks.vega >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {portfolioData.summary.greeks.vega.toFixed(2)}
                          </span>
                        </div>
                        <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-800/80">
                          <span className="text-[9px] text-text-muted block font-bold">Rho (ρ)</span>
                          <span className={`font-mono font-bold ${portfolioData.summary.greeks.rho >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {portfolioData.summary.greeks.rho.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Risk & Performance Commentary Panel */}
                  {aiCommentary && (
                    <div className="bg-slate-950 border border-slate-900 p-4 rounded-2xl shadow-md space-y-3">
                      <h3 className="text-xs font-bold text-text-main flex items-center gap-1.5 border-b border-slate-900 pb-2">
                        <Sparkles className="h-4 w-4 text-indigo-400" />
                        AI Risk & Performance Commentary
                      </h3>
                      <div className="text-text-sub text-xs leading-relaxed max-h-[300px] overflow-y-auto pr-1">
                        {aiCommentary.split("\n").map((line: string, idx: number) => {
                          if (line.startsWith("# ")) {
                            return <h2 key={idx} className="text-sm font-extrabold text-white mt-4 border-b border-slate-900 pb-1">{line.replace("# ", "")}</h2>;
                          } else if (line.startsWith("## ")) {
                            return <h3 key={idx} className="text-xs font-bold text-white mt-3">{line.replace("## ", "")}</h3>;
                          } else if (line.startsWith("### ")) {
                            return <h4 key={idx} className="text-xs font-bold text-slate-300 mt-2">{line.replace("### ", "")}</h4>;
                          } else if (line.startsWith("* ") || line.startsWith("- ")) {
                            return <li key={idx} className="ml-4 list-disc pl-1 text-[11px] font-medium">{line.substring(2)}</li>;
                          } else if (line.trim() === "---") {
                            return <hr key={idx} className="border-slate-900 my-2" />;
                          } else if (line.trim().length > 0) {
                            return <p key={idx} className="text-[11px] font-medium text-text-sub leading-normal mt-1">{line}</p>;
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  )}

                  {/* Positions List */}
                  <div className="bg-bg-panel border border-border-panel p-5 rounded-2xl shadow-xl flex-1 flex flex-col gap-4">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                      <h2 className="font-bold text-sm text-text-main flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-indigo-400" />
                        Open Positions
                      </h2>
                      <span className="text-[10px] bg-slate-900 px-2.5 py-1 border border-slate-800 text-text-sub font-mono rounded-lg">
                        {portfolioData?.positions.length || 0} active
                      </span>
                    </div>

                    {/* Sort & Filtering Controls for Local Positions */}
                    {portfolioData?.positions && portfolioData.positions.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/30 border border-slate-900 p-3 rounded-xl text-xs text-text-sub mb-2">
                        <div className="flex items-center gap-2">
                          <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-400" />
                          <span className="font-semibold">Sort By:</span>
                          <select
                            value={localSortField}
                            onChange={(e) => setLocalSortField(e.target.value as any)}
                            className="bg-slate-950 border border-slate-800 text-text-main rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer font-medium"
                          >
                            <option value="name">Name / Contract</option>
                            <option value="value">Valuation</option>
                            <option value="pnl">Total P&L ($)</option>
                            <option value="pnlPercent">Total P&L (%)</option>
                            <option value="quantity">Quantity</option>
                          </select>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setLocalSortDirection(prev => prev === "asc" ? "desc" : "asc")}
                            className="p-1 px-2.5 bg-slate-950 border border-slate-800 hover:bg-slate-805 text-indigo-400 font-bold rounded-lg transition flex items-center gap-1 text-[11px]"
                          >
                            {localSortDirection === "asc" ? (
                              <>Ascending <ChevronUp className="h-3.5 w-3.5" /></>
                            ) : (
                              <>Descending <ChevronDown className="h-3.5 w-3.5" /></>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {isLoading ? (
                      <div className="flex-1 flex flex-col items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
                        <p className="text-[10px] text-text-muted font-bold mt-2 uppercase">Syncing Portfolio...</p>
                      </div>
                    ) : portfolioData?.positions && portfolioData.positions.length > 0 ? (
                      <div className="space-y-6">
                        {Object.entries(groupedLocalPositions).map(([category, posList]) => {
                          if (posList.length === 0) return null;
                          const isCollapsed = collapsedCategories[category];
                          
                          return (
                            <div key={category} className="space-y-3">
                              {/* Collapsible Section Header */}
                              <div 
                                onClick={() => toggleCategory(category)}
                                className="flex justify-between items-center cursor-pointer select-none bg-slate-950/60 hover:bg-slate-950 border border-slate-900 p-3 rounded-xl transition duration-150"
                              >
                                <h3 className="font-bold text-xs text-text-main flex items-center gap-2 uppercase tracking-wider">
                                  <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                                  {category}
                                  <span className="text-[10px] text-text-muted lowercase tracking-normal font-normal">
                                    ({posList.length} position{posList.length !== 1 ? "s" : ""})
                                  </span>
                                </h3>
                                <div className="text-text-muted pr-1">
                                  {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                                </div>
                              </div>
                              
                              {/* Section Body */}
                              {!isCollapsed && (
                                <div className="space-y-4 pl-1">
                                  {posList.map((pos) => {
                                    const isExpanded = !!expandedPositions[pos.id];
                                    const isStock = pos.legs.length === 0 || pos.legs.every((l: any) => l.sec_type === "STK");
                                    
                                    return (
                                      <div 
                                        key={pos.id} 
                                        className="bg-slate-900/40 border border-slate-900 hover:border-slate-800 rounded-xl overflow-hidden transition"
                                      >
                                        {/* Summary Row */}
                                        <div 
                                          onClick={() => toggleExpand(pos.id)}
                                          className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 cursor-pointer select-none"
                                        >
                                          <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400 text-xs font-black">
                                              {pos.underlying_symbol}
                                            </div>
                                            <div>
                                              <h4 className="font-bold text-xs text-white flex items-center gap-1.5 flex-wrap">
                                                {pos.name}
                                                <span className="text-[9px] text-text-muted font-mono font-medium">x{pos.quantity}</span>
                                                {pos.strategy && (
                                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                                    pos.strategy.includes("Custom") 
                                                      ? "bg-slate-800 text-slate-400 border border-slate-700" 
                                                      : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                                                  }`}>
                                                    {pos.strategy}
                                                  </span>
                                                )}
                                                {(() => {
                                                  const riskPos = getRiskPositionInfo(pos.underlying_symbol, pos.strategy || pos.name);
                                                  if (!riskPos) return null;
                                                  const days = riskPos.days_to_liquidate;
                                                  return (
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                                      days > 3.0 
                                                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse" 
                                                        : "bg-slate-800/80 text-slate-400 border-slate-700"
                                                    }`}>
                                                      {days.toFixed(1)}d Liquidation
                                                    </span>
                                                  );
                                                })()}
                                              </h4>
                                              <p className="text-[10px] text-text-muted mt-0.5">Spot Price: ${pos.underlying_price.toFixed(2)}</p>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                                            <div className="text-right">
                                              <span className="text-[9px] text-text-muted uppercase block font-bold">Valuation</span>
                                              <span className="font-bold text-xs text-text-main font-mono">${pos.current_value.toFixed(2)}</span>
                                            </div>
                                            
                                            <div className="text-right">
                                              <span className="text-[9px] text-text-muted uppercase block font-bold">Total P&L</span>
                                              <span className={`font-bold text-xs font-mono ${pos.total_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                {pos.total_pnl >= 0 ? "+" : ""}{pos.total_pnl.toFixed(2)} ({pos.total_pnl_percent.toFixed(1)}%)
                                              </span>
                                            </div>

                                            <div className="text-text-muted pl-2">
                                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Expanded Leg Details Panel */}
                                        {isExpanded && (
                                          <div className="bg-slate-950/70 border-t border-slate-900 p-4 space-y-4">
                                            {isStock ? (
                                              <div className="p-4 bg-slate-900/40 border border-slate-900/80 rounded-xl space-y-2 text-xs">
                                                <p className="text-text-sub font-medium flex items-center gap-1.5">
                                                  <Info className="h-4 w-4 text-indigo-400 shrink-0" />
                                                  This is a Stock position.
                                                </p>
                                                <div className="grid grid-cols-4 gap-4 text-[11px] pt-1">
                                                  <div>
                                                    <span className="text-text-muted block uppercase text-[8px] font-bold">Avg Entry Price</span>
                                                    <span className="font-mono text-white font-semibold">
                                                      ${(pos.legs && pos.legs.length > 0 ? pos.legs[0].entry_premium : pos.entry_price).toFixed(2)}
                                                    </span>
                                                  </div>
                                                  <div>
                                                    <span className="text-text-muted block uppercase text-[8px] font-bold">Current Market Price</span>
                                                    <span className="font-mono text-white font-semibold">${pos.underlying_price.toFixed(2)}</span>
                                                  </div>
                                                  <div>
                                                    <span className="text-text-muted block uppercase text-[8px] font-bold">Position Size</span>
                                                    <span className="font-mono text-white font-semibold">
                                                      {pos.legs && pos.legs.length > 0 ? pos.legs[0].quantity : pos.quantity} shares
                                                    </span>
                                                  </div>
                                                  <div>
                                                    <span className="text-text-muted block uppercase text-[8px] font-bold">Days to Liquidate</span>
                                                    {(() => {
                                                      const riskPos = getRiskPositionInfo(pos.underlying_symbol, pos.strategy || pos.name);
                                                      const days = riskPos?.days_to_liquidate || 0;
                                                      return (
                                                        <span className={`font-mono font-bold text-xs ${
                                                          days > 3.0 ? "text-rose-400 bg-rose-950/30 px-1.5 py-0.5 rounded border border-rose-900/40" : "text-white"
                                                        }`}>
                                                          {days.toFixed(2)} days
                                                        </span>
                                                      );
                                                    })()}
                                                  </div>
                                                </div>
                                              </div>
                                            ) : (
                                              <>
                                                <div className="overflow-x-auto">
                                                  <table className="w-full text-left border-collapse text-[11px]">
                                                    <thead>
                                                      <tr className="border-b border-slate-900 text-text-muted uppercase tracking-wider text-[9px] font-bold">
                                                        <th className="pb-2">Leg</th>
                                                        <th className="pb-2">Action</th>
                                                        <th className="pb-2">Assignment Risk</th>
                                                        <th className="pb-2">Strike</th>
                                                        <th className="pb-2">Expiration</th>
                                                        <th className="pb-2 text-right">Avg Cost</th>
                                                        <th className="pb-2 text-right">Current</th>
                                                        <th className="pb-2 text-right">Qty</th>
                                                        <th className="pb-2 text-right">Delta</th>
                                                        <th className="pb-2 text-right">Gamma</th>
                                                        <th className="pb-2 text-right">Theta</th>
                                                        <th className="pb-2 text-right">Vega</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-900/60 font-mono">
                                                      {pos.legs.map((leg) => (
                                                        <tr key={leg.id} className="text-text-sub">
                                                          <td className="py-2.5 font-bold text-white text-[10px]">{leg.sec_type === "STK" ? "STOCK" : leg.option_type}</td>
                                                          <td className="py-2.5">
                                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                                              leg.action === "BUY" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                                                            }`}>
                                                              {leg.action}
                                                            </span>
                                                          </td>
                                                          <td className="py-2.5">
                                                            {(() => {
                                                              const posRisk = getRiskPositionInfo(pos.underlying_symbol, pos.strategy || pos.name);
                                                              const legRisk = posRisk ? getRiskLegInfo(posRisk, leg.strike_price, leg.option_type, leg.expiration_date, leg.action === "BUY" ? "LONG" : "SHORT") : null;
                                                              const riskVal = legRisk?.early_assignment_risk || "Low";
                                                              if (leg.action === "SELL") {
                                                                return (
                                                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                                                    riskVal === "Critical" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse font-extrabold" :
                                                                    riskVal === "Medium" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                                                                    "bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20"
                                                                  }`}>
                                                                    {riskVal}
                                                                  </span>
                                                                );
                                                              }
                                                              return <span className="text-text-muted text-[10px]">-</span>;
                                                            })()}
                                                          </td>
                                                          <td className="py-2.5">{leg.sec_type === "STK" ? "-" : `$${leg.strike_price.toFixed(1)}`}</td>
                                                          <td className="py-2.5">{leg.sec_type === "STK" ? "-" : leg.expiration_date}</td>
                                                          <td className="py-2.5 text-right">${leg.entry_premium.toFixed(2)}</td>
                                                          <td className="py-2.5 text-right text-text-main font-semibold">${leg.current_price.toFixed(2)}</td>
                                                          <td className="py-2.5 text-right text-text-muted">x{leg.quantity}</td>
                                                          <td className="py-2.5 text-right text-emerald-400/80">{leg.greeks?.delta !== undefined ? leg.greeks.delta.toFixed(2) : "-"}</td>
                                                          <td className="py-2.5 text-right text-indigo-400/80">{leg.greeks?.gamma !== undefined ? leg.greeks.gamma.toFixed(3) : "-"}</td>
                                                          <td className="py-2.5 text-right text-rose-400/80">{leg.greeks?.theta !== undefined ? leg.greeks.theta.toFixed(2) : "-"}</td>
                                                          <td className="py-2.5 text-right text-teal-400/80">{leg.greeks?.vega !== undefined ? leg.greeks.vega.toFixed(2) : "-"}</td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                </div>

                                                {/* Position Level Greeks */}
                                                <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] bg-slate-900/50 p-2.5 rounded-xl border border-slate-900/80">
                                                  <div>
                                                    <span className="text-text-muted block uppercase text-[8px] font-bold">Delta</span>
                                                    <span className="font-bold text-text-sub font-mono">{pos.greeks.delta.toFixed(2)}</span>
                                                  </div>
                                                  <div>
                                                    <span className="text-text-muted block uppercase text-[8px] font-bold">Gamma</span>
                                                    <span className="font-bold text-text-sub font-mono">{pos.greeks.gamma.toFixed(3)}</span>
                                                  </div>
                                                  <div>
                                                    <span className="text-text-muted block uppercase text-[8px] font-bold">Theta</span>
                                                    <span className="font-bold text-text-sub font-mono">{pos.greeks.theta.toFixed(2)}</span>
                                                  </div>
                                                  <div>
                                                    <span className="text-text-muted block uppercase text-[8px] font-bold">Vega</span>
                                                    <span className="font-bold text-text-sub font-mono">{pos.greeks.vega.toFixed(2)}</span>
                                                  </div>
                                                  <div>
                                                    <span className="text-text-muted block uppercase text-[8px] font-bold">Rho</span>
                                                    <span className="font-bold text-text-sub font-mono">{pos.greeks.rho.toFixed(2)}</span>
                                                  </div>
                                                </div>
                                              </>
                                            )}

                                            {/* Collapse controls */}
                                            <div className="flex gap-2.5 justify-end">
                                              {pos.legs.length > 0 && (
                                                <button
                                                  onClick={() => handleAnalyzeInBuilder(pos)}
                                                  disabled={isPending}
                                                  className="px-3 py-1.5 bg-indigo-600/10 border border-indigo-500/20 hover:bg-indigo-600/20 text-indigo-400 font-semibold text-[10px] rounded-lg transition uppercase tracking-wider disabled:opacity-50"
                                                >
                                                  {isPending ? "Loading..." : "Analyze in Builder"}
                                                </button>
                                              )}
                                              <button
                                                onClick={() => handleClosePosition(pos.id)}
                                                className="px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-400 font-semibold text-[10px] rounded-lg transition uppercase tracking-wider flex items-center gap-1"
                                              >
                                                <Trash2 className="h-3 w-3" /> Close Position
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center py-16 border border-dashed border-slate-900 rounded-xl space-y-3">
                        <Layers className="h-8 w-8 text-text-muted animate-pulse" />
                        <div>
                          <p className="text-xs font-bold text-white">No active portfolio positions</p>
                          <p className="text-[10px] text-text-sub mt-0.5">Build a options strategy and click "Save to Portfolio" to track it here.</p>
                        </div>
                        <button
                          onClick={() => router.push("/build")}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition"
                        >
                          Go to Builder
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Interactive Brokers Live View */}
                  {!activeIbConfigId ? (
                    <div className="bg-bg-panel border border-border-panel p-8 rounded-2xl shadow-xl text-center space-y-4 max-w-lg mx-auto mt-6">
                      <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl inline-block shadow-md">
                        <Server className="h-8 w-8" />
                      </div>
                      <h3 className="font-bold text-lg text-white">No Active IB Connection</h3>
                      <p className="text-xs text-text-sub max-w-sm mx-auto leading-relaxed">
                        Configure and test an Interactive Brokers connection under **Settings** to leverage real-time cash balance, margin requirements, and open positions.
                      </p>
                      <button
                        onClick={() => router.push("/settings")}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition inline-flex items-center gap-1.5"
                      >
                        Go to Settings <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : ibError ? (
                    <div className="bg-rose-500/10 border border-rose-500/20 p-6 rounded-2xl shadow-lg space-y-3">
                      <div className="flex items-center gap-2 text-rose-400">
                        <AlertCircle className="h-5 w-5" />
                        <h4 className="font-bold text-sm">IB Connection Failed</h4>
                      </div>
                      <p className="text-xs text-rose-200/80 leading-relaxed">
                        {ibError}
                      </p>
                      <div className="pt-2 flex gap-3">
                        <button
                          onClick={handleRefreshIb}
                          className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Retry Sync
                        </button>
                        <button
                          onClick={() => router.push("/settings")}
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-bold text-xs rounded-xl transition"
                        >
                          Verify Settings
                        </button>
                      </div>
                    </div>
                  ) : ibLoading ? (
                    <div className="bg-bg-panel border border-border-panel p-20 rounded-2xl shadow-xl flex flex-col items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                      <p className="text-xs text-text-muted mt-4 font-bold uppercase tracking-wider">Syncing Live IB Portfolio...</p>
                    </div>
                  ) : (
                    <>
                      {/* Summary Cards Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-bg-panel border border-border-panel p-4 rounded-2xl shadow-lg">
                          <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Net Liquidation</span>
                          <p className="text-xl font-extrabold text-white mt-1 font-mono">
                            {(() => {
                              if (riskData?.portfolio_summary?.net_liquidity !== undefined) {
                                return `$${riskData.portfolio_summary.net_liquidity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                              }
                              if (!ibPortfolioData?.summary?.NetLiquidation) return "$0.00";
                              const val = parseFloat(ibPortfolioData.summary.NetLiquidation.value);
                              return isNaN(val) ? ibPortfolioData.summary.NetLiquidation.value : `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            })()}
                          </p>
                        </div>
                        
                        <div className="bg-bg-panel border border-border-panel p-4 rounded-2xl shadow-lg">
                          <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Total Cash Value</span>
                          <p className="text-xl font-extrabold text-white mt-1 font-mono">
                            {(() => {
                              if (!ibPortfolioData?.summary?.TotalCashValue) return "$0.00";
                              const val = parseFloat(ibPortfolioData.summary.TotalCashValue.value);
                              return isNaN(val) ? ibPortfolioData.summary.TotalCashValue.value : `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            })()}
                          </p>
                        </div>
                        
                        <div className="bg-bg-panel border border-border-panel p-4 rounded-2xl shadow-lg">
                          <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Buying Power</span>
                          <p className="text-xl font-extrabold text-white mt-1 font-mono">
                            {(() => {
                              if (riskData?.portfolio_summary?.excess_liquidity !== undefined) {
                                return `$${riskData.portfolio_summary.excess_liquidity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                              }
                              if (!ibPortfolioData?.summary?.BuyingPower) return "$0.00";
                              const val = parseFloat(ibPortfolioData.summary.BuyingPower.value);
                              return isNaN(val) ? ibPortfolioData.summary.BuyingPower.value : `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            })()}
                          </p>
                        </div>
                        
                        <div className="bg-bg-panel border border-border-panel p-4 rounded-2xl shadow-lg">
                          <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Maint Margin Req</span>
                          <p className="text-xl font-extrabold text-white mt-1 font-mono">
                            {(() => {
                              if (riskData?.portfolio_summary?.maintenance_margin !== undefined) {
                                return `$${riskData.portfolio_summary.maintenance_margin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                              }
                              if (!ibPortfolioData?.summary?.MaintMarginReq) return "$0.00";
                              const val = parseFloat(ibPortfolioData.summary.MaintMarginReq.value);
                              return isNaN(val) ? ibPortfolioData.summary.MaintMarginReq.value : `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            })()}
                          </p>
                        </div>
                      </div>

                      {/* Positions List */}
                      <div className="bg-bg-panel border border-border-panel p-5 rounded-2xl shadow-xl flex-1 flex flex-col gap-4">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                          <h2 className="font-bold text-sm text-text-main flex items-center gap-2">
                            <Briefcase className="h-4 w-4 text-indigo-400" />
                            IB Live Positions
                          </h2>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={handleRefreshIb}
                              className="p-1 px-2.5 bg-slate-900 border border-slate-800 text-[10px] hover:bg-slate-800 text-indigo-400 font-bold rounded-lg transition flex items-center gap-1"
                              title="Sync live data from IB"
                            >
                              <RefreshCw className="h-3 w-3" /> Sync Live
                            </button>
                            <button
                              onClick={handleSnapshotIb}
                              disabled={snapshotLoading}
                              className="p-1 px-2.5 bg-indigo-600/20 border border-indigo-500/30 text-[10px] hover:bg-indigo-600/30 text-indigo-400 font-bold rounded-lg transition flex items-center gap-1 disabled:opacity-50"
                              title="Take snapshot and save to Local Portfolio"
                            >
                              {snapshotLoading ? (
                                <>
                                  <RefreshCw className="h-3 w-3 animate-spin" /> Snapshotting...
                                </>
                              ) : (
                                <>
                                  <Camera className="h-3 w-3" /> Snapshot to Local
                                </>
                              )}
                            </button>
                            <span className="text-[10px] bg-slate-900 px-2.5 py-1 border border-slate-800 text-text-sub font-mono rounded-lg">
                              {ibPortfolioData?.positions?.length || 0} active
                            </span>
                          </div>
                        </div>

                        {/* Sort & Filtering Controls for IB Live Positions */}
                        {ibPortfolioData?.positions && ibPortfolioData.positions.length > 0 && (
                          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/30 border border-slate-900 p-3 rounded-xl text-xs text-text-sub mb-2">
                            <div className="flex items-center gap-2">
                              <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-400" />
                              <span className="font-semibold">Sort By:</span>
                              <select
                                value={ibSortField}
                                onChange={(e) => setIbSortField(e.target.value as any)}
                                className="bg-slate-950 border border-slate-800 text-text-main rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer font-medium"
                              >
                                <option value="name">Name / Contract</option>
                                <option value="value">Valuation</option>
                                <option value="pnl">Total P&L ($)</option>
                                <option value="pnlPercent">Total P&L (%)</option>
                                <option value="quantity">Quantity</option>
                              </select>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setIbSortDirection(prev => prev === "asc" ? "desc" : "asc")}
                                className="p-1 px-2.5 bg-slate-950 border border-slate-800 hover:bg-slate-805 text-indigo-400 font-bold rounded-lg transition flex items-center gap-1 text-[11px]"
                              >
                                {ibSortDirection === "asc" ? (
                                  <>Ascending <ChevronUp className="h-3.5 w-3.5" /></>
                                ) : (
                                  <>Descending <ChevronDown className="h-3.5 w-3.5" /></>
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                        {ibLoading ? (
                          <div className="flex-1 flex flex-col items-center justify-center py-20">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
                            <p className="text-[10px] text-text-muted font-bold mt-2 uppercase">Syncing Live Portfolio...</p>
                          </div>
                        ) : ibPortfolioData?.positions && ibPortfolioData.positions.length > 0 ? (
                          <div className="space-y-6">
                            {Object.entries(groupedIbPositions).map(([category, posList]) => {
                              if (posList.length === 0) return null;
                              const isCollapsed = collapsedIbCategories[category];
                              
                              return (
                                <div key={category} className="space-y-3">
                                  {/* Collapsible Section Header */}
                                  <div 
                                    onClick={() => toggleIbCategory(category)}
                                    className="flex justify-between items-center cursor-pointer select-none bg-slate-950/60 hover:bg-slate-950 border border-slate-900 p-3 rounded-xl transition duration-150"
                                  >
                                    <h3 className="font-bold text-xs text-text-main flex items-center gap-2 uppercase tracking-wider">
                                      <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                                      {category}
                                      <span className="text-[10px] text-text-muted lowercase tracking-normal font-normal">
                                        ({posList.length} position{posList.length !== 1 ? "s" : ""})
                                      </span>
                                    </h3>
                                    <div className="text-text-muted pr-1">
                                      {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                                    </div>
                                  </div>
                                  
                                  {/* Section Body */}
                                  {!isCollapsed && (
                                    <div className="space-y-4 pl-1">
                                      {posList.map((pos) => {
                                        const isExpanded = !!expandedPositions[pos.id + 10000]; // offset to avoid collision with local ids
                                        const isStock = pos.legs.length === 0 || pos.legs.every((l: any) => l.sec_type === "STK");
                                        
                                        return (
                                          <div 
                                            key={pos.id} 
                                            className="bg-slate-900/40 border border-slate-900 hover:border-slate-800 rounded-xl overflow-hidden transition"
                                          >
                                            {/* Summary Row */}
                                            <div 
                                              onClick={() => toggleExpand(pos.id + 10000)}
                                              className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 cursor-pointer select-none"
                                            >
                                              <div className="flex items-center gap-3">
                                                <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400 text-xs font-black">
                                                  {pos.underlying_symbol}
                                                </div>
                                                <div>
                                                  <h4 className="font-bold text-xs text-white flex items-center gap-1.5 flex-wrap">
                                                    {pos.name}
                                                    <span className="text-[9px] text-text-muted font-mono font-medium">x{pos.quantity}</span>
                                                    {pos.strategy && (
                                                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                                        pos.strategy.includes("Custom") 
                                                          ? "bg-slate-800 text-slate-400 border border-slate-700" 
                                                          : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                                                      }`}>
                                                        {pos.strategy}
                                                      </span>
                                                    )}
                                                    {(() => {
                                                      const riskPos = getRiskPositionInfo(pos.underlying_symbol, pos.strategy || pos.name);
                                                      if (!riskPos) return null;
                                                      const days = riskPos.days_to_liquidate;
                                                      return (
                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                                          days > 3.0 
                                                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse" 
                                                            : "bg-slate-800/80 text-slate-400 border-slate-700"
                                                        }`}>
                                                          {days.toFixed(1)}d Liquidation
                                                        </span>
                                                      );
                                                    })()}
                                                  </h4>
                                                  <p className="text-[10px] text-text-muted mt-0.5">Spot Price: ${pos.underlying_price.toFixed(2)}</p>
                                                </div>
                                              </div>

                                              <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                                                <div className="text-right">
                                                  <span className="text-[9px] text-text-muted uppercase block font-bold">Valuation</span>
                                                  <span className="font-bold text-xs text-text-main font-mono">${pos.current_value.toFixed(2)}</span>
                                                </div>
                                                
                                                <div className="text-right">
                                                  <span className="text-[9px] text-text-muted uppercase block font-bold">Total P&L</span>
                                                  <span className={`font-bold text-xs font-mono ${pos.total_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                    {pos.total_pnl >= 0 ? "+" : ""}{pos.total_pnl.toFixed(2)} ({pos.total_pnl_percent.toFixed(1)}%)
                                                  </span>
                                                </div>

                                                <div className="text-text-muted pl-2">
                                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                </div>
                                              </div>
                                            </div>

                                            {/* Expanded Leg Details Panel */}
                                            {isExpanded && (
                                              <div className="bg-slate-950/70 border-t border-slate-900 p-4 space-y-4">
                                                {isStock ? (
                                                  <div className="p-4 bg-slate-900/40 border border-slate-900/80 rounded-xl space-y-2 text-xs">
                                                    <p className="text-text-sub font-medium flex items-center gap-1.5">
                                                      <Info className="h-4 w-4 text-indigo-400 shrink-0" />
                                                      This is a Stock position.
                                                    </p>
                                                    <div className="grid grid-cols-4 gap-4 text-[11px] pt-1">
                                                      <div>
                                                        <span className="text-text-muted block uppercase text-[8px] font-bold">Avg Entry Price</span>
                                                        <span className="font-mono text-white font-semibold">
                                                          ${(pos.legs && pos.legs.length > 0 ? pos.legs[0].entry_premium : pos.entry_price).toFixed(2)}
                                                        </span>
                                                      </div>
                                                      <div>
                                                        <span className="text-text-muted block uppercase text-[8px] font-bold">Current Market Price</span>
                                                        <span className="font-mono text-white font-semibold">${pos.underlying_price.toFixed(2)}</span>
                                                      </div>
                                                      <div>
                                                        <span className="text-text-muted block uppercase text-[8px] font-bold">Position Size</span>
                                                        <span className="font-mono text-white font-semibold">
                                                          {pos.legs && pos.legs.length > 0 ? pos.legs[0].quantity : pos.quantity} shares
                                                        </span>
                                                      </div>
                                                      <div>
                                                        <span className="text-text-muted block uppercase text-[8px] font-bold">Days to Liquidate</span>
                                                        {(() => {
                                                          const riskPos = getRiskPositionInfo(pos.underlying_symbol, pos.strategy || pos.name);
                                                          const days = riskPos?.days_to_liquidate || 0;
                                                          return (
                                                            <span className={`font-mono font-bold text-xs ${
                                                              days > 3.0 ? "text-rose-400 bg-rose-950/30 px-1.5 py-0.5 rounded border border-rose-900/40" : "text-white"
                                                            }`}>
                                                              {days.toFixed(2)} days
                                                            </span>
                                                          );
                                                        })()}
                                                      </div>
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <>
                                                    <div className="overflow-x-auto">
                                                      <table className="w-full text-left border-collapse text-[11px]">
                                                        <thead>
                                                          <tr className="border-b border-slate-900 text-text-muted uppercase tracking-wider text-[9px] font-bold">
                                                            <th className="pb-2">Leg</th>
                                                            <th className="pb-2">Action</th>
                                                            <th className="pb-2">Assignment Risk</th>
                                                            <th className="pb-2">Strike</th>
                                                            <th className="pb-2">Expiration</th>
                                                            <th className="pb-2 text-right">Avg Cost</th>
                                                            <th className="pb-2 text-right">Current</th>
                                                            <th className="pb-2 text-right">Qty</th>
                                                            <th className="pb-2 text-right">Delta</th>
                                                            <th className="pb-2 text-right">Gamma</th>
                                                            <th className="pb-2 text-right">Theta</th>
                                                            <th className="pb-2 text-right">Vega</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-900/60 font-mono">
                                                          {pos.legs.map((leg: any) => (
                                                            <tr key={leg.id} className="text-text-sub">
                                                              <td className="py-2.5 font-bold text-white text-[10px]">{leg.sec_type === "STK" ? "STOCK" : leg.option_type}</td>
                                                              <td className="py-2.5">
                                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                                                  leg.action === "BUY" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                                                                }`}>
                                                                  {leg.action}
                                                                </span>
                                                              </td>
                                                              <td className="py-2.5">
                                                                {(() => {
                                                                  const posRisk = getRiskPositionInfo(pos.underlying_symbol, pos.strategy || pos.name);
                                                                  const legRisk = posRisk ? getRiskLegInfo(posRisk, leg.strike_price, leg.option_type, leg.expiration_date, leg.action === "BUY" ? "LONG" : "SHORT") : null;
                                                                  const riskVal = legRisk?.early_assignment_risk || "Low";
                                                                  if (leg.action === "SELL") {
                                                                    return (
                                                                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                                                        riskVal === "Critical" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse font-extrabold" :
                                                                        riskVal === "Medium" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                                                                        "bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20"
                                                                      }`}>
                                                                        {riskVal}
                                                                      </span>
                                                                    );
                                                                  }
                                                                  return <span className="text-text-muted text-[10px]">-</span>;
                                                                })()}
                                                              </td>
                                                              <td className="py-2.5">{leg.sec_type === "STK" ? "-" : `$${leg.strike_price.toFixed(1)}`}</td>
                                                              <td className="py-2.5">{leg.sec_type === "STK" ? "-" : leg.expiration_date}</td>
                                                              <td className="py-2.5 text-right">${leg.entry_premium.toFixed(2)}</td>
                                                              <td className="py-2.5 text-right text-text-main font-semibold">${leg.current_price.toFixed(2)}</td>
                                                              <td className="py-2.5 text-right text-text-muted">x{leg.quantity}</td>
                                                              <td className="py-2.5 text-right text-emerald-400/80">{leg.greeks?.delta !== undefined ? leg.greeks.delta.toFixed(2) : "-"}</td>
                                                              <td className="py-2.5 text-right text-indigo-400/80">{leg.greeks?.gamma !== undefined ? leg.greeks.gamma.toFixed(3) : "-"}</td>
                                                              <td className="py-2.5 text-right text-rose-400/80">{leg.greeks?.theta !== undefined ? leg.greeks.theta.toFixed(2) : "-"}</td>
                                                              <td className="py-2.5 text-right text-teal-400/80">{leg.greeks?.vega !== undefined ? leg.greeks.vega.toFixed(2) : "-"}</td>
                                                            </tr>
                                                          ))}
                                                        </tbody>
                                                      </table>
                                                    </div>

                                                    {/* Position Level Greeks */}
                                                    <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] bg-slate-900/50 p-2.5 rounded-xl border border-slate-900/80">
                                                      <div>
                                                        <span className="text-text-muted block uppercase text-[8px] font-bold">Delta</span>
                                                        <span className="font-bold text-text-sub font-mono">{pos.greeks.delta.toFixed(2)}</span>
                                                      </div>
                                                      <div>
                                                        <span className="text-text-muted block uppercase text-[8px] font-bold">Gamma</span>
                                                        <span className="font-bold text-text-sub font-mono">{pos.greeks.gamma.toFixed(3)}</span>
                                                      </div>
                                                      <div>
                                                        <span className="text-text-muted block uppercase text-[8px] font-bold">Theta</span>
                                                        <span className="font-bold text-text-sub font-mono">{pos.greeks.theta.toFixed(2)}</span>
                                                      </div>
                                                      <div>
                                                        <span className="text-text-muted block uppercase text-[8px] font-bold">Vega</span>
                                                        <span className="font-bold text-text-sub font-mono">{pos.greeks.vega.toFixed(2)}</span>
                                                      </div>
                                                      <div>
                                                        <span className="text-text-muted block uppercase text-[8px] font-bold">Rho</span>
                                                        <span className="font-bold text-text-sub font-mono">{pos.greeks.rho.toFixed(2)}</span>
                                                      </div>
                                                    </div>
                                                  </>
                                                )}

                                                {/* Action Buttons */}
                                                <div className="flex gap-2.5 justify-end">
                                                  {!isStock && (
                                                    <button
                                                      onClick={() => handleAnalyzeInBuilder(pos)}
                                                      disabled={isPending}
                                                      className="px-3 py-1.5 bg-indigo-600/10 border border-indigo-500/20 hover:bg-indigo-600/20 text-indigo-400 font-semibold text-[10px] rounded-lg transition uppercase tracking-wider disabled:opacity-50"
                                                    >
                                                      {isPending ? "Loading..." : "Analyze in Builder"}
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-col items-center justify-center text-center py-16 border border-dashed border-slate-900 rounded-xl space-y-3">
                            <Layers className="h-8 w-8 text-text-muted animate-pulse" />
                            <div>
                              <p className="text-xs font-bold text-white">No active IB positions</p>
                              <p className="text-[10px] text-text-sub mt-0.5">Your Interactive Brokers account currently has no open options or stock positions.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Portfolio Risk Analyzer Card */}
              {((viewMode === "local" && portfolioData) || (viewMode === "ib" && ibPortfolioData)) && (
                <div className="bg-bg-panel border border-border-panel p-5 rounded-2xl shadow-xl flex flex-col gap-4 mt-6">
                  <div 
                    onClick={() => setRiskAnalyzerOpen(!riskAnalyzerOpen)}
                    className="flex justify-between items-center border-b border-slate-800 pb-3 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5 text-indigo-400" />
                      <div>
                        <h2 className="font-bold text-sm text-text-main flex items-center gap-1.5">
                          Portfolio Risk Analyzer
                          <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded font-mono uppercase tracking-wider font-extrabold">
                            Live Risk Engine
                          </span>
                        </h2>
                        <p className="text-[10px] text-text-muted mt-0.5 font-medium">
                          Analyze entire account risk, stress test underlying price swings, and inspect symbol Greek concentrations.
                        </p>
                      </div>
                    </div>
                    <div className="text-text-muted pl-2">
                      {riskAnalyzerOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>

                  {riskAnalyzerOpen && (
                    <div className="space-y-6 pt-1">
                      
                      {/* Tabbed Navigation Bar */}
                      <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-800 pb-2">
                        <div className="flex gap-1.5 p-1 bg-slate-950/60 border border-slate-900 rounded-xl">
                          <button
                            onClick={() => setRiskTab("factors")}
                            className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                              riskTab === "factors"
                                ? "bg-indigo-600 text-white shadow shadow-indigo-500/10"
                                : "text-text-sub hover:text-text-main"
                            }`}
                          >
                            Factors & Risk Limits
                          </button>
                          <button
                            onClick={() => setRiskTab("beta_delta")}
                            className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                              riskTab === "beta_delta"
                                ? "bg-indigo-600 text-white shadow shadow-indigo-500/10"
                                : "text-text-sub hover:text-text-main"
                            }`}
                          >
                            Beta-Weighted Deltas
                          </button>
                          <button
                            onClick={() => setRiskTab("stress")}
                            className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                              riskTab === "stress"
                                ? "bg-indigo-600 text-white shadow shadow-indigo-500/10"
                                : "text-text-sub hover:text-text-main"
                            }`}
                          >
                            Stress & Greeks
                          </button>
                          <button
                            onClick={() => setRiskTab("committee")}
                            className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                              riskTab === "committee"
                                ? "bg-indigo-600 text-white shadow shadow-indigo-500/10"
                                : "text-text-sub hover:text-text-main"
                            }`}
                          >
                            AI Committee Room
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowCustomJsonInput(!showCustomJsonInput)}
                            className="px-2.5 py-1.5 border border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 text-text-sub font-semibold text-[10px] rounded-lg transition uppercase tracking-wider flex items-center gap-1.5"
                          >
                            <SlidersHorizontal className="h-3 w-3 text-indigo-400" />
                            {showCustomJsonInput ? "Hide Sandbox" : "Risk Sandbox"}
                          </button>
                        </div>
                      </div>

                      {/* Custom JSON Sandbox Editor */}
                      {showCustomJsonInput && (
                        <form onSubmit={handleSubmitCustomJson} className="bg-slate-950 border border-slate-900 p-4 rounded-xl space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-text-muted uppercase tracking-wider font-extrabold block">
                              Scenario Input (Custom Portfolio JSON)
                            </span>
                            {customJsonActive && (
                              <button
                                type="button"
                                onClick={handleResetToRealPortfolio}
                                className="text-[9px] text-indigo-400 hover:text-indigo-300 font-extrabold uppercase font-mono tracking-wider flex items-center gap-1"
                              >
                                <RefreshCw className="h-3 w-3" />
                                Reset to Real Portfolio
                              </button>
                            )}
                          </div>
                          <textarea
                            value={customJson}
                            onChange={(e) => setCustomJson(e.target.value)}
                            className="w-full h-40 bg-slate-900 text-white font-mono text-[10px] p-2.5 rounded-lg border border-slate-800 focus:outline-none focus:border-indigo-500 transition"
                            placeholder="Paste portfolio JSON here..."
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="submit"
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] rounded-lg transition uppercase tracking-wider"
                            >
                              Run Scenario Analysis
                            </button>
                          </div>
                        </form>
                      )}

                      {/* Pre-Trade Sandbox Comparison Panel */}
                      {customJsonActive && initialRiskSnapshot && riskData && (
                        <div className="bg-indigo-950/20 border border-indigo-500/20 p-5 rounded-2xl shadow-xl space-y-4">
                          <div className="flex items-center justify-between border-b border-indigo-500/10 pb-2.5">
                            <div className="flex items-center gap-2">
                              <Sparkles className="h-4.5 w-4.5 text-indigo-400 animate-pulse" />
                              <h3 className="text-xs font-black text-white uppercase tracking-wider">
                                Pre-Trade Impact Analysis
                              </h3>
                            </div>
                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-xl font-bold uppercase">
                              Pro-Forma Staged
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            {/* Net Liquidity Card */}
                            {(() => {
                              const init = initialRiskSnapshot.portfolio_summary.net_liquidity;
                              const staged = riskData.portfolio_summary.net_liquidity;
                              const diff = staged - init;
                              const isBetter = diff >= 0;
                              return (
                                <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
                                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-bold block">Net Liquidity</span>
                                  <div className="flex items-baseline justify-between mt-2 font-mono">
                                    <span className="text-text-muted text-[10px]">${init.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                    <span className="text-white text-xs font-bold">→</span>
                                    <span className="text-white text-xs font-extrabold">${staged.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                  </div>
                                  <span className={`text-[9px] font-bold block mt-1.5 ${isBetter ? "text-emerald-400" : "text-rose-400"}`}>
                                    {diff >= 0 ? "+" : ""}${diff.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                  </span>
                                </div>
                              );
                            })()}

                            {/* Maint Margin Card */}
                            {(() => {
                              const init = initialRiskSnapshot.portfolio_summary.maintenance_margin;
                              const staged = riskData.portfolio_summary.maintenance_margin;
                              const diff = staged - init;
                              const isBetter = diff <= 0; // lower margin is better
                              return (
                                <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
                                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-bold block">Maint Margin</span>
                                  <div className="flex items-baseline justify-between mt-2 font-mono">
                                    <span className="text-text-muted text-[10px]">${init.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                    <span className="text-white text-xs font-bold">→</span>
                                    <span className="text-white text-xs font-extrabold">${staged.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                  </div>
                                  <span className={`text-[9px] font-bold block mt-1.5 ${isBetter ? "text-emerald-400" : "text-rose-400"}`}>
                                    {diff >= 0 ? "+" : ""}${diff.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                  </span>
                                </div>
                              );
                            })()}

                            {/* 99% Value-at-Risk Card */}
                            {(() => {
                              const init = initialRiskSnapshot.value_at_risk?.var_99_pct || 0;
                              const staged = riskData.value_at_risk?.var_99_pct || 0;
                              const diff = staged - init;
                              const isBetter = diff <= 0; // lower VaR is better
                              return (
                                <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
                                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-bold block">99% VaR Limit</span>
                                  <div className="flex items-baseline justify-between mt-2 font-mono">
                                    <span className="text-text-muted text-[10px]">{init.toFixed(1)}%</span>
                                    <span className="text-white text-xs font-bold">→</span>
                                    <span className="text-white text-xs font-extrabold">{staged.toFixed(1)}%</span>
                                  </div>
                                  <span className={`text-[9px] font-bold block mt-1.5 ${isBetter ? "text-emerald-400" : "text-rose-400"}`}>
                                    {diff >= 0 ? "+" : ""}{diff.toFixed(1)}%
                                  </span>
                                </div>
                              );
                            })()}

                            {/* Beta-Weighted Delta Card */}
                            {(() => {
                              const init = initialRiskSnapshot.beta_weighted_delta?.net_portfolio_delta || 0;
                              const staged = riskData.beta_weighted_delta?.net_portfolio_delta || 0;
                              const diff = staged - init;
                              const isBetter = Math.abs(staged) <= Math.abs(init);
                              return (
                                <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
                                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-bold block">Beta-Wtd Delta</span>
                                  <div className="flex items-baseline justify-between mt-2 font-mono">
                                    <span className="text-text-muted text-[10px]">{init.toFixed(1)}</span>
                                    <span className="text-white text-xs font-bold">→</span>
                                    <span className="text-white text-xs font-extrabold">{staged.toFixed(1)}</span>
                                  </div>
                                  <span className={`text-[9px] font-bold block mt-1.5 ${isBetter ? "text-emerald-400" : "text-amber-400"}`}>
                                    {isBetter ? "Reduced exposure" : "Increased exposure"}
                                  </span>
                                </div>
                              );
                            })()}

                            {/* Compliance Status Card */}
                            {(() => {
                              const init = initialRiskSnapshot.compliance?.status || "NOMINAL";
                              const staged = riskData.compliance?.status || "NOMINAL";
                              
                              const statusScore = (s: string) => {
                                if (s === "CRITICAL_VIOLATION") return 2;
                                if (s === "SOFT_WARNING") return 1;
                                return 0;
                              };
                              const isBetter = statusScore(staged) < statusScore(init);
                              const isWorse = statusScore(staged) > statusScore(init);
                              
                              let badgeColor = "text-emerald-400";
                              if (staged === "CRITICAL_VIOLATION") badgeColor = "text-rose-400";
                              else if (staged === "SOFT_WARNING") badgeColor = "text-amber-400";
                              
                              return (
                                <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl flex flex-col justify-between">
                                  <div>
                                    <span className="text-[9px] text-text-muted uppercase tracking-wider font-bold block">Compliance Status</span>
                                    <div className="flex items-center justify-between mt-2">
                                      <span className="text-text-muted text-[9px] font-bold uppercase">{init.replace(/_/g, " ")}</span>
                                      <span className="text-white text-xs font-bold">→</span>
                                      <span className={`text-xs font-black uppercase ${badgeColor}`}>{staged.replace(/_/g, " ")}</span>
                                    </div>
                                  </div>
                                  <span className={`text-[9px] font-bold block mt-1.5 ${
                                    isBetter ? "text-emerald-400" : isWorse ? "text-rose-400" : "text-text-muted"
                                  }`}>
                                    {isBetter ? "IMPROVED" : isWorse ? "WORSED" : "UNCHANGED"}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Risk Engine Query States */}
                      {riskLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-3">
                          <RefreshCw className="h-8 w-8 text-indigo-400 animate-spin" />
                          <span className="text-xs font-semibold text-text-muted">Running Institutional Risk Calculations...</span>
                        </div>
                      ) : riskError ? (
                        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3">
                          <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <h4 className="font-bold text-xs text-rose-400">Risk Calculation Failure</h4>
                            <p className="text-[10px] text-rose-300/80 leading-relaxed">{riskError}</p>
                            <button 
                              onClick={() => fetchRiskAnalytics(customJsonActive ? JSON.parse(customJson) : undefined)}
                              className="mt-2 text-[9px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-extrabold uppercase px-2.5 py-1 rounded transition"
                            >
                              Retry Analytics
                            </button>
                          </div>
                        </div>
                      ) : !riskData ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-2">
                          <ShieldAlert className="h-8 w-8 text-text-muted" />
                          <span className="text-xs font-semibold text-text-muted">No Risk Data Available.</span>
                          <button 
                            onClick={() => fetchRiskAnalytics()}
                            className="text-[9px] bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold uppercase px-2.5 py-1 rounded transition"
                          >
                            Initialize Risk Engine
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* TAB 1: FACTORS & RISK LIMITS */}
                          {riskTab === "factors" && (
                            <div className="space-y-6">
                              {riskData.compliance && riskData.compliance.status !== "NOMINAL" && (
                                <div className={`p-4 rounded-2xl border flex items-start gap-3 shadow-lg ${
                                  riskData.compliance.status === "CRITICAL_VIOLATION" 
                                    ? "bg-rose-500/10 border-rose-500/20 text-rose-200" 
                                    : "bg-amber-500/10 border-amber-500/20 text-amber-200"
                                }`}>
                                  <ShieldAlert className={`h-5 w-5 shrink-0 mt-0.5 ${
                                    riskData.compliance.status === "CRITICAL_VIOLATION" ? "text-rose-400" : "text-amber-400"
                                  }`} />
                                  <div className="space-y-1">
                                    <h4 className="font-extrabold text-xs uppercase tracking-wider">
                                      {riskData.compliance.status === "CRITICAL_VIOLATION" ? "Critical Margin Violation" : "Margin Alert Warning"}
                                    </h4>
                                    <p className="text-[11px] leading-relaxed opacity-90">{riskData.compliance.message}</p>
                                    <div className="flex items-center gap-2 pt-1">
                                      <span className="text-[10px] font-bold">Maint Margin / Net Liquidation Ratio:</span>
                                      <span className="font-mono text-xs font-black">{(riskData.compliance.ratio * 100).toFixed(1)}%</span>
                                      <span className="text-[10px] opacity-80">(Limits: Soft 60%, Hard 80%)</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Factor Scores list */}
                                <div className="bg-slate-950/40 border border-slate-900 p-4 rounded-xl space-y-4">
                                  <div className="flex items-center gap-1.5 border-b border-slate-900 pb-2">
                                    <Sparkles className="h-4 w-4 text-indigo-400" />
                                    <h3 className="text-[11px] font-extrabold text-white uppercase tracking-wider">
                                      Portfolio Factor Scores
                                    </h3>
                                  </div>
                                  <div className="space-y-5">
                                    {[
                                      { label: "Growth", val: riskData.factor_exposure.portfolio_factors.growth },
                                      { label: "Momentum", val: riskData.factor_exposure.portfolio_factors.momentum },
                                      { label: "Value", val: riskData.factor_exposure.portfolio_factors.value }
                                    ].map((factor) => {
                                      const pct = Math.min(100, Math.max(0, ((factor.val + 1) / 2) * 100));
                                      return (
                                        <div className="space-y-1.5" key={factor.label}>
                                          <div className="flex justify-between text-[10px] font-bold">
                                            <span className="text-white uppercase tracking-wider">{factor.label} Score</span>
                                            <span className={`font-mono ${factor.val >= 0 ? "text-indigo-400" : "text-amber-500"}`}>
                                              {factor.val >= 0 ? "+" : ""}{factor.val.toFixed(2)}
                                            </span>
                                          </div>
                                          <div className="relative w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-800 z-10"></div>
                                            <div 
                                              className={`absolute top-0 bottom-0 transition-all duration-500 ${
                                                factor.val >= 0 ? "bg-indigo-500 left-1/2" : "bg-amber-500"
                                              }`}
                                              style={{ 
                                                left: factor.val >= 0 ? "50%" : `${pct}%`,
                                                width: `${Math.abs(pct - 50)}%` 
                                              }}
                                            ></div>
                                          </div>
                                          <div className="flex justify-between text-[8px] text-text-muted font-medium">
                                            <span>Defensive / Value</span>
                                            <span>Neutral</span>
                                            <span>High Growth / Momentum</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Sector Allocations */}
                                <div className="bg-slate-950/40 border border-slate-900 p-4 rounded-xl space-y-4">
                                  <div className="flex items-center gap-1.5 border-b border-slate-900 pb-2">
                                    <PieChart className="h-4 w-4 text-indigo-400" />
                                    <h3 className="text-[11px] font-extrabold text-white uppercase tracking-wider">
                                      Risk Factor Sector Allocations
                                    </h3>
                                  </div>
                                  <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                                    {riskData.factor_exposure.sector_matrix.length === 0 ? (
                                      <p className="text-[10px] text-text-muted italic">No sectors detected in portfolio.</p>
                                    ) : (
                                      riskData.factor_exposure.sector_matrix.map((sec: any) => (
                                        <div key={sec.sector} className="space-y-1">
                                          <div className="flex justify-between text-[10px] font-bold">
                                            <span className="text-white">{sec.sector}</span>
                                            <span className="text-text-muted font-mono">
                                              ${sec.exposure.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({sec.percentage.toFixed(1)}%)
                                            </span>
                                          </div>
                                          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800/60">
                                            <div 
                                              className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full"
                                              style={{ width: `${sec.percentage}%` }}
                                            />
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Value-at-Risk limits */}
                              <div className="bg-slate-950/40 border border-slate-900 p-4 rounded-xl space-y-4">
                                <div className="flex items-center gap-1.5 border-b border-slate-900 pb-2">
                                  <ShieldAlert className="h-4 w-4 text-indigo-400" />
                                  <h3 className="text-[11px] font-extrabold text-white uppercase tracking-wider">
                                    Value-at-Risk (VaR) Analysis
                                  </h3>
                                </div>
                                <p className="text-[10px] text-text-muted leading-relaxed">
                                  Value-at-Risk measures the maximum expected loss over a 1-day horizon at the specified confidence level, calculated using a 100-day historical returns simulation model.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  {/* Daily Expected Return (Mean) Card */}
                                  {(() => {
                                    const expectedReturn = riskData.daily_expected_return;
                                    const valUsd = expectedReturn?.daily_expected_return_usd ?? 0;
                                    const pct = expectedReturn?.expected_return_percentage ?? 0;
                                    const regime = expectedReturn?.regime_status ?? "NEUTRAL";
                                    const isPositive = valUsd >= 0;
                                    
                                    const borderClass = isPositive 
                                      ? "border-emerald-500/20 bg-emerald-950/10" 
                                      : "border-rose-500/20 bg-rose-950/10";
                                    const textClass = isPositive ? "text-emerald-400" : "text-rose-400";
                                    const badgeClass = isPositive 
                                      ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" 
                                      : "border-rose-500/20 text-rose-400 bg-rose-500/5";
                                      
                                    return (
                                      <div className={`border p-4 rounded-xl flex items-center justify-between shadow-lg transition ${borderClass}`}>
                                        <div className="space-y-1">
                                          <span className="text-[9px] text-text-muted uppercase tracking-wider font-extrabold block">
                                            Daily Expected Return (Mean)
                                          </span>
                                          <span className={`font-mono font-black text-lg block mt-1 ${textClass}`}>
                                            {isPositive ? "+" : ""}${valUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </span>
                                          <span className="text-[9px] text-text-muted block font-medium">
                                            Expected return: {pct.toFixed(4)}% of account value
                                          </span>
                                        </div>
                                        <div className={`px-2.5 py-1 rounded-full border text-[9px] font-black tracking-wider uppercase ${badgeClass}`}>
                                          {regime}
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-lg">
                                    <div className="space-y-1">
                                      <span className="text-[9px] text-text-muted uppercase tracking-wider font-extrabold block">1-Day VaR (95% Confidence)</span>
                                      <span className="font-mono font-black text-lg text-emerald-400 block mt-1">
                                        ${riskData.value_at_risk.var_95_dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </span>
                                      <span className="text-[9px] text-text-muted block font-medium">
                                        Max expected loss: {riskData.value_at_risk.var_95_pct.toFixed(2)}% of account value
                                      </span>
                                    </div>
                                    <div className="w-12 h-12 rounded-full border-4 border-emerald-500/20 flex items-center justify-center text-[10px] font-bold text-emerald-400 font-mono">
                                      95%
                                    </div>
                                  </div>

                                  <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-lg">
                                    <div className="space-y-1">
                                      <span className="text-[9px] text-text-muted uppercase tracking-wider font-extrabold block">1-Day VaR (99% Confidence)</span>
                                      <span className={`font-mono font-black text-lg block mt-1 ${riskData.value_at_risk.var_99_pct > 10.0 ? "text-rose-400" : "text-amber-400"}`}>
                                        ${riskData.value_at_risk.var_99_dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </span>
                                      <span className="text-[9px] text-text-muted block font-medium">
                                        Max expected loss: {riskData.value_at_risk.var_99_pct.toFixed(2)}% of account value
                                      </span>
                                    </div>
                                    <div className={`w-12 h-12 rounded-full border-4 flex items-center justify-center text-[10px] font-bold font-mono ${
                                      riskData.value_at_risk.var_99_pct > 10.0 ? "border-rose-500/20 text-rose-400" : "border-amber-500/20 text-amber-400"
                                    }`}>
                                      99%
                                    </div>
                                  </div>
                                </div>

                                {riskData.value_at_risk.var_99_pct > 10.0 ? (
                                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2 text-[10px] text-rose-300">
                                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                                    <div>
                                      <span className="font-bold uppercase tracking-wider block mb-0.5 font-sans">High Tail-Risk Alert</span>
                                      Your portfolio's 99% VaR stands at <span className="font-bold font-mono text-white">{riskData.value_at_risk.var_99_pct.toFixed(2)}%</span> (${riskData.value_at_risk.var_99_dollars.toFixed(2)}), which exceeds standard institutional risk targets of 10% net liquidity. Consider reducing leverage or purchasing portfolio tail protection.
                                    </div>
                                  </div>
                                ) : (
                                  <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-start gap-2 text-[10px] text-emerald-400/90">
                                    <ShieldAlert className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                                    <div>
                                      <span className="font-bold uppercase tracking-wider block mb-0.5 font-sans">Risk Levels Nominal</span>
                                      All calculated VaR metrics reside within standard institutional limits (99% VaR &lt; 10% net liquidity). Capital preservation risk is currently under threshold.
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* TAB 2: BETA-WEIGHTED DELTAS */}
                          {riskTab === "beta_delta" && (
                            <div className="space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl text-center shadow">
                                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-extrabold block">SPX Beta-Weighted Shares</span>
                                  <span className={`font-mono font-black text-base block mt-2 ${riskData.beta_weighted_delta.total_beta_weighted_delta_shares >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {riskData.beta_weighted_delta.total_beta_weighted_delta_shares >= 0 ? "+" : ""}{riskData.beta_weighted_delta.total_beta_weighted_delta_shares.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} shares
                                  </span>
                                  <span className="text-[8px] text-text-muted block mt-1 font-medium">
                                    Equivalent S&P 500 index share exposure
                                  </span>
                                </div>

                                <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl text-center shadow">
                                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-extrabold block">SPX Beta-Weighted Dollars</span>
                                  <span className={`font-mono font-black text-base block mt-2 ${riskData.beta_weighted_delta.total_beta_weighted_delta_dollars >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {riskData.beta_weighted_delta.total_beta_weighted_delta_dollars >= 0 ? "+" : ""}${riskData.beta_weighted_delta.total_beta_weighted_delta_dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[8px] text-text-muted block mt-1 font-medium">
                                    Dollar sensitivity to a 1% move in S&P 500
                                  </span>
                                </div>

                                <div className="bg-slate-950 border border-slate-900 p-4 rounded-xl text-center shadow flex flex-col justify-center">
                                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-extrabold block">S&P 500 Reference Index</span>
                                  <span className="font-mono font-black text-sm text-indigo-400 block mt-2">
                                    ${riskData.beta_weighted_delta.spx_index_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[8px] text-text-muted block mt-1 font-medium">
                                    Dynamic baseline ticker ^GSPC
                                  </span>
                                </div>
                              </div>

                              {/* Position Breakdown Table */}
                              <div className="space-y-3">
                                <div className="flex items-center gap-1.5 border-b border-slate-900 pb-2">
                                  <Activity className="h-4 w-4 text-indigo-400" />
                                  <h3 className="text-[11px] font-extrabold text-white uppercase tracking-wider">
                                    Position Sensitivity Breakdown
                                  </h3>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse text-[11px]">
                                    <thead>
                                      <tr className="border-b border-slate-800 text-text-muted uppercase tracking-wider text-[9px] font-extrabold">
                                        <th className="pb-2 pl-1">Symbol</th>
                                        <th className="pb-2">Strategy</th>
                                        <th className="pb-2 text-right">Beta</th>
                                        <th className="pb-2 text-right">Days to Liquidate</th>
                                        <th className="pb-2 text-right">Net Delta</th>
                                        <th className="pb-2 text-right">SPX Share Delta</th>
                                        <th className="pb-2 text-right pr-2">SPX Dollar Delta</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-900/60 font-mono">
                                      {riskData.beta_weighted_delta.positions.map((pos: any, idx: number) => {
                                        const isPositive = pos.beta_weighted_delta_shares >= 0;
                                        const riskPos = getRiskPositionInfo(pos.ticker, pos.strategy);
                                        const days = riskPos?.days_to_liquidate || 0;
                                        return (
                                          <tr key={`${pos.ticker}-${idx}`} className="hover:bg-slate-900/20 transition text-text-sub">
                                            <td className="py-2.5 font-bold text-white pl-1">{pos.ticker}</td>
                                            <td className="py-2.5 text-text-muted truncate max-w-[150px] font-sans">{pos.strategy || "Equity Position"}</td>
                                            <td className="py-2.5 text-right font-medium text-white">{pos.beta.toFixed(2)}</td>
                                            <td className={`py-2.5 text-right font-bold transition-colors ${
                                              days > 3.0 ? "text-rose-400 bg-rose-950/40 border border-rose-900/40 px-2 rounded" : "text-slate-300"
                                            }`}>
                                              {days.toFixed(2)}d
                                            </td>
                                            <td className={`py-2.5 text-right font-bold ${pos.position_delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                              {pos.position_delta.toFixed(2)}
                                            </td>
                                            <td className={`py-2.5 text-right font-bold ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                                              {isPositive ? "+" : ""}{pos.beta_weighted_delta_shares.toFixed(2)}
                                            </td>
                                            <td className={`py-2.5 text-right pr-2 font-bold ${isPositive ? "text-emerald-400/90" : "text-rose-400/90"}`}>
                                              {isPositive ? "+" : ""}${pos.beta_weighted_delta_dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* TAB 3: STRESS & GREEKS */}
                          {riskTab === "stress" && (
                            <div className="space-y-6">
                              {/* Macro Shock Simulator Controls */}
                              <div className="bg-slate-950 border border-slate-900 p-5 rounded-2xl shadow-md space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                                  <div className="flex items-center gap-2">
                                    <SlidersHorizontal className="h-4 w-4 text-indigo-400" />
                                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                                      Macroeconomic Shock Simulator
                                    </h3>
                                  </div>
                                  <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded font-mono uppercase tracking-wider font-extrabold">
                                    CRR Lattice Engine
                                  </span>
                                </div>

                                {/* Decoupled Preset templates */}
                                <HistoricalPresets />

                                {/* Decoupled Sliders */}
                                <ShockSliders />
                              </div>

                              {/* Pro-Forma Shock Results */}
                              {riskData.pro_forma && (spotShock !== 0.0 || ivShock !== 0.0) && (
                                <div className="space-y-4">
                                  <div className="flex items-center gap-1.5">
                                    <Activity className="h-4 w-4 text-indigo-400" />
                                    <h3 className="text-[11px] font-extrabold text-white uppercase tracking-wider">
                                      Pro-Forma Shock Payoff Estimates
                                    </h3>
                                  </div>

                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl shadow-lg">
                                      <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Pro-Forma Net Liquidity</span>
                                      <p className="text-lg font-extrabold text-white mt-1 font-mono">
                                        ${riskData.pro_forma.net_liquidity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </p>
                                      <span className={`text-[10px] font-bold block mt-1 ${riskData.pro_forma.net_liquidity_change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                        {riskData.pro_forma.net_liquidity_change >= 0 ? "+" : ""}${riskData.pro_forma.net_liquidity_change.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </span>
                                    </div>

                                    <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl shadow-lg">
                                      <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Pro-Forma Maint Margin</span>
                                      <p className="text-lg font-extrabold text-white mt-1 font-mono">
                                        ${riskData.pro_forma.maintenance_margin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </p>
                                      <span className="text-[10px] text-text-muted block mt-1">
                                        Estimated required margin
                                      </span>
                                    </div>

                                    <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl shadow-lg">
                                      <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Pro-Forma Excess Liquidity</span>
                                      <p className={`text-lg font-extrabold mt-1 font-mono ${riskData.pro_forma.excess_liquidity < 0 ? "text-rose-400" : "text-white"}`}>
                                        ${riskData.pro_forma.excess_liquidity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </p>
                                      {riskData.pro_forma.excess_liquidity < 0 ? (
                                        <span className="text-[9px] text-rose-400 font-bold block mt-1 uppercase tracking-wider animate-pulse">
                                          Margin Call Threat
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-emerald-400 font-bold block mt-1">
                                          Excess Margin Safe
                                        </span>
                                      )}
                                    </div>

                                    <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl shadow-lg">
                                      <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Scenario PnL Impact</span>
                                      <p className={`text-lg font-extrabold mt-1 font-mono ${riskData.pro_forma.net_liquidity_change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                        {riskData.pro_forma.net_liquidity_change >= 0 ? "+" : ""}${riskData.pro_forma.net_liquidity_change.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </p>
                                      <span className="text-[10px] text-text-muted block mt-1">
                                        Estimated Net P&L shock
                                      </span>
                                    </div>
                                  </div>

                                  {/* Position-level pro-forma values */}
                                  <div className="bg-slate-950/40 border border-slate-900 p-4 rounded-xl space-y-3">
                                    <h4 className="text-[11px] font-extrabold text-white uppercase tracking-wider">
                                      Asset Revaluation Details under Scenario
                                    </h4>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left border-collapse text-[11px]">
                                        <thead>
                                          <tr className="border-b border-slate-800 text-text-muted uppercase tracking-wider text-[9px] font-extrabold">
                                            <th className="pb-2 pl-1">Symbol</th>
                                            <th className="pb-2">Asset Type</th>
                                            <th className="pb-2 text-right">Initial Value</th>
                                            <th className="pb-2 text-right">Shocked Value</th>
                                            <th className="pb-2 text-right pr-2">Revaluation Change</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-900/60 font-mono">
                                          {riskData.pro_forma.positions.map((p: any, idx: number) => {
                                            const isPos = p.value_change >= 0;
                                            return (
                                              <tr key={`${p.ticker}-${idx}`} className="hover:bg-slate-900/20 transition text-text-sub">
                                                <td className="py-2 font-bold text-white pl-1">{p.ticker}</td>
                                                <td className="py-2 text-text-muted font-sans uppercase text-[9px]">{p.type.replace(/_/g, " ")}</td>
                                                <td className="py-2 text-right font-medium">${p.value_initial.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td className="py-2 text-right font-semibold text-white">${p.value_shocked.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td className={`py-2 text-right pr-2 font-bold ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
                                                  {isPos ? "+" : ""}${p.value_change.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Summary Greeks grid */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="bg-slate-950 border border-slate-900 p-3.5 rounded-xl text-center shadow">
                                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-extrabold block">Net Delta (Δ)</span>
                                  <span className={`font-mono font-extrabold text-sm block mt-1.5 ${(activeGreeks?.delta || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {(activeGreeks?.delta || 0).toFixed(2)}
                                  </span>
                                  <span className="text-[8px] text-text-muted block mt-1 font-medium italic">
                                    Share equiv: {((activeGreeks?.delta || 0)).toFixed(0)} shares
                                  </span>
                                </div>

                                <div className="bg-slate-950 border border-slate-900 p-3.5 rounded-xl text-center shadow">
                                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-extrabold block">Net Gamma (Γ)</span>
                                  <span className={`font-mono font-extrabold text-sm block mt-1.5 ${(activeGreeks?.gamma || 0) >= 0 ? "text-indigo-400" : "text-amber-500"}`}>
                                    {(activeGreeks?.gamma || 0).toFixed(4)}
                                  </span>
                                  <span className="text-[8px] text-text-muted block mt-1 font-medium">
                                    Delta accel rate
                                  </span>
                                </div>

                                <div className="bg-slate-950 border border-slate-900 p-3.5 rounded-xl text-center shadow">
                                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-extrabold block">Net Theta (Θ)</span>
                                  <span className={`font-mono font-extrabold text-sm block mt-1.5 ${(activeGreeks?.theta || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {(activeGreeks?.theta || 0).toFixed(2)}
                                  </span>
                                  <span className="text-[8px] text-text-muted block mt-1 font-medium">
                                    Daily time decay
                                  </span>
                                </div>

                                <div className="bg-slate-950 border border-slate-900 p-3.5 rounded-xl text-center shadow">
                                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-extrabold block">Net Vega (ν)</span>
                                  <span className={`font-mono font-extrabold text-sm block mt-1.5 ${(activeGreeks?.vega || 0) >= 0 ? "text-cyan-400" : "text-rose-400"}`}>
                                    {(activeGreeks?.vega || 0).toFixed(2)}
                                  </span>
                                  <span className="text-[8px] text-text-muted block mt-1 font-medium">
                                    Vol shift (1% IV)
                                  </span>
                                </div>
                              </div>

                              {/* Market Stress Test table */}
                              <div className="space-y-3">
                                <div className="flex items-center gap-1.5">
                                  <Gauge className="h-4 w-4 text-indigo-400" />
                                  <h3 className="text-[11px] font-extrabold text-white uppercase tracking-wider">
                                    Market Stress Test (Estimated Payoff Shift)
                                  </h3>
                                </div>
                                <p className="text-[10px] text-text-muted leading-relaxed">
                                  Estimates aggregate portfolio dollar value impact resulting from spot price movements across all underlying assets, assuming static IV and interest rates.
                                </p>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse text-[11px]">
                                    <thead>
                                      <tr className="border-b border-slate-800 text-text-muted uppercase tracking-wider text-[9px] font-extrabold">
                                        <th className="pb-2">Shift Percent</th>
                                        <th className="pb-2 text-right">Delta Impact</th>
                                        <th className="pb-2 text-right">Gamma Impact</th>
                                        <th className="pb-2 text-right pr-2">Total Net Est. Shift</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-900/60 font-mono">
                                      {stressTestData.map((row) => {
                                        const isPositive = row.netImpact >= 0;
                                        const isZero = Math.abs(row.netImpact) < 0.01;
                                        return (
                                          <tr 
                                            key={row.percent} 
                                            className={`hover:bg-slate-900/20 transition ${
                                              row.percent === 0 ? "bg-slate-950/40 border-y border-slate-900 font-bold" : "text-text-sub"
                                            }`}
                                          >
                                            <td className="py-2 font-bold text-white">
                                              {row.percentStr}
                                              {row.percent === 0 && <span className="text-[8px] text-text-muted ml-2 font-medium uppercase font-sans">(Base Case)</span>}
                                            </td>
                                            <td className={`py-2 text-right ${row.deltaImpact >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>
                                              {row.deltaImpact >= 0 ? "+" : ""}${row.deltaImpact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className={`py-2 text-right ${row.gammaImpact >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>
                                              {row.gammaImpact >= 0 ? "+" : ""}${row.gammaImpact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className={`py-2 text-right pr-2 font-bold ${
                                              isZero ? "text-slate-300" : isPositive ? "text-emerald-400 bg-emerald-500/5" : "text-rose-400 bg-rose-500/5"
                                            }`}>
                                              {isZero ? "" : isPositive ? "+" : ""}${row.netImpact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* Asset Breakdown Section */}
                              <div className="space-y-3">
                                <div className="flex items-center gap-1.5">
                                  <Activity className="h-4 w-4 text-indigo-400" />
                                  <h3 className="text-[11px] font-extrabold text-white uppercase tracking-wider">
                                    Greeks Breakdown by Symbol
                                  </h3>
                                </div>
                                {assetBreakdown.length === 0 ? (
                                  <p className="text-[10px] text-text-muted italic">No active positions to break down.</p>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-[11px]">
                                      <thead>
                                        <tr className="border-b border-slate-800 text-text-muted uppercase tracking-wider text-[9px] font-extrabold">
                                          <th className="pb-2">Symbol</th>
                                          <th className="pb-2 text-center">Positions</th>
                                          <th className="pb-2 text-right">Mkt Value</th>
                                          <th className="pb-2 text-right">Net Delta</th>
                                          <th className="pb-2 text-right">Net Gamma</th>
                                          <th className="pb-2 text-right">Net Theta</th>
                                          <th className="pb-2 text-right pr-2">Net Vega</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-900/60 font-mono">
                                        {assetBreakdown.map((asset) => (
                                          <tr key={asset.symbol} className="hover:bg-slate-900/20 transition text-text-sub">
                                            <td className="py-2.5 font-bold text-white text-[11px] pl-1">{asset.symbol}</td>
                                            <td className="py-2.5 text-center font-sans font-bold text-text-muted">{asset.positionCount}</td>
                                            <td className="py-2.5 text-right font-sans font-semibold text-slate-100">
                                              ${asset.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className={`py-2.5 text-right font-bold ${asset.delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{asset.delta.toFixed(2)}</td>
                                            <td className={`py-2.5 text-right font-bold ${asset.gamma >= 0 ? "text-indigo-400" : "text-amber-500"}`}>{asset.gamma.toFixed(3)}</td>
                                            <td className={`py-2.5 text-right font-bold ${asset.theta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{asset.theta.toFixed(2)}</td>
                                            <td className={`py-2.5 text-right pr-2 font-bold ${asset.vega >= 0 ? "text-cyan-400" : "text-rose-400"}`}>{asset.vega.toFixed(2)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* TAB 4: AI COMMITTEE ROOM */}
                          {riskTab === "committee" && (
                            <div className="space-y-6">
                              {/* Order Execution Success Message */}
                              {orderExecutedMessage && (
                                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-2xl flex items-center justify-between shadow-lg">
                                  <div className="flex items-center gap-3">
                                    <Check className="h-5 w-5 text-emerald-400" />
                                    <span className="text-xs font-semibold">{orderExecutedMessage}</span>
                                  </div>
                                  <button
                                    onClick={() => setOrderExecutedMessage(null)}
                                    className="text-emerald-500 hover:text-emerald-300"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              )}

                              {debateLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                                  <RefreshCw className="h-8 w-8 text-indigo-400 animate-spin" />
                                  <span className="text-xs font-semibold text-text-muted">Convening AI Investment Committee...</span>
                                </div>
                              ) : debateError ? (
                                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex flex-col items-center justify-center text-center space-y-3">
                                  <AlertCircle className="h-8 w-8 text-rose-400" />
                                  <div className="space-y-1">
                                    <h4 className="font-bold text-xs text-rose-400">Committee Convening Failed</h4>
                                    <p className="text-[10px] text-rose-300/80 leading-relaxed max-w-md">{debateError}</p>
                                  </div>
                                  <button
                                    onClick={runCommitteeReview}
                                    className="text-[9px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-extrabold uppercase px-2.5 py-1 rounded transition"
                                  >
                                    Retry Convening Committee
                                  </button>
                                </div>
                                ) : (
                                  <div className="space-y-6">
                                    {/* Live Macro News Feed Banner */}
                                    {macroHeadline && (
                                      <div className="glass-panel p-4 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in border-l-4 border-rose-500/80">
                                        <div className="flex items-center gap-3">
                                          <div className="relative flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                                          </div>
                                          <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest flex items-center">
                                            LIVE MACRO FEED
                                          </span>
                                          <div className="h-4 w-[1px] bg-slate-800 hidden md:block" />
                                          <span className="text-xs font-semibold text-white tracking-wide">{macroHeadline}</span>
                                        </div>
                                        {macroSentimentScore !== null && (
                                          <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">SENTIMENT</span>
                                            <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                                              macroSentimentScore > 0.2 
                                                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                                                : macroSentimentScore < -0.2
                                                  ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
                                                  : "text-slate-400 bg-slate-500/10 border-slate-500/20"
                                            }`}>
                                              {macroSentimentScore > 0 ? "+" : ""}{macroSentimentScore.toFixed(2)}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {/* Debate Chat Feed Column */}
                                  <div className="flex flex-col gap-6">
                                    <div className="space-y-4 bg-slate-950 border border-slate-900 p-5 rounded-2xl shadow-xl flex flex-col h-[500px]">
                                      <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-900 pb-3">
                                        <MessageSquare className="h-4 w-4 text-indigo-400" />
                                        Dialectical Agent Debate Feed
                                      </h3>
                                      
                                      <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 custom-scrollbar">
                                        {debateLogs.map((msg, idx) => {
                                          const isPm = msg.agent.includes("Manager");
                                          const isOptions = msg.agent.includes("Options");
                                          const isMacro = msg.agent.includes("Macro");
                                          
                                          let agentColor = "text-indigo-400 bg-indigo-500/10 border-indigo-500/20";
                                          if (isOptions) agentColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
                                          if (isMacro) agentColor = "text-amber-400 bg-amber-500/10 border-amber-500/20";
                                          
                                          return (
                                            <div key={idx} className="space-y-1">
                                              <div className="flex items-center gap-2">
                                                <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${agentColor}`}>
                                                  {msg.agent}
                                                </span>
                                              </div>
                                              <div className="bg-slate-900/60 border border-slate-800/80 p-3 rounded-xl text-text-sub text-xs leading-relaxed font-medium">
                                                {msg.message}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      
                                      <button
                                        onClick={runCommitteeReview}
                                        className="w-full mt-2 py-2 border border-slate-800 bg-slate-900/50 hover:bg-slate-900/80 text-text-sub font-semibold text-[10px] rounded-xl transition uppercase tracking-wider flex items-center justify-center gap-1.5"
                                      >
                                        <RefreshCw className="h-3 w-3 text-indigo-400" />
                                        Trigger Re-Debate / Refresh Committee
                                      </button>
                                    </div>

                                    {/* Narrative Commentary summary report */}
                                    {summaryReport && (
                                      <div className="space-y-4 bg-slate-950 border border-slate-900 p-5 rounded-2xl shadow-xl flex flex-col">
                                        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-900 pb-3">
                                          <BookOpen className="h-4 w-4 text-indigo-400" />
                                          Investment Committee Portfolio Summary Report
                                        </h3>
                                        <div className="text-text-sub text-xs leading-relaxed markdown-body max-h-[350px] overflow-y-auto pr-1">
                                          {summaryReport.split("\n").map((line, idx) => {
                                            if (line.startsWith("# ")) {
                                              return <h2 key={idx} className="text-sm font-extrabold text-white mt-4 border-b border-slate-900 pb-1">{line.replace("# ", "")}</h2>;
                                            } else if (line.startsWith("## ")) {
                                              return <h3 key={idx} className="text-xs font-bold text-white mt-3">{line.replace("## ", "")}</h3>;
                                            } else if (line.startsWith("### ")) {
                                              return <h4 key={idx} className="text-xs font-bold text-slate-300 mt-2">{line.replace("### ", "")}</h4>;
                                            } else if (line.startsWith("* ") || line.startsWith("- ")) {
                                              return <li key={idx} className="ml-4 list-disc pl-1 text-[11px] font-medium">{line.substring(2)}</li>;
                                            } else if (line.startsWith("1. ") || line.startsWith("2. ")) {
                                              return <div key={idx} className="ml-2 font-semibold text-[11px] mt-1.5">{line}</div>;
                                            } else if (line.trim() === "---") {
                                              return <hr key={idx} className="border-slate-900 my-2" />;
                                            } else if (line.trim().length > 0) {
                                              return <p key={idx} className="text-[11px] font-medium text-text-sub leading-normal">{line}</p>;
                                            }
                                            return null;
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Advisory Report Column */}
                                  <div className="space-y-4 bg-slate-950 border border-slate-900 p-5 rounded-2xl shadow-xl flex flex-col h-[500px]">
                                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-900 pb-3">
                                      <FileText className="h-4 w-4 text-indigo-400" />
                                      Coordinator Advisory Report
                                    </h3>
                                    
                                    <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 custom-scrollbar text-text-sub text-xs leading-relaxed markdown-body">
                                      {advisoryReport.split("\n").map((line, idx) => {
                                        if (line.startsWith("# ")) {
                                          return <h2 key={idx} className="text-sm font-extrabold text-white mt-4 border-b border-slate-900 pb-1">{line.replace("# ", "")}</h2>;
                                        } else if (line.startsWith("## ")) {
                                          return <h3 key={idx} className="text-xs font-bold text-white mt-3">{line.replace("## ", "")}</h3>;
                                        } else if (line.startsWith("### ")) {
                                          return <h4 key={idx} className="text-xs font-bold text-slate-300 mt-2">{line.replace("### ", "")}</h4>;
                                        } else if (line.startsWith("* ") || line.startsWith("- ")) {
                                          return <li key={idx} className="ml-4 list-disc pl-1 text-[11px] font-medium">{line.substring(2)}</li>;
                                        } else if (line.startsWith("1. ") || line.startsWith("2. ")) {
                                          return <div key={idx} className="ml-2 font-semibold text-[11px] mt-1.5">{line}</div>;
                                        } else if (line.trim() === "---") {
                                          return <hr key={idx} className="border-slate-900 my-2" />;
                                        } else if (line.trim().length > 0) {
                                          return <p key={idx} className="text-[11px] font-medium text-text-sub leading-normal">{line}</p>;
                                        }
                                        return null;
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                              {/* Actionable Recommendations list at bottom of committee tab */}
                              {!debateLoading && recommendations.length > 0 && (
                                <div className="bg-slate-950 border border-slate-900 p-5 rounded-2xl shadow-xl space-y-4">
                                  <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                      <Check className="h-4 w-4 text-emerald-400" />
                                      Staged Committee Recommendations
                                    </h4>
                                    <button
                                      onClick={handleApproveAllRecommendations}
                                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] rounded-xl uppercase tracking-wider transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/10"
                                    >
                                      Approve & Execute All
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {recommendations.map((rec) => {
                                      const isStaged = stagedRecommendationId === rec.id;
                                      return (
                                        <div key={rec.id} className="bg-slate-900/60 border border-slate-800 p-4.5 rounded-xl flex flex-col justify-between gap-3 hover:border-slate-700 transition">
                                          <div>
                                            <div className="flex items-center justify-between">
                                              <span className="text-white text-xs font-extrabold">{rec.ticker}</span>
                                              <span className={`text-[9px] px-2 py-0.5 rounded font-extrabold uppercase font-mono tracking-wider ${
                                                rec.action === "SELL" || rec.action === "TRIM" || rec.action === "CLOSE"
                                                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                              }`}>
                                                {rec.action}
                                              </span>
                                            </div>
                                            <p className="text-[11px] text-text-sub font-medium mt-2 leading-relaxed">{rec.description}</p>
                                          </div>
                                          
                                          <div className="flex gap-2 pt-2 border-t border-slate-900">
                                            <button
                                              onClick={() => handleStageRecommendation(rec)}
                                              className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition border ${
                                                isStaged 
                                                  ? "bg-indigo-600 border-indigo-500 text-white" 
                                                  : "bg-slate-950 border-slate-800 text-text-sub hover:text-text-main"
                                              }`}
                                            >
                                              {isStaged ? "Staged in Sandbox" : "Stage in Sandbox"}
                                            </button>
                                            <button
                                              onClick={() => handleApproveRecommendation(rec)}
                                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] rounded-lg uppercase tracking-wider transition"
                                            >
                                              Approve & Execute
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}

                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Side widgets: Watchlist, Notes, Sector (4 Cols) */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              
              {/* Sector Exposure Chart */}
              {portfolioData && portfolioData.sector_exposure.length > 0 && (
                <div className="bg-bg-panel border border-border-panel p-5 rounded-2xl shadow-xl space-y-4">
                  <h3 className="font-bold text-sm text-text-main flex items-center gap-2 border-b border-slate-800 pb-3">
                    <PieChart className="h-4 w-4 text-indigo-400" />
                    Sector Allocation Exposure
                  </h3>
                  
                  <div className="space-y-3">
                    {portfolioData.sector_exposure.map((sec, idx) => {
                      // Color gradients for different sectors
                      const colors = [
                        "bg-gradient-to-r from-indigo-500 to-blue-500",
                        "bg-gradient-to-r from-emerald-500 to-teal-500",
                        "bg-gradient-to-r from-amber-500 to-yellow-500",
                        "bg-gradient-to-r from-purple-500 to-violet-500",
                        "bg-gradient-to-r from-rose-500 to-pink-500",
                      ];
                      const color = colors[idx % colors.length];

                      return (
                        <div key={sec.sector} className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-text-sub">{sec.sector}</span>
                            <span className="text-text-main font-mono">{sec.percentage}%</span>
                          </div>
                          <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`${color} h-full rounded-full`}
                              style={{ width: `${sec.percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Watchlist Widget */}
              <div className="bg-bg-panel border border-border-panel p-5 rounded-2xl shadow-xl space-y-4">
                <h3 className="font-bold text-sm text-text-main flex items-center gap-2 border-b border-slate-800 pb-3">
                  <LineChart className="h-4 w-4 text-indigo-400" />
                  My Watchlist
                </h3>

                <form onSubmit={handleAddWatchlist} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="AAPL..."
                    value={newWatchlistSymbol}
                    onChange={(e) => setNewWatchlistSymbol(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 text-text-main rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none uppercase font-bold"
                  />
                  <button
                    type="submit"
                    className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition"
                    title="Add Ticker"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </form>

                {watchlist.length > 0 ? (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                    {watchlist.map((item) => {
                      const spotVal = getWatchlistPrice(item.symbol);
                      return (
                        <div 
                          key={item.id} 
                          className="flex justify-between items-center bg-slate-900/30 border border-slate-900/60 p-2.5 rounded-xl hover:bg-slate-900/50 transition cursor-pointer"
                          onClick={() => setActiveNoteSymbol(item.symbol.toUpperCase())}
                        >
                          <div className="flex flex-col">
                            <span className="text-xs font-extrabold text-white tracking-wider">{item.symbol}</span>
                            <span className="text-[8px] text-text-muted font-medium">Click to journal</span>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs text-text-main font-bold">${spotVal.toFixed(2)}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveWatchlist(item.symbol);
                              }}
                              className="p-1 text-text-muted hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                              title="Delete Ticker"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-text-muted text-center py-4">Watchlist is empty. Search tickers to add.</p>
                )}
              </div>

              {/* Trade Journal Notes */}
              <div className="bg-bg-panel border border-border-panel p-5 rounded-2xl shadow-xl space-y-4">
                <h3 className="font-bold text-sm text-text-main flex items-center gap-2 border-b border-slate-800 pb-3">
                  <BookOpen className="h-4 w-4 text-indigo-400" />
                  Trade Journal Notes
                </h3>

                <div className="flex items-center gap-1.5 justify-between">
                  <span className="text-[10px] text-text-muted font-bold">Active Symbol:</span>
                  <select
                    value={activeNoteSymbol}
                    onChange={(e) => setActiveNoteSymbol(e.target.value.toUpperCase())}
                    className="bg-slate-900 border border-slate-800 text-text-main rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 outline-none uppercase font-bold cursor-pointer"
                  >
                    <option value="AAPL">AAPL</option>
                    <option value="TSLA">TSLA</option>
                    <option value="MSFT">MSFT</option>
                    <option value="SPY">SPY</option>
                    <option value="QQQ">QQQ</option>
                    <option value="NVDA">NVDA</option>
                  </select>
                </div>

                {/* List notes */}
                {notes.length > 0 ? (
                  <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
                    {notes.map((n) => (
                      <div key={n.id} className="bg-slate-900/40 border border-slate-900/80 p-3 rounded-xl space-y-1">
                        <p className="text-xs text-text-sub font-medium leading-relaxed">{n.note_text}</p>
                        <span className="text-[8px] text-text-muted block text-right font-mono">
                          {new Date(n.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-text-muted text-center py-4">No notes logged for {activeNoteSymbol} yet.</p>
                )}

                <form onSubmit={handleAddNote} className="space-y-2 pt-1">
                  <textarea
                    placeholder={`Write trade details for ${activeNoteSymbol}...`}
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-900 border border-slate-800 text-text-sub rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none resize-none font-medium placeholder:text-text-muted"
                  />
                  <button
                    type="submit"
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition"
                  >
                    Save Journal Entry
                  </button>
                </form>
              </div>

            </div>

          </div>
        </div>
      )}
      </main>
    </div>
  );
}

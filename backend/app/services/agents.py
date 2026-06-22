import re
import logging
from typing import List, Dict, Any, Optional
from app.agents.prompts import (
    MACRO_RISK_AGENT_PROMPT,
    OPTIONS_SPECIALIST_AGENT_PROMPT,
    COORDINATOR_PROMPT
)

logger = logging.getLogger("uvicorn.error")

def parse_natural_language_query(query_text: str) -> Dict[str, Any]:
    """
    Parses a natural language query from the command bar into a structured filter JSON object.
    Supports keywords like:
    - "short" or "long" positions
    - "expiring in under N days" or "expiring < N days"
    - "high factor exposure to X" or "high exposure to X" (Momentum, Growth, Value)
    - "critical" or "medium" early assignment risk
    - "options" or "stocks" / "equities"
    - "ticker X" or "symbol X"
    """
    query_lower = query_text.lower()
    filters = {}
    
    # 1. Parse position type
    if "short" in query_lower:
        filters["position_type"] = "SHORT"
    elif "long" in query_lower:
        filters["position_type"] = "LONG"
        
    # 2. Parse expiration days (DTE)
    dte_match = re.search(r'(?:expiring in under|expiring <|under|less than|within)?\s*(\d+)\s*days', query_lower)
    if dte_match:
        filters["expiration_days_lte"] = int(dte_match.group(1))
        
    # 3. Parse factor exposures
    for factor in ["momentum", "growth", "value"]:
        if f"factor exposure to {factor}" in query_lower or f"exposure to {factor}" in query_lower or factor in query_lower:
            # Only trigger factor filter if user is explicitly querying for factor concentrations
            if "factor" in query_lower or "exposure" in query_lower:
                filters["factor_high"] = factor
                break
                
    # 4. Parse early assignment risk
    if "critical" in query_lower:
        filters["early_assignment_risk"] = "Critical"
    elif "medium" in query_lower:
        filters["early_assignment_risk"] = "Medium"
    elif "low" in query_lower:
        filters["early_assignment_risk"] = "Low"
        
    # 5. Parse asset type
    if "option" in query_lower:
        filters["asset_type"] = "OPTION"
    elif "stock" in query_lower or "equit" in query_lower:
        filters["asset_type"] = "EQUITY"
        
    # 6. Parse ticker
    # Look for a 3-5 character word in uppercase/caps or after "ticker" / "symbol"
    ticker_match = re.search(r'(?:ticker|symbol|asset|filter)\s+([a-zA-Z]{1,5})', query_lower)
    if ticker_match:
        filters["ticker"] = ticker_match.group(1).upper()
    else:
        # Check if any standard known tickers appear in the query
        for t in ["SPY", "TQQQ", "QQQ", "NVDA", "MSFT", "AAPL", "AMD", "TSLA", "AMZN", "VRT", "NBIS"]:
            if t.lower() in query_lower.split():
                filters["ticker"] = t
                break

    message = f"Applied filters: {', '.join([f'{k}={v}' for k, v in filters.items()])}" if filters else "No matching filters found."
    return {
        "filters": filters,
        "message": message
    }

async def run_investment_committee(portfolio_state: Dict[str, Any], active_macro_events: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """
    Executes a structured async graph simulating a dialectical debate between:
    1. Options Specialist Agent
    2. Macro Risk Agent
    3. Portfolio Manager Agent (Coordinator)
    
    Produces detailed debate logs, a markdown advisory report, and staged recommendations.
    """
    if active_macro_events is None:
        active_macro_events = []
        from app.main import redis_client
        if redis_client:
            try:
                cached_items = await redis_client.lrange("macro:feed:cache", 0, 9)
                for item in cached_items:
                    try:
                        active_macro_events.append(json.loads(item))
                    except Exception:
                        pass
            except Exception as e:
                logger.error(f"Failed to query macro feed cache for committee: {e}")
    positions = portfolio_state.get("positions", [])
    summary = portfolio_state.get("portfolio_summary", {})
    compliance = portfolio_state.get("compliance", {})
    
    maint_margin = summary.get("maintenance_margin", 0.0)
    net_liq = summary.get("net_liquidity", 1.0)
    margin_ratio = maint_margin / net_liq if net_liq > 0 else 0.0
    
    # Identify options under pressure or critical early assignment risk
    critical_legs = []
    upcoming_dte_legs = []
    short_legs = []
    
    for pos in positions:
        ticker = pos.get("ticker", "")
        pos_type = pos.get("type", "")
        early_risk = pos.get("early_assignment_risk", "Low")
        
        # Check if option combination
        if pos_type in ["OPTION_COMBINATION", "OPTION"]:
            for leg in pos.get("legs", []):
                leg_action = leg.get("position_type") or ("SELL" if leg.get("position_type") == "SHORT" else "BUY")
                # Parse expiration to check DTE
                leg_exp = leg.get("expiration", "2026-06-05")
                # Expiration parsing
                dte = 30.0
                try:
                    from datetime import datetime
                    exp_dt = datetime.strptime(leg_exp, "%Y-%m-%d").date()
                    today = datetime.today().date()
                    dte = (exp_dt - today).days
                except Exception:
                    pass
                
                leg_info = {
                    "ticker": ticker,
                    "strike": leg.get("strike", 100.0),
                    "type": leg.get("type", "CALL"),
                    "position_type": leg.get("position_type", "SHORT"),
                    "expiration": leg_exp,
                    "dte": dte,
                    "early_assignment_risk": leg.get("early_assignment_risk", "Low")
                }
                
                if leg_action.upper() in ["SHORT", "SELL"]:
                    short_legs.append(leg_info)
                    
                if leg.get("early_assignment_risk") == "Critical":
                    critical_legs.append(leg_info)
                elif dte <= 14:
                    upcoming_dte_legs.append(leg_info)

    # 1. Options Specialist Agent analysis
    options_notes = []
    options_recs = []
    if critical_legs:
        for leg in critical_legs:
            options_notes.append(
                f"CRITICAL ASSIGNMENT RISK: Short {leg['ticker']} {leg['strike']} {leg['type']} "
                f"expiring {leg['expiration']} is ITM with minimal extrinsic value. Ex-dividend is imminent."
            )
            # Recommend rolling or closing
            options_recs.append({
                "ticker": leg["ticker"],
                "type": "OPTION_COMBINATION",
                "action": "CLOSE",
                "description": f"Close critical short {leg['type']} leg on {leg['ticker']} at strike {leg['strike']} to avoid early assignment.",
                "trade_draft": {
                    "ticker": leg["ticker"],
                    "type": "OPTION_COMBINATION",
                    "action": "SELL" if leg["position_type"] == "LONG" else "BUY", # offset
                    "size": -1, # closing indicates removing 1 spread unit
                    "legs": [
                        {
                            "strike": leg["strike"],
                            "type": leg["type"],
                            "expiration": leg["expiration"],
                            "position_type": "LONG" if leg["position_type"].upper() == "SHORT" else "SHORT",
                            "delta": 0.0
                        }
                    ]
                }
            })
    elif upcoming_dte_legs:
        for leg in upcoming_dte_legs:
            options_notes.append(
                f"DTE PRESSURE: Short {leg['ticker']} {leg['strike']} {leg['type']} has only {leg['dte']} days left to expiration. Gamma risk is rising."
            )
            options_recs.append({
                "ticker": leg["ticker"],
                "type": "OPTION_COMBINATION",
                "action": "ROLL",
                "description": f"Roll {leg['ticker']} {leg['strike']} {leg['type']} out to a further expiration date to mitigate tail risk.",
                "trade_draft": {
                    "ticker": leg["ticker"],
                    "type": "OPTION_COMBINATION",
                    "action": "BUY",
                    "size": 1,
                    "legs": [
                        {
                            "strike": leg["strike"] - 5.0 if leg["type"] == "PUT" else leg["strike"] + 5.0, # roll strike away
                            "type": leg["type"],
                            "expiration": "2026-07-17", # rolled out
                            "position_type": leg["position_type"],
                            "delta": 0.0
                        }
                    ]
                }
            })
    else:
        options_notes.append("No immediate early assignment or DTE pressure detected on option legs. Structure is stable.")

    # 2. Macro Risk Agent analysis
    macro_notes = []
    macro_recs = []
    factor_exposure = portfolio_state.get("factor_exposure", {})
    portfolio_factors = factor_exposure.get("portfolio_factors", {})
    var_99_pct = portfolio_state.get("value_at_risk", {}).get("var_99_pct", 0.0)
    
    # Check compliance warnings
    is_warn = margin_ratio > 0.60
    is_crit = margin_ratio > 0.80 or net_liq < 0
    
    if is_crit:
        macro_notes.append(
            f"CRITICAL MARGIN VIOLATION: Margin maintenance ratio is {(margin_ratio*100):.1f}% (exceeds 80% hard limit). "
            f"Net Liquidation has deteriorated to ${net_liq:.2f}. Margin call is imminent."
        )
    elif is_warn:
        macro_notes.append(
            f"SOFT MARGIN WARNING: Margin maintenance ratio stands at {(margin_ratio*100):.1f}% (exceeds 60% warning threshold). "
            f"Excess liquidation is restricted."
        )
        
    if var_99_pct > 10.0:
        macro_notes.append(
            f"HIGH TAIL RISK: 99% 1-day Value-at-Risk stands at {var_99_pct:.2f}% of net liquidation. "
            f"Concentration in highly volatile growth/momentum sectors (e.g. Technology) must be hedged."
        )
        
    # Check NVDA or high momentum concentrations
    nvda_pos = next((p for p in positions if p.get("ticker") == "NVDA"), None)
    if nvda_pos and nvda_pos.get("size", 0) > 0 and (is_warn or is_crit or var_99_pct > 10.0):
        macro_notes.append(
            f"MOMENTUM CONCENTRATION: NVDA represents a large momentum asset. Trimming shares reduces beta-weighted dollar delta and frees maintenance margin."
        )
        macro_recs.append({
            "ticker": "NVDA",
            "type": "EQUITY",
            "action": "TRIM",
            "description": "Trim NVDA equity position by 2 shares to reduce growth/momentum factor exposure and release maintenance margin.",
            "trade_draft": {
                "ticker": "NVDA",
                "type": "EQUITY",
                "size": -2, # Trim 2 shares
                "avg_price": nvda_pos.get("price", 220.0),
                "current_price": nvda_pos.get("price", 223.86)
            }
        })
    elif is_warn or is_crit:
        # Default macro recommendation: Hedge SPY
        macro_notes.append("Defensive hedge recommended: Purchase SPY Put option or buy inverse index exposure.")
        macro_recs.append({
            "ticker": "SPY",
            "type": "OPTION_COMBINATION",
            "action": "HEDGE",
            "description": "Stage a long SPY protective put to hedge market downturn and lower portfolio VaR.",
            "trade_draft": {
                "ticker": "SPY",
                "type": "OPTION_COMBINATION",
                "action": "BUY",
                "size": 1,
                "legs": [
                    {
                        "strike": 500.0,
                        "type": "PUT",
                        "expiration": "2026-07-17",
                        "position_type": "LONG",
                        "delta": -0.30
                    }
                ]
            }
        })
        
    if not macro_notes:
        macro_notes.append("Portfolio factor exposures and margin ratios are well within safe institutional limit boundaries.")

    # 3. Simulating the Dialectical Debate Feed logs
    debate_logs = []
    debate_logs.append({
        "agent": "Options Specialist Agent",
        "avatar": "shield",
        "message": f"Hello Committee. I have reviewed the option structures. {options_notes[0]}"
    })
    
    debate_logs.append({
        "agent": "Macro Risk Agent",
        "avatar": "activity",
        "message": f"Thanks for the update. From a macro perspective: {macro_notes[0] if macro_notes else 'Everything looks nominal.'} "
                   f"Our 99% VaR is {var_99_pct:.2f}%. We need to address factor risk alongside structural option pressure."
    })
    
    if critical_legs:
        debate_logs.append({
            "agent": "Options Specialist Agent",
            "avatar": "shield",
            "message": f"Absolutely. The SPY ex-dividend is imminent and the extrinsic value of our short put legs has decayed near zero. "
                       f"I recommend rolling or closing these positions immediately to avoid assignment."
        })
    else:
        debate_logs.append({
            "agent": "Options Specialist Agent",
            "avatar": "shield",
            "message": "Agreed. Since option legs have sufficient extrinsic values, we can focus on trimming overconcentrated equities to optimize margin requirements."
        })
        
    if macro_recs:
        rec_desc = macro_recs[0]["description"]
        debate_logs.append({
            "agent": "Macro Risk Agent",
            "avatar": "activity",
            "message": f"Exactly. I propose the following: {rec_desc} This adjustment will immediately improve our compliance status."
        })
        
    debate_logs.append({
        "agent": "Portfolio Manager Agent",
        "avatar": "briefcase",
        "message": "Consensus reached. We will prioritize closing critical early assignment options and trimming volatile equity weightings to release margin capacity. "
                   "Draft recommendations have been staged. Stage them in the Pre-Trade Sandbox to run pro-forma checks."
    })

    # 4. Coordinator Synthesizes Actionable Report
    advisory_report = f"""# Investment Committee Advisory Report

**Executive Summary:**
The Multi-Agent AI Investment Committee has run a risk diagnostic on the active portfolio state. 

## Specialization Findings

### 1. Options & Greeks Analysis (Options Specialist)
* **Status:** {"CRITICAL" if critical_legs else "NOMINAL"}
* **DTE Warnings:** {len(upcoming_dte_legs)} leg(s) expiring under 14 days.
* **Early Exercise Risk:** {len(critical_legs)} leg(s) flagged with critical assignment risk.
* **Findings:** {options_notes[0]}

### 2. Macro Risk & Compliance (Macro Risk Agent)
* **Status:** {"VIOLATION" if is_crit else "WARNING" if is_warn else "NOMINAL"}
* **Maintenance Margin Ratio:** {(margin_ratio*100):.1f}% (Soft Limit: 60%, Hard Limit: 80%)
* **Value-at-Risk (99%):** {var_99_pct:.2f}% of Net Liquidity.
* **Findings:** {macro_notes[0] if macro_notes else "All factor concentrations and margin levels are nominal."}

---

## Actionable Recommendations
We recommend implementing the following staged adjustments to bring the portfolio back within institutional risk limits:

1. **{options_recs[0]['action'] if options_recs else 'STABILIZE'}** - {options_recs[0]['description'] if options_recs else 'Maintain current option positions.'}
2. **{macro_recs[0]['action'] if macro_recs else 'HOLD'}** - {macro_recs[0]['description'] if macro_recs else 'No equity adjustments needed at this time.'}

*Please click 'Stage Recommendation' next to each draft to analyze the net pro-forma impact on Net Liquidity, VaR, and Margin levels.*
"""

    # Merge recommendations
    all_recs = []
    for idx, r in enumerate(options_recs):
        all_recs.append({
            "id": f"rec_opt_{idx + 1:02d}",
            "ticker": r["ticker"],
            "type": r["type"],
            "action": r["action"],
            "description": r["description"],
            "trade_draft": r["trade_draft"]
        })
    for idx, r in enumerate(macro_recs):
        all_recs.append({
            "id": f"rec_macro_{idx + 1:02d}",
            "ticker": r["ticker"],
            "type": r["type"],
            "action": r["action"],
            "description": r["description"],
            "trade_draft": r["trade_draft"]
        })

    # If no recommendations, add a default safe one to make sandbox testable
    if not all_recs:
        all_recs.append({
            "id": "rec_default_01",
            "ticker": "SPY",
            "type": "EQUITY",
            "action": "BUY",
            "description": "Buy 10 shares of SPY baseline index to deploy idle cash.",
            "trade_draft": {
                "ticker": "SPY",
                "type": "EQUITY",
                "size": 10,
                "avg_price": 540.0,
                "current_price": 540.0
            }
        })

    # 5. Narrative Commentary Summary Report
    daily_pnl = summary.get("daily_pnl", 0.0)
    critical_assignment_count = len(critical_legs)
    factor_exposure_warnings = "High growth/momentum concentration (Technology)" if var_99_pct > 10.0 else "Nominal"

    perf_comment = ""
    if daily_pnl < 0:
        perf_comment = f"The portfolio suffered a Daily P&L drawdown of ${abs(daily_pnl):,.2f}, reducing Net Liquidity to ${net_liq:,.2f}. "
    else:
        perf_comment = f"The portfolio generated a positive Daily P&L of ${daily_pnl:,.2f}, supporting Net Liquidity at ${net_liq:,.2f}. "
        
    if margin_ratio > 0.8:
        perf_comment += f"CRITICAL CAPITAL CONSTRAINT: Maintenance margin of ${maint_margin:,.2f} is at {margin_ratio*100:.1f}% of Net Liquidity. This exceeds the hard limit of 80%, leaving almost no buffer against further drawdowns and risking immediate margin liquidation."
    elif margin_ratio > 0.6:
        perf_comment += f"MARGIN PRESSURE: Maintenance margin of ${maint_margin:,.2f} stands at {margin_ratio*100:.1f}% of Net Liquidity, crossing the warning threshold of 60%. Trading power is restricted, and margin buffers are dangerously tight."
    else:
        perf_comment += f"Capital buffer is nominal. Maintenance margin of ${maint_margin:,.2f} represents {margin_ratio*100:.1f}% of Net Liquidity, well below critical risk limits."

    sector_comment = ""
    if var_99_pct > 10.0:
        sector_comment = f"SYSTEMIC RISK ALERT: 99% Value-at-Risk stands at an elevated {var_99_pct:.2f}% of net liquidity. This tail risk is driven by excessive concentration in high-beta growth/momentum factors (such as the Technology sector and high-beta components like NVDA or TQQQ)."
    else:
        sector_comment = f"Factor and sector concentrations are currently nominal. 99% VaR stands at {var_99_pct:.2f}%, within standard institutional guidelines."

    assignment_comment = ""
    if critical_assignment_count > 0:
        assignment_comment = f"CRITICAL ASSIGNMENT RISK: We identified {critical_assignment_count} option leg(s) with Critical assignment risk. Specifically, " + ", ".join([f"short {leg['ticker']} {leg['strike']} {leg['type']} (expiring {leg['expiration']})" for leg in critical_legs]) + " faces immediate early assignment due to extrinsic value (time premium) decaying close to zero."
    else:
        assignment_comment = "ASSIGNMENT RISK NOMINAL: No short option legs currently exhibit critical early exercise risk. Extrinsic value remains sufficient across all short positions."

    recs = []
    if critical_assignment_count > 0:
        recs.append(f"**Close/Roll Critical Options**: Buy back the critical short {critical_legs[0]['ticker']} options to eliminate early assignment risk.")
    elif len(upcoming_dte_legs) > 0:
        recs.append(f"**Roll Short Options**: Roll the short {upcoming_dte_legs[0]['ticker']} options out to a further DTE to collect extrinsic premium and mitigate gamma pressure.")
    else:
        recs.append("**Monitor Option Extrinsics**: Hold current option legs but monitor extrinsic values closely as expiration approaches.")

    nvda_pos = next((p for p in positions if p.get("ticker") == "NVDA"), None)
    if nvda_pos and nvda_pos.get("size", 0) > 0:
        recs.append(f"**Trim Momentum Exposure**: Trim shares of NVDA or other high-beta tech components to release maintenance margin and reduce factor risk.")
    else:
        recs.append("**De-risk Growth Factors**: Rebalance high-growth sector exposure towards defensive value factors.")

    if var_99_pct > 10.0 or margin_ratio > 0.6:
        recs.append("**Purchase SPY Put Hedge**: Buy a protective 30-delta SPY Put option to establish a portfolio tail-risk hedge and lower aggregate VaR.")
    else:
        recs.append("**Optimize Excess Cash**: Deploy idle cash into SPY index shares to maintain baseline market-beta exposure.")

    bullets = "\n".join([f"- {r}" for r in recs])

    summary_report = f"""# Investment Committee Portfolio Summary Report

### 1. Performance & Capital Constraints Context
{perf_comment}

### 2. Systemic Risk Analysis
{sector_comment}

### 3. Assignment Risk Analysis
{assignment_comment}

### 4. Strategic Improvements
{bullets}
"""

    return {
        "debate_logs": debate_logs,
        "advisory_report": advisory_report,
        "recommendations": all_recs,
        "summary_report": summary_report
    }

# ----------------------------------------------------------------------
# LANGGRAPH STATE GRAPH & AGENT NODES FOR MACRO SENTIMENT FEED
# ----------------------------------------------------------------------

from app.services.risk_analytics import (
    parse_positions,
    calculate_factor_exposures,
    calculate_beta_weighted_delta,
    calculate_value_at_risk,
    get_spx_price,
    calculate_shock_scenario,
    calculate_compliance_alert,
    calculate_daily_expected_return,
    generate_greeks_commentary
)

class AgentState:
    def __init__(self, portfolio_state: Dict[str, Any], macro_event: Optional[Dict[str, Any]] = None, active_macro_events: Optional[List[Dict[str, Any]]] = None):
        self.portfolio_state = portfolio_state
        self.macro_event = macro_event
        self.active_macro_events = active_macro_events or []
        self.macro_sentiment_score = 0.0
        self.headline = ""
        self.volatility_adjustment = 0.0
        self.spot_shock_pct = 0.0
        self.risk_data = {}
        self.debate_logs = []
        self.advisory_report = ""
        self.summary_report = ""
        self.recommendations = []

async def macro_risk_agent_node(state: AgentState):
    """
    Macro Risk Agent: Ingests raw text feed, updates sentiment, and maps
    macro catalyst (sentiment, spot shock) to 99% VaR and factor exposures.
    """
    event = state.macro_event or {}
    state.headline = event.get("headline", "No active news stream.")
    state.macro_sentiment_score = event.get("sentiment", 0.0)
    state.volatility_adjustment = event.get("iv_adj", 0.0)
    state.spot_shock_pct = event.get("spot_shock", 0.0)
    
    sentiment_desc = "Neutral"
    if state.macro_sentiment_score > 0.3:
        sentiment_desc = "Bullish / Risk-On"
    elif state.macro_sentiment_score < -0.3:
        sentiment_desc = "Bearish / Risk-Off"

    # Evaluate active macro events context
    macro_summaries = []
    for ev in state.active_macro_events[:3]:
        h = ev.get("headline") or ev.get("title") or "Unknown"
        s = ev.get("sentiment", 0.0)
        p = ev.get("spot_shock", 0.0)
        macro_summaries.append(f"'{h}' (Sentiment: {s:+.2f}, Spot: {p:+.1f}%)")
    macro_context = "; ".join(macro_summaries) if macro_summaries else "No active macro events cached."

    # Factor exposure and VaR mappings
    factor_exposure = state.portfolio_state.get("factor_exposure", {})
    portfolio_factors = factor_exposure.get("portfolio_factors", {})
    growth = portfolio_factors.get("growth", 0.0)
    momentum = portfolio_factors.get("momentum", 0.0)
    var_99_pct = state.portfolio_state.get("value_at_risk", {}).get("var_99_pct", 0.0)
    
    state.debate_logs.append({
        "agent": "Macro Risk Agent",
        "avatar": "activity",
        "message": f"Evaluating active macro events buffer: {macro_context}. "
                   f"Mapping catalyst sentiment ({state.macro_sentiment_score:+.2f}) and spot shock ({state.spot_shock_pct:+.1f}%) "
                   f"to portfolio 99% VaR ({var_99_pct:.2f}%) and factor exposures (Growth: {growth:.2f}, Momentum: {momentum:.2f}). "
                   f"High volatility alerts require restructuring capital buffers and evaluating structural tail risk."
    })

async def options_specialist_agent_node(state: AgentState):
    """
    Options Specialist Agent: Evaluates Greek and pricing engine changes, focusing
    on how volatility shocks compress/expand gamma risk on near-dated short option legs.
    """
    risk_results = execute_agent_portfolio_calculations(
        state.portfolio_state,
        state.spot_shock_pct,
        state.volatility_adjustment
    )
    state.risk_data = risk_results
    
    sim_var = risk_results.get("value_at_risk", {}).get("var_99_pct", 0.0)
    
    # Calculate average IV adjustments from recent events
    iv_shifts = [ev.get("iv_adj", 0.0) for ev in state.active_macro_events[:3]]
    avg_iv_adj = sum(iv_shifts) / len(iv_shifts) if iv_shifts else state.volatility_adjustment

    # Check for short options or specifically PLTR calls (near-dated high-gamma legs)
    has_pltr = any(pos.get("ticker", "").upper() == "PLTR" for pos in state.portfolio_state.get("positions", []))
    target_leg_comment = " Specifically, near-dated PLTR short option legs are highly vulnerable to gamma risk acceleration." if has_pltr else " Short options expiring under 14 days face severe gamma expansion risk."

    state.debate_logs.append({
        "agent": "Options Specialist Agent",
        "avatar": "shield",
        "message": f"Analyzing Greeks under volatility shift of {avg_iv_adj:+.1f}%. "
                   f"Simulated portfolio 99% VaR has adjusted to {sim_var:.2f}% of net liquidation. "
                   f"Expanding implied volatility will compress extrinsic values and accelerate gamma risk on near-dated short options.{target_leg_comment} "
                   f"Recommending rolling or closing out near-dated high-gamma option legs immediately."
    })

async def pm_coordinator_node(state: AgentState):
    """
    PM Coordinator: Synthesizes risk metrics, maps catalyst to risk status change,
    and issues definitive trade recommendations in the Investment Committee Advisory Report.
    """
    summary = state.risk_data.get("portfolio_summary", {})
    net_liq = summary.get("net_liquidity", 5000.0)
    maint_margin = summary.get("maintenance_margin", 3000.0)
    daily_pnl = summary.get("daily_pnl", 0.0)
    var_99_pct = state.risk_data.get("value_at_risk", {}).get("var_99_pct", 0.0)
    margin_ratio = maint_margin / net_liq if net_liq > 0 else 0.0

    # 1. Map Macro Catalyst to a Clear Risk Status Change
    risk_status = "NOMINAL RISK STATUS"
    if margin_ratio > 0.80 or net_liq < 0 or var_99_pct > 15.0 or state.macro_sentiment_score < -0.5:
        risk_status = "CRITICAL RISK STATUS"
    elif margin_ratio > 0.60 or var_99_pct > 10.0 or state.macro_sentiment_score < -0.2:
        risk_status = "WARNING RISK STATUS"

    state.debate_logs.append({
        "agent": "Portfolio Manager Agent",
        "avatar": "briefcase",
        "message": f"Committee consensus locked. Determined portfolio risk state is '{risk_status}'. "
                   f"To mitigate tail risk and stabilize capital requirements, we must link our macro updates to immediate trade action."
    })

    # 2. Generate at least one definitive, executable trade recommendation
    if risk_status == "CRITICAL RISK STATUS" or state.macro_sentiment_score < -0.3:
        # Long protective index hedge
        state.recommendations.append({
            "id": "rec_macro_hedge",
            "ticker": "SPY",
            "type": "OPTION_COMBINATION",
            "action": "HEDGE",
            "description": "Deploy a protective index hedge: Stage a long protective SPY Put option spread to contain systemic tail-risk.",
            "trade_draft": {
                "ticker": "SPY",
                "type": "OPTION_COMBINATION",
                "action": "BUY",
                "size": 1,
                "legs": [
                    {"strike": 500.0, "type": "PUT", "expiration": "2026-07-17", "position_type": "LONG", "delta": -0.30}
                ]
            }
        })
        # Close out high gamma option legs
        state.recommendations.append({
            "id": "rec_close_gamma",
            "ticker": "PLTR",
            "type": "OPTION_COMBINATION",
            "action": "CLOSE",
            "description": "Close out near-dated high-gamma options legs: Buy back short option contracts with DTE <= 14 to eliminate assignment risk.",
            "trade_draft": {
                "ticker": "PLTR",
                "type": "OPTION_COMBINATION",
                "action": "BUY",
                "size": 1,
                "legs": [
                    {"strike": 30.0, "type": "CALL", "expiration": "2026-07-17", "position_type": "LONG", "delta": 0.50}
                ]
            }
        })
    else:
        # Default deploy recommendation or close options
        state.recommendations.append({
            "id": "rec_macro_deploy",
            "ticker": "SPY",
            "type": "EQUITY",
            "action": "BUY",
            "description": "Optimize capital efficiency: Buy 5 shares of SPY baseline index to capture positive risk-on momentum.",
            "trade_draft": {
                "ticker": "SPY",
                "type": "EQUITY",
                "size": 5,
                "avg_price": 540.0,
                "current_price": 540.0
            }
        })

    # Actionable Report Construction
    recs_bullets = "\n".join([f"- **{r['action']}**: {r['description']}" for r in state.recommendations])
    
    state.advisory_report = f"""# Investment Committee Advisory Report

## News Ingestion & Risk Briefing
* **Headline Catalyst:** "{state.headline}"
* **Committee Risk Assessment:** {risk_status}
* **Sentiment Metrics:** {state.macro_sentiment_score:+.2f} ({'Risk-Off Bearish' if state.macro_sentiment_score < -0.2 else 'Risk-On Bullish' if state.macro_sentiment_score > 0.2 else 'Neutral'})
* **Implied Volatility Shift:** {state.volatility_adjustment:+.1f}% IV Shock
* **Spot Price Shock Scenario:** {state.spot_shock_pct:+.1f}% Spot Shock

## Specialist Domain Summaries

### 1. Macro Risk Specialist
- Mapped active macro catalyst to portfolio factor concentrations. 
- Flagged portfolio 99% VaR shift to {var_99_pct:.2f}% of net liquidation.

### 2. Options Specialist
- Re-priced option chain and modeled gamma risk compression.
- Recommended immediate de-risking of near-dated high-gamma short legs.

---

## Actionable Trade Recommendations
To align our capital structures with these macro updates, we recommend executing the following adjustments in the Sandbox:

{recs_bullets}
"""

    state.summary_report = f"""# Macro Sentiment Risk Commentary

### Capital Constraints Context
- **Headline Shock**: {state.headline}
- **Net Liquidation (Shocked)**: ${net_liq:,.2f}
- **Maintenance Margin (Shocked)**: ${maint_margin:,.2f}
- **Simulated Daily P&L Shift**: ${daily_pnl:,.2f}

### Volatility Risk Assessment
- Active macro sentiment index is {state.macro_sentiment_score:+.2f}. 
- Simulated 99% portfolio VaR is {var_99_pct:.2f}% of Net Liquidation.
- Defensively manage near-dated options and high-beta momentum equities to safeguard compliance buffers.
"""

def execute_agent_portfolio_calculations(portfolio_state: dict, spot_shock_pct: float, iv_shock_pct: float) -> dict:
    try:
        raw_positions = []
        for pos in portfolio_state.get("positions", []):
            is_db_format = "underlying_symbol" in pos
            raw_pos = {
                "ticker": pos.get("underlying_symbol") if is_db_format else pos.get("ticker"),
                "type": pos.get("type", "OPTION_COMBINATION" if pos.get("legs") else "EQUITY"),
                "strategy_name": pos.get("name") if is_db_format else pos.get("strategy_name"),
                "size": pos.get("quantity") if is_db_format else pos.get("size", 1),
                "avg_price": pos.get("entry_price") if is_db_format else pos.get("avg_price"),
                "current_price": pos.get("underlying_price") if is_db_format else pos.get("current_price"),
                "underlying_beta_to_spx": pos.get("underlying_beta_to_spx", 1.0),
                "legs": [
                    {
                        "strike": leg.get("strike_price") if is_db_format else leg.get("strike"),
                        "type": (leg.get("option_type") if is_db_format else leg.get("type", "CALL")).upper(),
                        "expiration": leg.get("expiration_date") if is_db_format else leg.get("expiration"),
                        "position_type": ("LONG" if leg.get("action") == "BUY" else "SHORT") if is_db_format else leg.get("position_type", "SHORT"),
                        "delta": leg.get("greeks", {}).get("delta", 0.5) if is_db_format else leg.get("delta", 0.5),
                        "premium": leg.get("entry_premium") if is_db_format else leg.get("premium", 2.50)
                    }
                    for leg in pos.get("legs", [])
                ] if pos.get("legs") else []
            }
            raw_positions.append(raw_pos)
            
        parsed_positions = parse_positions(raw_positions)
        spx_price = get_spx_price()
        factor_exp = calculate_factor_exposures(parsed_positions)
        beta_weighted = calculate_beta_weighted_delta(parsed_positions, spx_price)
        var_limits = calculate_value_at_risk(parsed_positions)
        
        summary = portfolio_state.get("portfolio_summary", portfolio_state.get("summary", {}))
        net_liq = summary.get("net_liquidity", summary.get("net_liquidation", 5400.0))
        maint_margin = summary.get("maintenance_margin", summary.get("maint_margin_req", 3000.0))
        daily_pnl = summary.get("daily_pnl", summary.get("total_pnl", 0.0))
        
        compliance_status = calculate_compliance_alert(net_liq, maint_margin)
        daily_expected = calculate_daily_expected_return(parsed_positions, net_liq)
        
        pro_forma_data = calculate_shock_scenario(
            parsed_positions=parsed_positions,
            spot_shock_pct=spot_shock_pct,
            iv_shock_pct=iv_shock_pct,
            initial_summary={
                "net_liquidity": net_liq,
                "maintenance_margin": maint_margin,
                "daily_pnl": daily_pnl
            }
        )
            
        response_positions = []
        for pos in parsed_positions:
            response_positions.append({
                "ticker": pos["ticker"],
                "type": pos["type"],
                "strategy_name": pos.get("strategy_name"),
                "size": pos["size"],
                "price": pos["price"],
                "beta": pos["beta"],
                "delta": pos["delta"],
                "market_value": pos["market_value"],
                "delta_equivalent": pos["delta_equivalent"],
                "early_assignment_risk": pos.get("early_assignment_risk"),
                "days_to_liquidate": pos["days_to_liquidate"],
                "adv": pos["adv"],
                "legs": [
                    {
                        "strike": leg["strike"],
                        "type": leg["type"],
                        "expiration": leg["expiration"],
                        "position_type": leg["position_type"],
                        "delta": leg["delta"],
                        "price": leg["price"],
                        "early_assignment_risk": leg["early_assignment_risk"]
                    }
                    for leg in pos.get("legs", [])
                ]
            })
            
        return {
            "portfolio_summary": {
                "net_liquidity": pro_forma_data["net_liquidity"] if pro_forma_data else net_liq,
                "excess_liquidity": pro_forma_data["excess_liquidity"] if pro_forma_data else (net_liq - maint_margin),
                "maintenance_margin": pro_forma_data["maintenance_margin"] if pro_forma_data else maint_margin,
                "daily_pnl": pro_forma_data["daily_pnl"] if pro_forma_data else daily_pnl
            },
            "beta_weighted_delta": {
                "total_beta_weighted_delta_shares": beta_weighted["total_beta_weighted_delta_shares"],
                "total_beta_weighted_delta_dollars": beta_weighted["total_beta_weighted_delta_dollars"],
                "spx_index_price": beta_weighted["spx_index_price"],
                "positions": [
                    {
                        "ticker": p["ticker"],
                        "strategy": p["strategy"],
                        "position_delta": p["position_delta"],
                        "beta": p["beta"],
                        "beta_weighted_delta_shares": p["beta_weighted_delta_shares"],
                        "beta_weighted_delta_dollars": p["beta_weighted_delta_dollars"],
                        "delta_equivalent": p["delta_equivalent"]
                    }
                    for p in beta_weighted["positions"]
                ]
            },
            "factor_exposure": {
                "portfolio_factors": {
                    "growth": factor_exp["portfolio_factors"]["growth"],
                    "momentum": factor_exp["portfolio_factors"]["momentum"],
                    "value": factor_exp["portfolio_factors"]["value"]
                },
                "sector_matrix": [
                    {
                        "sector": s["sector"],
                        "exposure": s["exposure"],
                        "percentage": s["percentage"]
                    }
                    for s in factor_exp["sector_matrix"]
                ]
            },
            "value_at_risk": {
                "var_95_dollars": var_limits["var_95_dollars"] * (1 + iv_shock_pct/100.0),
                "var_95_pct": var_limits["var_95_pct"] * (1 + iv_shock_pct/100.0),
                "var_99_dollars": var_limits["var_99_dollars"] * (1 + iv_shock_pct/100.0),
                "var_99_pct": var_limits["var_99_pct"] * (1 + iv_shock_pct/100.0),
                "lookback_days_actual": var_limits["lookback_days_actual"]
            },
            "compliance": {
                "status": compliance_status["status"],
                "ratio": compliance_status["ratio"],
                "message": compliance_status["message"]
            },
            "pro_forma": {
                "net_liquidity": pro_forma_data["net_liquidity"],
                "maintenance_margin": pro_forma_data["maintenance_margin"],
                "excess_liquidity": pro_forma_data["excess_liquidity"],
                "daily_pnl": pro_forma_data["daily_pnl"],
                "net_liquidity_change": pro_forma_data["net_liquidity_change"],
                "positions": [
                    {
                        "ticker": p["ticker"],
                        "type": p["type"],
                        "value_initial": p["value_initial"],
                        "value_shocked": p["value_shocked"],
                        "value_change": p["value_change"]
                    }
                    for p in pro_forma_data["positions"]
                ]
            } if pro_forma_data else None,
            "positions": response_positions,
            "daily_expected_return": {
                "daily_expected_return_usd": daily_expected["daily_expected_return_usd"],
                "expected_return_percentage": daily_expected["expected_return_percentage"],
                "regime_status": daily_expected["regime_status"]
            }
        }
    except Exception as e:
        logger.error(f"Failed execute_agent_portfolio_calculations: {e}")
        return {"error": str(e)}

async def run_langgraph_committee_feed(portfolio_state: Dict[str, Any], macro_event: Dict[str, Any], active_macro_events: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    state = AgentState(portfolio_state, macro_event, active_macro_events)
    
    # 1. Macro Risk Agent Node
    await macro_risk_agent_node(state)
    
    # 2. Options Specialist Node
    await options_specialist_agent_node(state)
    
    # 3. PM Coordinator Node
    await pm_coordinator_node(state)
    
    return {
        "portfolio_summary": state.risk_data.get("portfolio_summary", {}),
        "beta_weighted_delta": state.risk_data.get("beta_weighted_delta", {}),
        "factor_exposure": state.risk_data.get("factor_exposure", {}),
        "value_at_risk": state.risk_data.get("value_at_risk", {}),
        "compliance": state.risk_data.get("compliance", {}),
        "pro_forma": state.risk_data.get("pro_forma", {}),
        "positions": state.risk_data.get("positions", []),
        "daily_expected_return": state.risk_data.get("daily_expected_return", {}),
        "debate_logs": state.debate_logs,
        "advisory_report": state.advisory_report,
        "summary_report": state.summary_report,
        "recommendations": state.recommendations,
        "greeks_commentary": state.summary_report,
        "macro_headline": state.headline,
        "macro_sentiment_score": state.macro_sentiment_score
    }


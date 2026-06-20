import math
import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple
from app.services.pricing import calculate_binomial_american

# Default beta values relative to SPX
DEFAULT_BETAS = {
    "SPY": 1.0,
    "QQQ": 1.20,
    "TQQQ": 3.02,
    "NVDA": 1.85,
    "MSFT": 1.25,
    "AAPL": 1.20,
    "AMD": 1.70,
    "TSLA": 1.50,
    "AMZN": 1.15,
    "VRT": 1.40,
    "NBIS": 1.00
}

# Default factor exposures (Growth, Momentum, Value) for fallback/standard mapping
DEFAULT_FACTORS = {
    "TQQQ": {"growth": 0.90, "momentum": 0.85, "value": 0.10, "sector": "Technology"},
    "NVDA": {"growth": 0.95, "momentum": 0.95, "value": 0.15, "sector": "Technology"},
    "MSFT": {"growth": 0.75, "momentum": 0.65, "value": 0.40, "sector": "Technology"},
    "AAPL": {"growth": 0.70, "momentum": 0.60, "value": 0.45, "sector": "Technology"},
    "SPY": {"growth": 0.50, "momentum": 0.50, "value": 0.50, "sector": "Market"},
    "QQQ": {"growth": 0.75, "momentum": 0.70, "value": 0.30, "sector": "Technology"},
    "AMZN": {"growth": 0.80, "momentum": 0.70, "value": 0.35, "sector": "Consumer Cyclical"},
    "TSLA": {"growth": 0.85, "momentum": 0.75, "value": 0.10, "sector": "Consumer Cyclical"},
    "AMD": {"growth": 0.90, "momentum": 0.80, "value": 0.15, "sector": "Technology"},
    "VRT": {"growth": 0.80, "momentum": 0.90, "value": 0.20, "sector": "Industrial"},
    "NBIS": {"growth": 0.40, "momentum": 0.50, "value": 0.60, "sector": "Healthcare"}
}

def get_asset_beta(ticker: str) -> float:
    """Retrieve asset beta or return default."""
    ticker_upper = ticker.upper()
    if ticker_upper in DEFAULT_BETAS:
        return DEFAULT_BETAS[ticker_upper]
    try:
        t = yf.Ticker(ticker_upper)
        beta = t.info.get("beta")
        if beta is not None:
            return float(beta)
    except Exception:
        pass
    return 1.0

def get_spx_price() -> float:
    """Fetch S&P 500 spot index price with standard default fallback."""
    try:
        ticker = yf.Ticker("^GSPC")
        hist = ticker.history(period="1d")
        if not hist.empty:
            return float(hist["Close"].iloc[-1])
    except Exception:
        pass
    return 5400.00

def get_asset_price(ticker: str) -> float:
    """Fetch current asset price with default fallbacks."""
    ticker_upper = ticker.upper()
    try:
        t = yf.Ticker(ticker_upper)
        hist = t.history(period="1d")
        if not hist.empty:
            return float(hist["Close"].iloc[-1])
    except Exception:
        pass
    
    # Fallbacks for testing
    fallbacks = {"TQQQ": 80.0, "NVDA": 223.86, "MSFT": 380.0, "SPY": 540.0}
    return fallbacks.get(ticker_upper, 100.0)

def parse_positions(positions_raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Parse equities and multi-leg option combinations to extract position deltas,
    beta parameters, valuations, discrete dividends, average daily volumes,
    and days to liquidate.
    """
    parsed_positions = []
    
    for pos in positions_raw:
        ticker = pos.get("ticker", "").upper()
        pos_type = pos.get("type", "EQUITY")
        beta = pos.get("underlying_beta_to_spx")
        if beta is None:
            beta = get_asset_beta(ticker)
            
        adv = get_asset_adv(ticker)
            
        if pos_type == "EQUITY":
            size = pos.get("size", 1)
            current_price = pos.get("current_price") or pos.get("avg_price") or get_asset_price(ticker)
            position_delta = float(size)  # Equity delta is 1 per share
            market_value = float(size * current_price)
            days_to_liq = float(abs(size)) / (0.10 * adv) if adv > 0 else 0.0
            
            parsed_positions.append({
                "ticker": ticker,
                "type": "EQUITY",
                "size": size,
                "price": current_price,
                "beta": beta,
                "delta": position_delta,
                "market_value": market_value,
                "delta_equivalent": market_value,
                "days_to_liquidate": round(days_to_liq, 4),
                "adv": adv,
                "legs": []
            })
            
        elif pos_type == "OPTION_COMBINATION" or pos_type == "OPTION":
            size = pos.get("size", 1)
            legs = pos.get("legs", [])
            underlying_price = pos.get("underlying_price") or get_asset_price(ticker)
            
            net_delta = 0.0
            net_theta = 0.0
            net_vega = 0.0
            option_market_value = 0.0
            
            parsed_legs = []
            divs = get_upcoming_dividends(ticker)
            
            for leg in legs:
                leg_delta_in = float(leg.get("delta", 0.0))
                leg_type = leg.get("type", "CALL").upper()
                leg_strike = float(leg.get("strike", 100.0))
                leg_exp = leg.get("expiration", "2026-06-05")
                leg_action = "BUY" if leg.get("position_type", "LONG").upper() == "LONG" else "SELL"
                leg_qty = int(leg.get("quantity") or 1)
                
                # Expiration parsing
                try:
                    exp_dt = datetime.strptime(leg_exp, "%Y-%m-%d").date()
                    today = datetime.today().date()
                    days_to_exp = max(1.0, float((exp_dt - today).days))
                except Exception:
                    days_to_exp = 30.0
                    
                # Calculate via CRR Binomial lattice pricing
                binom_res = calculate_binomial_american(
                    symbol=ticker,
                    spot_price=underlying_price,
                    strike_price=leg_strike,
                    days_to_expiration=days_to_exp,
                    implied_volatility=0.28, # default fallback
                    risk_free_rate=0.05,
                    option_type=leg_type,
                    quantity=leg_qty,
                    action=leg_action,
                    dividends=divs
                )
                
                leg_delta = binom_res["greeks"]["delta"]
                if leg_type == "PUT" and leg_delta > 0:
                    leg_delta = -leg_delta
                    
                pos_type_mult = 1.0 if leg_action == "BUY" else -1.0
                leg_pos_delta = leg_delta * float(size) * 100.0 * pos_type_mult
                net_delta += leg_pos_delta
                
                leg_theta = binom_res["greeks"]["theta"]
                leg_vega = binom_res["greeks"]["vega"]
                net_theta += leg_theta * float(size) * 100.0 * pos_type_mult
                net_vega += leg_vega * float(size) * 100.0 * pos_type_mult
                
                option_market_value += binom_res["price"] * float(size) * 100.0 * pos_type_mult
                
                parsed_legs.append({
                    "strike": leg_strike,
                    "type": leg_type,
                    "expiration": leg_exp,
                    "position_type": leg.get("position_type", "LONG"),
                    "delta": leg_delta,
                    "theta": leg_theta,
                    "vega": leg_vega,
                    "price": binom_res["price"],
                    "early_assignment_risk": binom_res["early_assignment_risk"]
                })
                
            delta_equivalent = net_delta * underlying_price
            days_to_liq = float(abs(size) * 100.0) / (0.10 * adv) if adv > 0 else 0.0
            
            # Determine overall position early assignment risk
            position_risk = "Low"
            if any(l["early_assignment_risk"] == "Critical" for l in parsed_legs):
                position_risk = "Critical"
            elif any(l["early_assignment_risk"] == "Medium" for l in parsed_legs):
                position_risk = "Medium"
                
            parsed_positions.append({
                "ticker": ticker,
                "type": "OPTION_COMBINATION",
                "strategy_name": pos.get("strategy_name", "Option Spread"),
                "size": size,
                "price": underlying_price,
                "beta": beta,
                "delta": net_delta,
                "theta": net_theta,
                "vega": net_vega,
                "market_value": option_market_value,
                "delta_equivalent": delta_equivalent,
                "days_to_liquidate": round(days_to_liq, 4),
                "adv": adv,
                "early_assignment_risk": position_risk,
                "legs": parsed_legs
            })
            
    return parsed_positions

# ----------------------------------------------------------------------
# F-01: FACTOR EXPOSURE MATRIX
# ----------------------------------------------------------------------

def calculate_factor_exposures(parsed_positions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate portfolio-weighted exposures across Growth, Momentum, Value, and Sector Beta
    using delta-equivalent asset weights.
    """
    total_abs_exposure = sum(abs(pos["delta_equivalent"]) for pos in parsed_positions)
    
    weighted_growth = 0.0
    weighted_momentum = 0.0
    weighted_value = 0.0
    
    sector_exposures = {}
    
    if total_abs_exposure > 0:
        for pos in parsed_positions:
            ticker = pos["ticker"]
            exposure = abs(pos["delta_equivalent"])
            weight = exposure / total_abs_exposure
            
            # Fetch factor parameters
            factors = DEFAULT_FACTORS.get(ticker, {"growth": 0.5, "momentum": 0.5, "value": 0.5, "sector": "Market"})
            
            weighted_growth += factors["growth"] * weight
            weighted_momentum += factors["momentum"] * weight
            weighted_value += factors["value"] * weight
            
            sect = factors["sector"]
            sector_exposures[sect] = sector_exposures.get(sect, 0.0) + (pos["delta_equivalent"])
            
    # Format sector allocations as percentages of absolute exposure
    sector_allocations = []
    if total_abs_exposure > 0:
        for sect, val in sector_exposures.items():
            sector_allocations.append({
                "sector": sect,
                "exposure": val,
                "percentage": round((abs(val) / total_abs_exposure) * 100, 2)
            })
            
    return {
        "portfolio_factors": {
            "growth": round(weighted_growth, 4),
            "momentum": round(weighted_momentum, 4),
            "value": round(weighted_value, 4)
        },
        "sector_matrix": sector_allocations
    }

# ----------------------------------------------------------------------
# F-02: BETA-WEIGHTED DELTA ENGINE
# ----------------------------------------------------------------------

def calculate_beta_weighted_delta(parsed_positions: List[Dict[str, Any]], spx_price: float) -> Dict[str, Any]:
    """
    Beta-Weighted Delta = Position Delta * (Asset Price / SPX Price) * Asset Beta.
    Aggregate across all assets to find the total S&P 500 equivalent exposure.
    """
    total_beta_delta_shares = 0.0
    position_details = []
    
    for pos in parsed_positions:
        ticker = pos["ticker"]
        pos_delta = pos["delta"]
        asset_price = pos["price"]
        beta = pos["beta"]
        
        # Formula implementation
        beta_weighted_delta_shares = pos_delta * (asset_price / spx_price) * beta
        beta_weighted_delta_dollars = beta_weighted_delta_shares * spx_price
        
        total_beta_delta_shares += beta_weighted_delta_shares
        
        position_details.append({
            "ticker": ticker,
            "strategy": pos.get("strategy_name") or "Equity",
            "position_delta": round(pos_delta, 4),
            "beta": round(beta, 2),
            "beta_weighted_delta_shares": round(beta_weighted_delta_shares, 4),
            "beta_weighted_delta_dollars": round(beta_weighted_delta_dollars, 2),
            "delta_equivalent": round(pos["delta_equivalent"], 2)
        })
        
    total_beta_delta_dollars = total_beta_delta_shares * spx_price
    
    return {
        "total_beta_weighted_delta_shares": round(total_beta_delta_shares, 4),
        "total_beta_weighted_delta_dollars": round(total_beta_delta_dollars, 2),
        "spx_index_price": spx_price,
        "positions": position_details
    }

# ----------------------------------------------------------------------
# F-03: VALUE-AT-RISK (VaR) ENGINE
# ----------------------------------------------------------------------

def calculate_value_at_risk(
    parsed_positions: List[Dict[str, Any]], 
    days_lookback: int = 100, 
    confidence_levels: List[float] = [0.95, 0.99]
) -> Dict[str, Any]:
    """
    Calculate 1-day Value-at-Risk (VaR) using historical simulation.
    Downloads 100-day lookback daily return arrays for the portfolio components.
    """
    # 1. Fetch historical returns for unique tickers
    unique_tickers = list(set(pos["ticker"] for pos in parsed_positions))
    
    historical_returns = {}
    end_date = datetime.today()
    start_date = end_date - timedelta(days=days_lookback * 2)  # Extra buffer to guarantee 100 trading days
    
    # Download actual returns from yfinance
    for ticker in unique_tickers:
        try:
            t = yf.Ticker(ticker)
            df = t.history(start=start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'))
            if not df.empty:
                df["Returns"] = df["Close"].pct_change()
                returns = df["Returns"].dropna().tail(days_lookback).values
                if len(returns) >= 30: # Check if we have sufficient history
                    historical_returns[ticker] = returns
        except Exception:
            pass
            
    # 2. Statistical fallback if database/internet offline or yfinance rate-limited
    # Generates standard normal returns based on asset beta and market volatility
    spx_vol = 0.15 # annual market volatility
    daily_spx_vol = spx_vol / math.sqrt(252.0)
    
    simulated_len = days_lookback
    np.random.seed(42)  # Deterministic seed for reproducible testing
    
    # Generate market benchmark daily returns
    market_returns = np.random.normal(0, daily_spx_vol, simulated_len)
    
    for pos in parsed_positions:
        ticker = pos["ticker"]
        if ticker not in historical_returns:
            beta = pos["beta"]
            # Idiosyncratic volatility: assume tech stocks have high residual vol
            residual_vol = 0.25 if beta > 1.5 else 0.15
            daily_residual_vol = residual_vol / math.sqrt(252.0)
            
            # Stock return = Beta * Market return + residual noise
            noise = np.random.normal(0, daily_residual_vol, simulated_len)
            stock_returns = beta * market_returns + noise
            historical_returns[ticker] = stock_returns
            
    # 3. Aggregate returns to build historical portfolio daily return series
    # Weights are based on Delta-Equivalent exposures
    total_delta_equivalent = sum(abs(pos["delta_equivalent"]) for pos in parsed_positions)
    
    # Handle empty portfolio case
    if total_delta_equivalent == 0:
        return {
            "var_95_dollars": 0.0,
            "var_95_pct": 0.0,
            "var_99_dollars": 0.0,
            "var_99_pct": 0.0,
            "lookback_days_actual": 0
        }
        
    portfolio_daily_pnl = np.zeros(simulated_len)
    
    for pos in parsed_positions:
        ticker = pos["ticker"]
        delta_eq = pos["delta_equivalent"]
        
        # Get returns for this ticker (ensure matching length)
        returns = historical_returns[ticker]
        if len(returns) < simulated_len:
            # Pad return array with zeros if length mismatched
            padded = np.zeros(simulated_len)
            padded[:len(returns)] = returns
            returns = padded
        elif len(returns) > simulated_len:
            returns = returns[:simulated_len]
            
        # Daily Dollar P&L contribution = Delta Equivalent Value * daily asset return
        leg_pnl = delta_eq * returns
        portfolio_daily_pnl += leg_pnl
        
    # Sort daily P&L outcomes from largest loss to largest gain
    sorted_pnl = np.sort(portfolio_daily_pnl)
    
    var_results = {}
    total_portfolio_value = sum(pos["market_value"] for pos in parsed_positions)
    if total_portfolio_value <= 0:
        # If net portfolio option value is credit/zero, use absolute delta equivalent exposure to normalize %
        total_portfolio_value = total_delta_equivalent
        
    for conf in confidence_levels:
        # Percentile index: e.g. for 95% confidence on 100 days, it is the 5th percentile index (100 - 95 = 5)
        percentile = 1.0 - conf
        idx = int(math.ceil(percentile * len(sorted_pnl))) - 1
        idx = max(0, min(idx, len(sorted_pnl) - 1))
        
        # VaR represents a loss limit (positive value indicating loss magnitude)
        var_dollar = -sorted_pnl[idx]
        var_dollar = max(0.0, var_dollar) # Only record positive loss boundaries
        var_pct = (var_dollar / total_portfolio_value) * 100.0
        
        conf_str = f"{int(conf * 100)}"
        var_results[f"var_{conf_str}_dollars"] = round(var_dollar, 2)
        var_results[f"var_{conf_str}_pct"] = round(var_pct, 2)
        
    var_results["lookback_days_actual"] = simulated_len
    return var_results

def get_upcoming_dividends(ticker: str) -> List[Dict[str, Any]]:
    """Retrieve dynamic ex-dividend schedule or return mock/standard fallbacks."""
    ticker_upper = ticker.upper()
    try:
        t = yf.Ticker(ticker_upper)
        ex_div_timestamp = t.info.get("exDividendDate") or t.info.get("ex_dividend_date")
        if ex_div_timestamp:
            ex_div_date = datetime.fromtimestamp(ex_div_timestamp).date()
            today = datetime.today().date()
            days_to_div = (ex_div_date - today).days
            if 0 < days_to_div < 90:
                div_amount = t.info.get("lastDividendValue") or t.info.get("dividendRate") or 0.50
                return [{"days_to_dividend": days_to_div, "amount": float(div_amount)}]
    except Exception:
        pass
        
    fallbacks = {
        "SPY": [{"days_to_dividend": 3, "amount": 1.90}],
        "MSFT": [{"days_to_dividend": 45, "amount": 0.75}],
        "AAPL": [{"days_to_dividend": 50, "amount": 0.25}],
        "TQQQ": [{"days_to_dividend": 45, "amount": 0.15}],
        "NVDA": [{"days_to_dividend": 60, "amount": 0.01}]
    }
    return fallbacks.get(ticker_upper, [])

def get_asset_adv(ticker: str) -> float:
    """Retrieve dynamic market Average Daily Volume (ADV) or return defaults."""
    ticker_upper = ticker.upper()
    try:
        t = yf.Ticker(ticker_upper)
        adv = t.info.get("averageVolume") or t.info.get("averageVolume10days") or t.info.get("volume")
        if adv is not None:
            return float(adv)
    except Exception:
        pass
        
    fallbacks = {
        "SPY": 80000000.0,
        "QQQ": 45000000.0,
        "TQQQ": 60000000.0,
        "NVDA": 50000000.0,
        "MSFT": 25000000.0,
        "AAPL": 50000000.0,
        "AMD": 60000000.0,
        "TSLA": 90000000.0,
        "VRT": 4000000.0,
        "NBIS": 50000.0
    }
    return fallbacks.get(ticker_upper, 1000000.0)

def calculate_shock_scenario(
    parsed_positions: List[Dict[str, Any]],
    spot_shock_pct: float,
    iv_shock_pct: float,
    initial_summary: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Simulate macroeconomic shocks by adjusting spot prices and implied volatilities,
    and calculating the pro-forma impact on Net Liquidity and Excess Margin.
    """
    total_val_change = 0.0
    pro_forma_positions = []
    
    for pos in parsed_positions:
        ticker = pos["ticker"]
        pos_type = pos["type"]
        size = pos["size"]
        
        S_initial = pos["price"]
        S_shocked = S_initial * (1.0 + spot_shock_pct / 100.0)
        
        if pos_type == "EQUITY":
            val_initial = pos["market_value"]
            val_shocked = size * S_shocked
            val_change = val_shocked - val_initial
            total_val_change += val_change
            
            pro_forma_positions.append({
                "ticker": ticker,
                "type": "EQUITY",
                "value_initial": val_initial,
                "value_shocked": val_shocked,
                "value_change": val_change
            })
            
        elif pos_type == "OPTION_COMBINATION":
            val_initial = pos["market_value"]
            val_shocked = 0.0
            
            for leg in pos["legs"]:
                leg_strike = leg["strike"]
                leg_type = leg["type"]
                leg_exp = leg["expiration"]
                leg_action = "BUY" if leg["position_type"].upper() == "LONG" else "SELL"
                leg_qty = 1
                
                try:
                    exp_dt = datetime.strptime(leg_exp, "%Y-%m-%d").date()
                    today = datetime.today().date()
                    days_to_exp = max(1.0, float((exp_dt - today).days))
                except Exception:
                    days_to_exp = 30.0
                    
                iv_initial = 0.28
                iv_shocked = iv_initial * (1.0 + iv_shock_pct / 100.0)
                iv_shocked = max(0.001, iv_shocked)
                
                divs = get_upcoming_dividends(ticker)
                
                binom_res_shocked = calculate_binomial_american(
                    symbol=ticker,
                    spot_price=S_shocked,
                    strike_price=leg_strike,
                    days_to_expiration=days_to_exp,
                    implied_volatility=iv_shocked,
                    risk_free_rate=0.05,
                    option_type=leg_type,
                    quantity=leg_qty,
                    action=leg_action,
                    dividends=divs
                )
                
                pos_type_mult = 1.0 if leg_action == "BUY" else -1.0
                val_shocked += binom_res_shocked["price"] * float(size) * 100.0 * pos_type_mult
                
            val_change = val_shocked - val_initial
            total_val_change += val_change
            
            pro_forma_positions.append({
                "ticker": ticker,
                "type": "OPTION_COMBINATION",
                "value_initial": val_initial,
                "value_shocked": val_shocked,
                "value_change": val_change
            })
            
    initial_net_liq = initial_summary.get("net_liquidity", 5000.0)
    pro_forma_net_liq = initial_net_liq + total_val_change
    
    initial_maint_margin = initial_summary.get("maintenance_margin", 3000.0)
    
    maint_margin_shocked = initial_maint_margin
    for pos in parsed_positions:
        ticker = pos["ticker"]
        pos_type = pos["type"]
        size = pos["size"]
        S_initial = pos["price"]
        S_shocked = S_initial * (1.0 + spot_shock_pct / 100.0)
        
        if pos_type == "EQUITY":
            old_margin = abs(pos["market_value"]) * 0.30
            new_margin = abs(size * S_shocked) * 0.30
            maint_margin_shocked += (new_margin - old_margin)
        elif pos_type == "OPTION_COMBINATION":
            delta_eq = pos["delta_equivalent"]
            spot_change_pct = spot_shock_pct / 100.0
            loss = - (delta_eq * spot_change_pct)
            if loss > 0:
                maint_margin_shocked += loss * 0.20
                
    maint_margin_shocked = max(0.0, maint_margin_shocked)
    pro_forma_excess_liq = pro_forma_net_liq - maint_margin_shocked
    
    return {
        "net_liquidity": round(pro_forma_net_liq, 2),
        "maintenance_margin": round(maint_margin_shocked, 2),
        "excess_liquidity": round(pro_forma_excess_liq, 2),
        "daily_pnl": round(initial_summary.get("daily_pnl", 0.0) + total_val_change, 2),
        "net_liquidity_change": round(total_val_change, 2),
        "positions": pro_forma_positions
    }

def calculate_compliance_alert(net_liquidity: float, maintenance_margin: float) -> Dict[str, Any]:
    """
    Calculate compliance alerts for maintenance margin ratio limits.
    """
    if net_liquidity <= 0:
        return {
            "status": "CRITICAL_VIOLATION",
            "ratio": 999.0,
            "message": "CRITICAL VIOLATION: Net Liquidation value is negative or zero. Account is in liquidation/margin call state."
        }
        
    ratio = maintenance_margin / net_liquidity
    if ratio > 0.80:
        return {
            "status": "CRITICAL_VIOLATION",
            "ratio": round(ratio, 4),
            "message": f"CRITICAL VIOLATION: Maintenance Margin is {ratio*100:.1f}% of Net Liquidation value (exceeds 80% hard limit)."
        }
    elif ratio > 0.60:
        return {
            "status": "SOFT_WARNING",
            "ratio": round(ratio, 4),
            "message": f"SOFT WARNING: Maintenance Margin is {ratio*100:.1f}% of Net Liquidation value (exceeds 60% soft warning limit)."
        }
        
    return {
        "status": "NOMINAL",
        "ratio": round(ratio, 4),
        "message": f"NOMINAL: Maintenance Margin is {ratio*100:.1f}% of Net Liquidation value (within 60% standard limit)."
    }


def calculate_daily_expected_return(
    parsed_positions: List[Dict[str, Any]],
    net_liquidity: float,
    days_lookback: int = 100
) -> Dict[str, Any]:
    """
    Calculate daily portfolio expected return (mean) based on historical returns
    for equities and theta decay for options.
    """
    # 1. Fetch historical returns for unique tickers
    unique_tickers = list(set(pos["ticker"] for pos in parsed_positions))
    historical_returns = {}
    end_date = datetime.today()
    start_date = end_date - timedelta(days=days_lookback * 2)
    
    for ticker in unique_tickers:
        try:
            t = yf.Ticker(ticker)
            df = t.history(start=start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'))
            if not df.empty:
                df["Returns"] = df["Close"].pct_change()
                returns = df["Returns"].dropna().tail(days_lookback).values
                if len(returns) >= 30:
                    historical_returns[ticker] = returns
        except Exception:
            pass
            
    # Statistical fallback if offline or yfinance rate-limited
    spx_vol = 0.15
    daily_spx_vol = spx_vol / math.sqrt(252.0)
    simulated_len = days_lookback
    np.random.seed(42)
    market_returns = np.random.normal(0, daily_spx_vol, simulated_len)
    
    for pos in parsed_positions:
        ticker = pos["ticker"]
        if ticker not in historical_returns:
            beta = pos["beta"]
            residual_vol = 0.25 if beta > 1.5 else 0.15
            daily_residual_vol = residual_vol / math.sqrt(252.0)
            noise = np.random.normal(0, daily_residual_vol, simulated_len)
            stock_returns = beta * market_returns + noise
            historical_returns[ticker] = stock_returns

    # 2. Calculate daily dollar expectations
    equity_exp_dollars = 0.0
    options_exp_dollars = 0.0
    
    for pos in parsed_positions:
        ticker = pos["ticker"]
        pos_type = pos["type"]
        size = pos["size"]
        
        if pos_type == "EQUITY":
            returns = historical_returns[ticker]
            mean_return = float(np.mean(returns))
            market_val = pos["market_value"]
            equity_exp_dollars += mean_return * market_val
        elif pos_type in ("OPTION_COMBINATION", "OPTION"):
            for leg in pos.get("legs", []):
                leg_theta = leg.get("theta", 0.0)
                pos_type_mult = 1.0 if leg.get("position_type", "LONG").upper() == "LONG" else -1.0
                leg_pos_theta = leg_theta * float(size) * 100.0 * pos_type_mult
                options_exp_dollars += leg_pos_theta

    daily_expected_return_usd = equity_exp_dollars + options_exp_dollars
    expected_return_percentage = (daily_expected_return_usd / net_liquidity) * 100.0 if net_liquidity > 0 else 0.0
    
    if daily_expected_return_usd > 0.01:
        regime_status = "BULLISH"
    elif daily_expected_return_usd < -0.01:
        regime_status = "BEARISH"
    else:
        regime_status = "NEUTRAL"
        
    return {
        "daily_expected_return_usd": round(daily_expected_return_usd, 2),
        "expected_return_percentage": round(expected_return_percentage, 4),
        "regime_status": regime_status
    }


def generate_greeks_commentary(
    parsed_positions: List[Dict[str, Any]],
    daily_expected: Dict[str, Any]
) -> str:
    """
    Generate structured, institutional-grade Markdown commentary evaluating the portfolio Greeks
    (Delta, Theta, Vega) and Daily Expected Return.
    """
    net_delta = sum(pos["delta"] for pos in parsed_positions)
    net_theta = sum(pos.get("theta", 0.0) for pos in parsed_positions)
    net_vega = sum(pos.get("vega", 0.0) for pos in parsed_positions)
    
    val_usd = daily_expected["daily_expected_return_usd"]
    pct = daily_expected["expected_return_percentage"]
    regime = daily_expected["regime_status"]
    
    # 1. Delta (Directional)
    if abs(net_delta) < 150.0:
        delta_desc = "controlled/neutral directional exposure"
        delta_advice = "The portfolio is insulated from sudden underlying spot price shocks."
    elif net_delta >= 150.0:
        delta_desc = f"net long directional exposure (Net Delta: {net_delta:.2f})"
        delta_advice = "The portfolio will benefit from upward asset price movements, but faces downside tail risk."
    else:
        delta_desc = f"net short directional exposure (Net Delta: {net_delta:.2f})"
        delta_advice = "The portfolio has a bearish drift, benefiting from down moves in underlyings."
        
    # 2. Theta (Time Decay)
    if net_theta > 2.0:
        theta_desc = f"highly positive time-decay yield (Net Theta: +${net_theta:.2f}/day)"
        theta_details = "The options book is earning daily premium as time passes."
    elif net_theta < -2.0:
        theta_desc = f"negative time-decay decay drag (Net Theta: {net_theta:.2f}/day)"
        theta_details = "Holding significant long options premium that is decaying daily."
    else:
        theta_desc = f"minimal time-decay profile (Net Theta: {net_theta:.2f}/day)"
        theta_details = "Time premium decay is not a primary driver of returns."
        
    # 3. Vega (Volatility Sensitivity)
    if net_vega > 5.0:
        vega_desc = f"long vega position (Net Vega: +${net_vega:.2f}/% IV change)"
        vega_details = "The portfolio is a net buyer of volatility; rising market uncertainty will expand profit boundaries."
    elif net_vega < -5.0:
        vega_desc = f"short vega position (Net Vega: {net_vega:.2f}/% IV change)"
        vega_details = "The portfolio is a net seller of volatility; vulnerable to sudden spikes in implied volatility (volatility shocks)."
    else:
        vega_desc = f"low vega sensitivity (Net Vega: {net_vega:.2f}/% IV change)"
        vega_details = "Changes in implied volatility have a minor impact on overall portfolio valuation."
        
    # Combined rules
    is_delta_controlled = abs(net_delta) < 150.0
    is_theta_positive = net_theta > 1.0
    
    if is_theta_positive and is_delta_controlled:
        strategy_summary = (
            "The portfolio is successfully capturing time premium via short options structures (like our active TQQQ spreads) "
            "while maintaining a controlled directional exposure."
        )
    else:
        strategy_summary = (
            "The portfolio's current options layout is focused on directional or volatility exposure rather than pure time premium harvesting."
        )
        
    commentary = (
        f"### AI Risk & Performance Commentary\n\n"
        f"The portfolio is currently in a **{regime}** regime status. "
        f"**The book yields {val_usd:+.2f}/day in baseline drift ({pct:+.4f}% of net liquidation value)**, "
        f"primarily driven by {('options theta melting' if is_theta_positive else 'underlying asset drift')}.\n\n"
        f"#### Greeks Risk Profile\n"
        f"- **Delta**: {delta_desc}. {delta_advice}\n"
        f"- **Theta**: {theta_desc}. {theta_details}\n"
        f"- **Vega**: {vega_desc}. {vega_details}\n\n"
        f"#### Strategic Summary\n"
        f"{strategy_summary}"
    )
    return commentary



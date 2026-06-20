import math
from typing import Dict, Any, Union, List, Tuple

def std_norm_cdf(x: float) -> float:
    """Cumulative distribution function for standard normal distribution."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))

def std_norm_pdf(x: float) -> float:
    """Probability density function for standard normal distribution."""
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)

def calculate_black_scholes(
    symbol: str,
    spot_price: float,
    strike_price: float,
    days_to_expiration: float,
    implied_volatility: float,
    risk_free_rate: float,
    option_type: str,  # "CALL" or "PUT"
    quantity: int = 1,
    action: str = "BUY"  # "BUY" (long) or "SELL" (short)
) -> Dict[str, Any]:
    """
    Calculate the Black-Scholes price and Greeks for a single option contract.
    """
    option_type = option_type.upper()
    action = action.upper()
    
    # Boundary / validation checks
    if spot_price <= 0 or strike_price <= 0:
        return {
            "price": 0.0,
            "greeks": {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}
        }
        
    T = days_to_expiration / 365.0
    sigma = max(implied_volatility, 0.0001)  # avoid division by zero
    r = risk_free_rate
    S = spot_price
    K = strike_price

    # Position multiplier
    # Buying an option gives positive exposure, selling gives negative exposure
    pos_multiplier = 1.0 if action == "BUY" else -1.0
    multiplier = quantity * 100.0 * pos_multiplier # Standard option contract size is 100 shares

    # Handle expiration case
    if T <= 0:
        if option_type == "CALL":
            intrinsic = max(S - K, 0.0)
            delta = 1.0 if S > K else 0.0
        else:
            intrinsic = max(K - S, 0.0)
            delta = -1.0 if S < K else 0.0
            
        # At expiration, other greeks are zero
        return {
            "price": intrinsic,
            "position_value": intrinsic * quantity * 100.0 * (1.0 if action == "BUY" else -1.0),
            "greeks": {
                "delta": delta * multiplier / 100.0, # normalized delta per contract or total delta
                "gamma": 0.0,
                "theta": 0.0,
                "vega": 0.0,
                "rho": 0.0
            }
        }

    # Calculations
    d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)

    # Pricing & Greeks calculation (per share basis)
    if option_type == "CALL":
        price = S * std_norm_cdf(d1) - K * math.exp(-r * T) * std_norm_cdf(d2)
        delta = std_norm_cdf(d1)
        # Theta for Call
        theta = (- (S * std_norm_pdf(d1) * sigma) / (2.0 * math.sqrt(T)) 
                 - r * K * math.exp(-r * T) * std_norm_cdf(d2))
        # Rho for Call
        rho = K * T * math.exp(-r * T) * std_norm_cdf(d2)
    elif option_type == "PUT":
        price = K * math.exp(-r * T) * std_norm_cdf(-d2) - S * std_norm_cdf(-d1)
        delta = std_norm_cdf(d1) - 1.0
        # Theta for Put
        theta = (- (S * std_norm_pdf(d1) * sigma) / (2.0 * math.sqrt(T)) 
                 + r * K * math.exp(-r * T) * std_norm_cdf(-d2))
        # Rho for Put
        rho = -K * T * math.exp(-r * T) * std_norm_cdf(-d2)
    else:
        raise ValueError("option_type must be CALL or PUT")

    # Gamma and Vega are identical for Calls and Puts
    gamma = std_norm_pdf(d1) / (S * sigma * math.sqrt(T))
    vega = S * std_norm_pdf(d1) * math.sqrt(T)

    # Standardize Greeks
    # Theta is usually quoted as a daily decay, so we divide by 365
    # Vega is quoted per 1% change in IV, so we divide by 100
    # Rho is quoted per 1% change in interest rate, so we divide by 100
    theta_daily = theta / 365.0
    vega_1pct = vega / 100.0
    rho_1pct = rho / 100.0

    return {
        "price": price,
        "position_value": price * quantity * 100.0 * pos_multiplier,
        "greeks": {
            # Greeks per contract (multiplied by multiplier / 100 which is contract delta)
            # Or we can return both: per-share greeks and position greeks.
            # Let's return per-share greeks, and the caller can aggregate them.
            "delta": delta,
            "gamma": gamma,
            "theta": theta_daily,
            "vega": vega_1pct,
            "rho": rho_1pct,
            # Position-adjusted Greeks (taking action and quantity into account)
            "position_delta": delta * quantity * 100.0 * pos_multiplier,
            "position_gamma": gamma * quantity * 100.0 * pos_multiplier,
            "position_theta": theta_daily * quantity * 100.0 * pos_multiplier,
            "position_vega": vega_1pct * quantity * 100.0 * pos_multiplier,
            "position_rho": rho_1pct * quantity * 100.0 * pos_multiplier,
        }
    }

def calculate_binomial_american(
    symbol: str,
    spot_price: float,
    strike_price: float,
    days_to_expiration: float,
    implied_volatility: float,
    risk_free_rate: float,
    option_type: str,  # "CALL" or "PUT"
    quantity: int = 1,
    action: str = "BUY",  # "BUY" (long) or "SELL" (short)
    dividends: List[Dict[str, Any]] = None,
    n_steps: int = 50
) -> Dict[str, Any]:
    """
    Calculate the American option price and Greeks using Cox-Ross-Rubinstein (CRR)
    binomial tree model with discrete dividend payments.
    """
    option_type = option_type.upper()
    action = action.upper()
    
    if spot_price <= 0 or strike_price <= 0:
        return {
            "price": 0.0,
            "position_value": 0.0,
            "greeks": {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0},
            "early_assignment_risk": "Low"
        }
        
    T = days_to_expiration / 365.0
    sigma = max(implied_volatility, 0.0001)
    r = risk_free_rate
    S = spot_price
    K = strike_price
    
    pos_multiplier = 1.0 if action == "BUY" else -1.0
    multiplier = quantity * 100.0 * pos_multiplier
    
    # Handle expiration case
    if T <= 0:
        if option_type == "CALL":
            intrinsic = max(S - K, 0.0)
            delta = 1.0 if S > K else 0.0
        else:
            intrinsic = max(K - S, 0.0)
            delta = -1.0 if S < K else 0.0
        return {
            "price": intrinsic,
            "position_value": intrinsic * quantity * 100.0 * pos_multiplier,
            "greeks": {
                "delta": delta,
                "gamma": 0.0,
                "theta": 0.0,
                "vega": 0.0,
                "rho": 0.0,
                "position_delta": delta * quantity * 100.0 * pos_multiplier,
                "position_gamma": 0.0,
                "position_theta": 0.0,
                "position_vega": 0.0,
                "position_rho": 0.0
            },
            "early_assignment_risk": "Critical" if (option_type == "CALL" and S > K) or (option_type == "PUT" and S < K) else "Low"
        }
        
    # Helper inner function to price option value given a set volatility and rate
    def run_tree(S_val: float, sigma_val: float, r_val: float) -> Tuple[float, Any, Any, Any]:
        dt = T / n_steps
        u = math.exp(sigma_val * math.sqrt(dt))
        d = 1.0 / u
        p = (math.exp(r_val * dt) - d) / (u - d)
        p = max(0.0, min(1.0, p))
        
        # Filter and compute PV of dividends
        div_pv = 0.0
        active_divs = []
        if dividends:
            for div in dividends:
                days = div.get("days_to_dividend", 999)
                t_div = days / 365.0
                if 0 < t_div < T:
                    amount = float(div.get("amount", 0.0))
                    div_pv += amount * math.exp(-r_val * t_div)
                    active_divs.append((t_div, amount))
                    
        # Initial stock price for growth tree
        S_prime_0 = max(0.01, S_val - div_pv)
        
        # Calculate PV of remaining dividends at each time step
        div_pv_steps = []
        for step in range(n_steps + 1):
            t_step = step * dt
            rem_div_pv = 0.0
            for t_div, amount in active_divs:
                if t_div > t_step:
                    rem_div_pv += amount * math.exp(-r_val * (t_div - t_step))
            div_pv_steps.append(rem_div_pv)
            
        # Build option value lattice backward
        phi = 1.0 if option_type == "CALL" else -1.0
        
        # Option values at expiration (step n_steps)
        V = [0.0] * (n_steps + 1)
        for k in range(n_steps + 1):
            S_node = S_prime_0 * (u ** k) * (d ** (n_steps - k)) + div_pv_steps[n_steps]
            V[k] = max(phi * (S_node - K), 0.0)
            
        # Track intermediate values for Greek calculations
        step_1_vals = None
        step_2_vals = None
        
        for step in range(n_steps - 1, -1, -1):
            next_V = [0.0] * (step + 1)
            for k in range(step + 1):
                S_node = S_prime_0 * (u ** k) * (d ** (step - k)) + div_pv_steps[step]
                hold_value = math.exp(-r_val * dt) * (p * V[k + 1] + (1 - p) * V[k])
                exercise_value = max(phi * (S_node - K), 0.0)
                next_V[k] = max(hold_value, exercise_value)
            V = next_V
            
            if step == 2:
                step_2_vals = list(V)
            elif step == 1:
                step_1_vals = list(V)
                
        return V[0], step_1_vals, step_2_vals, (S_prime_0, u, d, div_pv_steps, dt)

    # 1. Base pricing
    price, step_1, step_2, tree_params = run_tree(S, sigma, r)
    
    # 2. Greeks using tree structure parameters
    S_prime_0, u, d, div_pv_steps, dt = tree_params
    
    # Delta & Gamma calculation
    delta = 0.0
    gamma = 0.0
    theta_daily = 0.0
    
    if step_1 is not None and len(step_1) >= 2:
        S_11 = S_prime_0 * u + div_pv_steps[1]
        S_10 = S_prime_0 * d + div_pv_steps[1]
        if S_11 != S_10:
            delta = (step_1[1] - step_1[0]) / (S_11 - S_10)
            
    if step_2 is not None and len(step_2) >= 3:
        S_22 = S_prime_0 * (u ** 2) + div_pv_steps[2]
        S_21 = S_prime_0 + div_pv_steps[2]
        S_20 = S_prime_0 * (d ** 2) + div_pv_steps[2]
        
        diff_up = S_22 - S_21
        diff_down = S_21 - S_20
        if diff_up != 0 and diff_down != 0 and (S_22 - S_20) != 0:
            d_up = (step_2[2] - step_2[1]) / diff_up
            d_down = (step_2[1] - step_2[0]) / diff_down
            gamma = (d_up - d_down) / (0.5 * (S_22 - S_20))
            
        # Theta
        theta = (step_2[1] - price) / (2.0 * dt)
        theta_daily = theta / 365.0
        
    # 3. Vega & Rho via finite differences
    price_vol_up, _, _, _ = run_tree(S, sigma + 0.01, r)
    vega_1pct = (price_vol_up - price)
    
    price_rate_up, _, _, _ = run_tree(S, sigma, r + 0.01)
    rho_1pct = (price_rate_up - price)
    
    # 4. Early assignment risk
    is_itm = False
    intrinsic = 0.0
    if option_type == "CALL":
        if S > K:
            is_itm = True
            intrinsic = S - K
    else:
        if S < K:
            is_itm = True
            intrinsic = K - S
            
    early_risk = "Low"
    if is_itm:
        extrinsic = max(0.0, price - intrinsic)
        # Time value approaches zero
        if extrinsic < 0.10 or (price > 0 and extrinsic / price < 0.02):
            early_risk = "Critical"
        # Dividend ex-date imminent and exceeds extrinsic value
        elif option_type == "CALL" and dividends:
            for div in dividends:
                days = div.get("days_to_dividend", 999)
                amount = float(div.get("amount", 0.0))
                if 0 < days <= 5 and amount > extrinsic:
                    early_risk = "Critical"
                    break
            else:
                early_risk = "Medium"
        else:
            early_risk = "Medium"
            
    return {
        "price": price,
        "position_value": price * quantity * 100.0 * pos_multiplier,
        "early_assignment_risk": early_risk,
        "greeks": {
            "delta": delta,
            "gamma": gamma,
            "theta": theta_daily,
            "vega": vega_1pct,
            "rho": rho_1pct,
            "position_delta": delta * quantity * 100.0 * pos_multiplier,
            "position_gamma": gamma * quantity * 100.0 * pos_multiplier,
            "position_theta": theta_daily * quantity * 100.0 * pos_multiplier,
            "position_vega": vega_1pct * quantity * 100.0 * pos_multiplier,
            "position_rho": rho_1pct * quantity * 100.0 * pos_multiplier
        }
    }


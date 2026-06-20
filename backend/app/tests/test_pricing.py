import pytest
from app.services.pricing import calculate_black_scholes, std_norm_cdf, std_norm_pdf

def test_std_norm_cdf():
    # standard values
    assert abs(std_norm_cdf(0.0) - 0.5) < 1e-7
    assert abs(std_norm_cdf(1.96) - 0.975002) < 1e-5
    assert abs(std_norm_cdf(-1.96) - 0.024998) < 1e-5

def test_std_norm_pdf():
    # standard values
    import math
    assert abs(std_norm_pdf(0.0) - 1.0 / math.sqrt(2.0 * math.pi)) < 1e-7

def test_black_scholes_call():
    # Call option check
    # Spot = 100, Strike = 100, Days = 30, IV = 20% (0.2), Rate = 5% (0.05)
    res = calculate_black_scholes(
        symbol="AAPL",
        spot_price=100.0,
        strike_price=100.0,
        days_to_expiration=30.0,
        implied_volatility=0.20,
        risk_free_rate=0.05,
        option_type="CALL",
        quantity=1,
        action="BUY"
    )
    
    # Expected call price is around 2.40 - 2.50
    assert 2.40 < res["price"] < 2.55
    # Long call delta should be positive
    assert 0.5 < res["greeks"]["delta"] < 0.6
    # Gamma should be positive
    assert res["greeks"]["gamma"] > 0
    # Theta should be negative (per day decay)
    assert res["greeks"]["theta"] < 0
    # Vega should be positive
    assert res["greeks"]["vega"] > 0

def test_black_scholes_put():
    # Put option check
    res = calculate_black_scholes(
        symbol="AAPL",
        spot_price=100.0,
        strike_price=100.0,
        days_to_expiration=30.0,
        implied_volatility=0.20,
        risk_free_rate=0.05,
        option_type="PUT",
        quantity=1,
        action="BUY"
    )
    
    # Put price check (using put-call parity: C - P = S - K * exp(-rT))
    # 2.49 - P = 100 - 99.59 = 0.41 => P = 2.08
    assert 2.00 < res["price"] < 2.15
    # Put delta should be negative
    assert -0.5 < res["greeks"]["delta"] < -0.4
    # Vega should be positive and equal to call vega
    assert res["greeks"]["vega"] > 0

def test_expiration_greeks():
    res = calculate_black_scholes(
        symbol="AAPL",
        spot_price=105.0,
        strike_price=100.0,
        days_to_expiration=0.0,
        implied_volatility=0.20,
        risk_free_rate=0.05,
        option_type="CALL",
        quantity=1,
        action="BUY"
    )
    assert res["price"] == 5.0
    assert res["greeks"]["delta"] == 1.0
    assert res["greeks"]["gamma"] == 0.0
    assert res["greeks"]["theta"] == 0.0
    assert res["greeks"]["vega"] == 0.0

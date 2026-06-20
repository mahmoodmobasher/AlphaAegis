import pytest
from app.services.pricing import calculate_binomial_american
from app.services.risk_analytics import (
    get_upcoming_dividends,
    get_asset_adv,
    calculate_shock_scenario,
    calculate_compliance_alert,
    parse_positions
)

def test_binomial_pricing_no_dividends():
    # If dividends are none, CRR should give option prices very close to standard values
    res = calculate_binomial_american(
        symbol="AAPL",
        spot_price=100.0,
        strike_price=100.0,
        days_to_expiration=30.0,
        implied_volatility=0.20,
        risk_free_rate=0.05,
        option_type="CALL",
        quantity=1,
        action="BUY",
        dividends=None,
        n_steps=50
    )
    # Expected price of standard ATM 30-day Call with 20% IV is ~2.40 - 2.55
    assert 2.30 < res["price"] < 2.65
    assert res["greeks"]["delta"] > 0.5
    assert res["greeks"]["gamma"] > 0.0

def test_early_assignment_risk():
    # Case 1: Option is OTM -> Low risk
    res_otm = calculate_binomial_american(
        symbol="AAPL",
        spot_price=90.0,
        strike_price=100.0,
        days_to_expiration=30.0,
        implied_volatility=0.20,
        risk_free_rate=0.05,
        option_type="CALL"
    )
    assert res_otm["early_assignment_risk"] == "Low"

    # Case 2: Option is ITM with high extrinsic value -> Medium risk
    res_itm = calculate_binomial_american(
        symbol="AAPL",
        spot_price=105.0,
        strike_price=100.0,
        days_to_expiration=30.0,
        implied_volatility=0.20,
        risk_free_rate=0.05,
        option_type="CALL"
    )
    assert res_itm["early_assignment_risk"] == "Medium"

    # Case 3: Option is CALL, ex-div is imminent (e.g. 3 days), dividend amount exceeds extrinsic value -> Critical risk
    divs = [{"days_to_dividend": 3, "amount": 2.00}]
    res_div = calculate_binomial_american(
        symbol="SPY",
        spot_price=105.0,
        strike_price=100.0,
        days_to_expiration=30.0,
        implied_volatility=0.10, # low vol
        risk_free_rate=0.05,
        option_type="CALL",
        dividends=divs
    )
    assert res_div["early_assignment_risk"] == "Critical"

def test_compliance_alerts():
    # Nominal case: maint margin = 1000, net liq = 5000 (ratio = 20% <= 60%)
    res_nom = calculate_compliance_alert(5000.0, 1000.0)
    assert res_nom["status"] == "NOMINAL"
    assert res_nom["ratio"] == 0.20
    
    # Soft warning case: maint margin = 3500, net liq = 5000 (ratio = 70% > 60%)
    res_soft = calculate_compliance_alert(5000.0, 3500.0)
    assert res_soft["status"] == "SOFT_WARNING"
    assert res_soft["ratio"] == 0.70

    # Critical violation case: maint margin = 4500, net liq = 5000 (ratio = 90% > 80%)
    res_crit = calculate_compliance_alert(5000.0, 4500.0)
    assert res_crit["status"] == "CRITICAL_VIOLATION"
    assert res_crit["ratio"] == 0.90

    # Negative net liquidity case
    res_neg = calculate_compliance_alert(-100.0, 1000.0)
    assert res_neg["status"] == "CRITICAL_VIOLATION"

def test_average_daily_volume_days_to_liquidate(monkeypatch):
    mock_adv = lambda t: 50000.0 if t.upper() == "NBIS" else 80000000.0
    monkeypatch.setattr("app.services.risk_analytics.get_asset_adv", mock_adv)
    monkeypatch.setattr("app.tests.test_risk_analytics_phase2.get_asset_adv", mock_adv)
    
    assert get_asset_adv("SPY") == 80000000.0
    assert get_asset_adv("NBIS") == 50000.0
    
    # Position size = 20,000 shares of NBIS
    # ADV = 50,000 shares
    # Days to liquidate = 20,000 / (0.10 * 50,000) = 4.0 days
    positions_raw = [
        {
            "ticker": "NBIS",
            "type": "EQUITY",
            "size": 20000,
            "avg_price": 260.0
        }
    ]
    parsed = parse_positions(positions_raw)
    assert parsed[0]["days_to_liquidate"] == 4.0

def test_calculate_shock_scenario():
    parsed_positions = [
        {
            "ticker": "NVDA",
            "type": "EQUITY",
            "size": 10,
            "price": 200.0,
            "beta": 1.85,
            "market_value": 2000.0,
            "delta_equivalent": 2000.0
        }
    ]
    initial_summary = {
        "net_liquidity": 5000.0,
        "maintenance_margin": 1500.0,
        "daily_pnl": 100.0
    }
    
    # Spot down 10%, IV up 50%
    shock_res = calculate_shock_scenario(
        parsed_positions=parsed_positions,
        spot_shock_pct=-10.0,
        iv_shock_pct=50.0,
        initial_summary=initial_summary
    )
    
    # Shocked NVDA price is 180.0
    # Shocked market value is 1800.0 (change of -200)
    # Pro-forma net liquidity should be 5000 - 200 = 4800.0
    assert shock_res["net_liquidity"] == 4800.0
    assert shock_res["net_liquidity_change"] == -200.0
    # Shocked maintenance margin: initial 1500 + change in NVDA equity margin:
    # Initial NVDA margin = 2000 * 0.30 = 600
    # Shocked NVDA margin = 1800 * 0.30 = 540
    # Shocked maintenance margin = 1500 + (540 - 600) = 1440.0
    assert shock_res["maintenance_margin"] == 1440.0
    assert shock_res["excess_liquidity"] == 4800.0 - 1440.0

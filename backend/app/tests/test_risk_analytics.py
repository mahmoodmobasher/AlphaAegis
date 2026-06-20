import pytest
from app.services.risk_analytics import (
    parse_positions,
    calculate_factor_exposures,
    calculate_beta_weighted_delta,
    calculate_value_at_risk,
    get_spx_price,
    get_asset_beta,
    calculate_daily_expected_return,
    generate_greeks_commentary
)

def test_get_spx_price():
    price = get_spx_price()
    assert price > 0.0
    # Expected fallback or actual price is close to market values (e.g. > 3000)
    assert price > 3000.0

def test_get_asset_beta():
    assert get_asset_beta("NVDA") == 1.85
    assert get_asset_beta("TQQQ") == 3.02
    assert get_asset_beta("UNKNOWN_RANDOM_TICKER") == 1.0

def test_parse_positions_equity():
    positions_raw = [
        {
            "ticker": "NVDA",
            "type": "EQUITY",
            "size": 10,
            "current_price": 200.0,
            "underlying_beta_to_spx": 1.85
        }
    ]
    parsed = parse_positions(positions_raw)
    assert len(parsed) == 1
    assert parsed[0]["ticker"] == "NVDA"
    assert parsed[0]["type"] == "EQUITY"
    assert parsed[0]["size"] == 10
    assert parsed[0]["price"] == 200.0
    assert parsed[0]["beta"] == 1.85
    assert parsed[0]["delta"] == 10.0
    assert parsed[0]["market_value"] == 2000.0
    assert parsed[0]["delta_equivalent"] == 2000.0

def test_parse_positions_option_combination():
    positions_raw = [
        {
            "ticker": "TQQQ",
            "type": "OPTION_COMBINATION",
            "size": 2,
            "underlying_beta_to_spx": 3.02,
            "legs": [
                {
                    "strike": 75.0,
                    "type": "PUT",
                    "expiration": "2026-07-20",
                    "position_type": "SHORT",
                    "delta": -0.42,
                    "premium": 2.50
                },
                {
                    "strike": 70.0,
                    "type": "PUT",
                    "expiration": "2026-07-20",
                    "position_type": "LONG",
                    "delta": 0.21,
                    "premium": 1.00
                }
            ]
        }
    ]
    parsed = parse_positions(positions_raw)
    assert len(parsed) == 1
    assert parsed[0]["ticker"] == "TQQQ"
    assert parsed[0]["type"] == "OPTION_COMBINATION"
    assert parsed[0]["size"] == 2
    assert parsed[0]["delta"] != 0.0
    assert parsed[0]["market_value"] != 0.0
    assert len(parsed[0]["legs"]) == 2

def test_calculate_factor_exposures():
    parsed_positions = [
        {
            "ticker": "NVDA",
            "type": "EQUITY",
            "size": 10,
            "price": 200.0,
            "beta": 1.85,
            "delta": 10.0,
            "market_value": 2000.0,
            "delta_equivalent": 2000.0
        },
        {
            "ticker": "NBIS",
            "type": "EQUITY",
            "size": 10,
            "price": 100.0,
            "beta": 1.0,
            "delta": 10.0,
            "market_value": 1000.0,
            "delta_equivalent": 1000.0
        }
    ]
    # Total abs exposure = 2000 (NVDA) + 1000 (NBIS) = 3000
    # NVDA weight = 2000/3000 = 2/3, NBIS weight = 1000/3000 = 1/3
    # Growth = 2/3 * 0.95 + 1/3 * 0.40 = 0.6333 + 0.1333 = 0.7667
    exposures = calculate_factor_exposures(parsed_positions)
    assert abs(exposures["portfolio_factors"]["growth"] - 0.7667) < 1e-3
    assert len(exposures["sector_matrix"]) == 2

def test_calculate_beta_weighted_delta():
    parsed_positions = [
        {
            "ticker": "NVDA",
            "type": "EQUITY",
            "size": 10,
            "price": 200.0,
            "beta": 1.85,
            "delta": 10.0,
            "market_value": 2000.0,
            "delta_equivalent": 2000.0
        }
    ]
    spx_price = 5400.00
    result = calculate_beta_weighted_delta(parsed_positions, spx_price)
    
    # Beta-Weighted Delta shares = Delta * (Price / SPX) * Beta
    # = 10 * (200.0 / 5400.0) * 1.85 = 0.6852 shares
    expected_shares = 10.0 * (200.0 / 5400.0) * 1.85
    assert abs(result["total_beta_weighted_delta_shares"] - expected_shares) < 1e-4
    assert abs(result["total_beta_weighted_delta_dollars"] - expected_shares * 5400.0) < 1e-2

def test_calculate_value_at_risk():
    parsed_positions = [
        {
            "ticker": "NVDA",
            "type": "EQUITY",
            "size": 10,
            "price": 200.0,
            "beta": 1.85,
            "delta": 10.0,
            "market_value": 2000.0,
            "delta_equivalent": 2000.0
        }
    ]
    
    # Should calculate VaR using standard statistical fallback (using deterministic seed 42)
    var_res = calculate_value_at_risk(parsed_positions, days_lookback=100)
    assert var_res["lookback_days_actual"] == 100
    assert var_res["var_95_dollars"] >= 0.0
    assert var_res["var_99_dollars"] >= 0.0
    assert var_res["var_99_dollars"] >= var_res["var_95_dollars"]


def test_calculate_daily_expected_return():
    parsed_positions = [
        {
            "ticker": "NVDA",
            "type": "EQUITY",
            "size": 10,
            "price": 200.0,
            "beta": 1.85,
            "delta": 10.0,
            "market_value": 2000.0,
            "delta_equivalent": 2000.0,
            "legs": []
        },
        {
            "ticker": "TQQQ",
            "type": "OPTION_COMBINATION",
            "size": 1,
            "price": 80.0,
            "beta": 3.02,
            "delta": -42.0,
            "market_value": -250.0,
            "delta_equivalent": -3360.0,
            "legs": [
                {
                    "strike": 75.0,
                    "type": "PUT",
                    "expiration": "2026-06-05",
                    "position_type": "SHORT",
                    "delta": -0.42,
                    "theta": -0.05,
                    "price": 2.50,
                    "early_assignment_risk": "Low"
                }
            ]
        }
    ]
    
    res = calculate_daily_expected_return(parsed_positions, net_liquidity=5000.0, days_lookback=100)
    
    assert "daily_expected_return_usd" in res
    assert "expected_return_percentage" in res
    assert "regime_status" in res
    assert res["regime_status"] in ("BULLISH", "BEARISH", "NEUTRAL")


def test_generate_greeks_commentary():
    parsed_positions = [
        {
            "ticker": "NVDA",
            "type": "EQUITY",
            "size": 10,
            "price": 200.0,
            "beta": 1.85,
            "delta": 10.0,
            "market_value": 2000.0,
            "delta_equivalent": 2000.0,
            "legs": []
        },
        {
            "ticker": "TQQQ",
            "type": "OPTION_COMBINATION",
            "size": 1,
            "price": 80.0,
            "beta": 3.02,
            "delta": -42.0,
            "theta": 5.0,
            "vega": -1.2,
            "market_value": -250.0,
            "delta_equivalent": -3360.0,
            "legs": [
                {
                    "strike": 75.0,
                    "type": "PUT",
                    "expiration": "2026-06-05",
                    "position_type": "SHORT",
                    "delta": -0.42,
                    "theta": -0.05,
                    "price": 2.50,
                    "early_assignment_risk": "Low"
                }
            ]
        }
    ]
    daily_expected = {
        "daily_expected_return_usd": 3.08,
        "expected_return_percentage": 0.0615,
        "regime_status": "BULLISH"
    }
    
    commentary = generate_greeks_commentary(parsed_positions, daily_expected)
    assert "AI Risk & Performance Commentary" in commentary
    assert "BULLISH" in commentary
    assert "3.08" in commentary



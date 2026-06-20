import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.agents import parse_natural_language_query, run_investment_committee

client = TestClient(app)

def test_parse_natural_language_query():
    # 1. DTE and position type query
    res1 = parse_natural_language_query("Show me all short positions expiring in under 14 days")
    assert res1["filters"]["position_type"] == "SHORT"
    assert res1["filters"]["expiration_days_lte"] == 14
    
    # 2. Factor exposure query
    res2 = parse_natural_language_query("Filter out assets with high factor exposure to Momentum")
    assert res2["filters"]["factor_high"] == "momentum"
    
    # 3. Ticker query
    res3 = parse_natural_language_query("Filter SPY")
    assert res3["filters"]["ticker"] == "SPY"
    
    # 4. Asset type query
    res4 = parse_natural_language_query("Show options only")
    assert res4["filters"]["asset_type"] == "OPTION"
    
    # 5. Early assignment risk query
    res5 = parse_natural_language_query("Show critical early assignment")
    assert res5["filters"]["early_assignment_risk"] == "Critical"

@pytest.mark.anyio
async def test_run_investment_committee_critical_risk():
    # Construct a portfolio state with a critical leg
    portfolio_state = {
        "portfolio_summary": {
            "net_liquidity": 5000.0,
            "excess_liquidity": 3000.0,
            "maintenance_margin": 3500.0, # ratio = 70% (soft warning)
            "daily_pnl": -100.0
        },
        "compliance": {
            "status": "SOFT_WARNING",
            "ratio": 0.70,
            "message": "SOFT WARNING: Maintenance Margin exceeds 60% standard limit."
        },
        "value_at_risk": {
            "var_95_dollars": 400.0,
            "var_95_pct": 8.0,
            "var_99_dollars": 600.0,
            "var_99_pct": 12.0, # high tail risk (>10%)
            "lookback_days_actual": 100
        },
        "factor_exposure": {
            "portfolio_factors": {"growth": 0.8, "momentum": 0.9, "value": 0.2},
            "sector_matrix": []
        },
        "positions": [
            {
                "ticker": "SPY",
                "type": "OPTION_COMBINATION",
                "strategy_name": "SPY Bull Put",
                "size": 1,
                "price": 540.0,
                "beta": 1.0,
                "delta": -42.0,
                "market_value": -250.0,
                "delta_equivalent": -22680.0,
                "early_assignment_risk": "Critical",
                "days_to_liquidate": 0.05,
                "adv": 80000000.0,
                "legs": [
                    {
                        "strike": 545.0,
                        "type": "PUT",
                        "expiration": "2026-06-05",
                        "position_type": "SHORT",
                        "delta": -0.42,
                        "early_assignment_risk": "Critical"
                    }
                ]
            },
            {
                "ticker": "NVDA",
                "type": "EQUITY",
                "size": 10,
                "price": 223.86,
                "beta": 1.85,
                "delta": 10.0,
                "market_value": 2238.60,
                "delta_equivalent": 2238.60,
                "early_assignment_risk": "Low",
                "days_to_liquidate": 0.04,
                "adv": 50000000.0,
                "legs": []
            }
        ]
    }
    
    res = await run_investment_committee(portfolio_state)
    assert "debate_logs" in res
    assert "advisory_report" in res
    assert "recommendations" in res
    assert "summary_report" in res
    assert "Performance & Capital Constraints" in res["summary_report"]
    assert "Systemic Risk Analysis" in res["summary_report"]
    assert "Assignment Risk Analysis" in res["summary_report"]
    assert "Strategic Improvements" in res["summary_report"]
    
    assert len(res["debate_logs"]) > 0
    assert "Options Specialist Agent" in [log["agent"] for log in res["debate_logs"]]
    assert "Macro Risk Agent" in [log["agent"] for log in res["debate_logs"]]
    
    # PM synthesis should contain markdown header and warnings
    assert "# Investment Committee Advisory Report" in res["advisory_report"]
    assert "CRITICAL ASSIGNMENT RISK" in res["advisory_report"]
    
    # Recommendations should contain close leg and trim NVDA
    recs = res["recommendations"]
    assert len(recs) >= 2
    tickers = [r["ticker"] for r in recs]
    assert "SPY" in tickers
    assert "NVDA" in tickers

def test_api_agents_command_endpoint():
    payload = {"query": "Show SPY options expiring under 14 days"}
    response = client.post("/api/agents/command", json=payload)
    assert response.status_code == 200
    res_data = response.json()
    assert "filters" in res_data
    assert res_data["filters"]["ticker"] == "SPY"
    assert res_data["filters"]["asset_type"] == "OPTION"
    assert res_data["filters"]["expiration_days_lte"] == 14

def test_command_filters_validation():
    from app.routers.agents import CommandFilters
    # Test ticker normalization
    filters = CommandFilters(ticker=" spy  ")
    assert filters.ticker == "SPY"
    
    # Test early assignment risk capitalization
    filters = CommandFilters(early_assignment_risk="critical")
    assert filters.early_assignment_risk == "Critical"
    
    # Test invalid early assignment risk is dropped (None)
    filters = CommandFilters(early_assignment_risk="super-critical")
    assert filters.early_assignment_risk is None
    
    # Test asset type coercion
    filters = CommandFilters(asset_type="stocks")
    assert filters.asset_type == "EQUITY"
    
    filters = CommandFilters(asset_type="options")
    assert filters.asset_type == "OPTION"
    
    # Test position type validation
    filters = CommandFilters(position_type="short")
    assert filters.position_type == "SHORT"
    
    filters = CommandFilters(position_type="invalid_type")
    assert filters.position_type is None
    
    # Test factor high validator
    filters = CommandFilters(factor_high=" MOMENTUM ")
    assert filters.factor_high == "momentum"
    
    # Test DTE coercion and ge=0 constraint
    filters = CommandFilters(expiration_days_lte="15.0")
    assert filters.expiration_days_lte == 15
    
    filters = CommandFilters(expiration_days_lte="-5")
    assert filters.expiration_days_lte is None

def test_api_agents_debate_endpoint():
    debate_payload = {
        "portfolio_summary": {
            "net_liquidity": 5400.00,
            "excess_liquidity": 3000.00,
            "maintenance_margin": 3000.00,
            "daily_pnl": -162.00
        },
        "positions": [
            {
                "ticker": "TQQQ",
                "type": "OPTION_COMBINATION",
                "strategy_name": "Jun05 75/70 Bull Put",
                "size": 1,
                "underlying_beta_to_spx": 3.02,
                "legs": [
                    {"strike": 75.0, "type": "PUT", "expiration": "2026-06-05", "position_type": "SHORT", "delta": -0.42},
                    {"strike": 70.0, "type": "PUT", "expiration": "2026-06-05", "position_type": "LONG", "delta": 0.21}
                ]
            }
        ]
    }
    
    response = client.post("/api/agents/debate", json=debate_payload)
    assert response.status_code == 200
    res_data = response.json()
    assert "debate_logs" in res_data
    assert "advisory_report" in res_data
    assert "recommendations" in res_data
    assert "summary_report" in res_data
    assert res_data["summary_report"] is not None

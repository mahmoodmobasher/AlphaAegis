from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

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

router = APIRouter(prefix="/portfolio/risk-analytics", tags=["Portfolio Risk Analytics"])

# ----------------------------------------------------------------------
# PYDANTIC SCHEMAS FOR INPUT
# ----------------------------------------------------------------------

class LegInput(BaseModel):
    strike: float
    type: str  # "CALL" or "PUT"
    expiration: str  # YYYY-MM-DD
    position_type: str  # "LONG" or "SHORT"
    delta: float
    premium: Optional[float] = 2.50

class PositionInput(BaseModel):
    ticker: str
    type: str  # "EQUITY" or "OPTION_COMBINATION" or "OPTION"
    strategy_name: Optional[str] = None
    size: int
    avg_price: Optional[float] = None
    current_price: Optional[float] = None
    underlying_beta_to_spx: Optional[float] = None
    legs: Optional[List[LegInput]] = []

class SummaryInput(BaseModel):
    net_liquidity: float
    excess_liquidity: float
    maintenance_margin: float
    daily_pnl: float

class ShockScenarioInput(BaseModel):
    spot_shock_pct: Optional[float] = 0.0
    iv_shock_pct: Optional[float] = 0.0

class RiskInput(BaseModel):
    portfolio_summary: SummaryInput
    positions: List[PositionInput]
    shock_scenario: Optional[ShockScenarioInput] = None

# ----------------------------------------------------------------------
# PYDANTIC SCHEMAS FOR OUTPUT
# ----------------------------------------------------------------------

class FactorSummary(BaseModel):
    growth: float
    momentum: float
    value: float

class SectorAllocation(BaseModel):
    sector: str
    exposure: float
    percentage: float

class FactorExposureResponse(BaseModel):
    portfolio_factors: FactorSummary
    sector_matrix: List[SectorAllocation]

class PositionBetaDelta(BaseModel):
    ticker: str
    strategy: str
    position_delta: float
    beta: float
    beta_weighted_delta_shares: float
    beta_weighted_delta_dollars: float
    delta_equivalent: float

class BetaWeightedDeltaResponse(BaseModel):
    total_beta_weighted_delta_shares: float
    total_beta_weighted_delta_dollars: float
    spx_index_price: float
    positions: List[PositionBetaDelta]

class VarResponse(BaseModel):
    var_95_dollars: float
    var_95_pct: float
    var_99_dollars: float
    var_99_pct: float
    lookback_days_actual: int

class ComplianceAlert(BaseModel):
    status: str
    ratio: float
    message: str

class ProFormaPositionValue(BaseModel):
    ticker: str
    type: str
    value_initial: float
    value_shocked: float
    value_change: float

class ProFormaResponse(BaseModel):
    net_liquidity: float
    maintenance_margin: float
    excess_liquidity: float
    daily_pnl: float
    net_liquidity_change: float
    positions: List[ProFormaPositionValue]

class LegRiskResponse(BaseModel):
    strike: float
    type: str
    expiration: str
    position_type: str
    delta: float
    price: float
    early_assignment_risk: str

class PositionRiskResponse(BaseModel):
    ticker: str
    type: str
    strategy_name: Optional[str] = None
    size: int
    price: float
    beta: float
    delta: float
    market_value: float
    delta_equivalent: float
    early_assignment_risk: Optional[str] = None
    days_to_liquidate: float
    adv: float
    legs: List[LegRiskResponse] = []


class DailyExpectedReturnResponse(BaseModel):
    daily_expected_return_usd: float
    expected_return_percentage: float
    regime_status: str


class RiskAnalyticsResponse(BaseModel):
    portfolio_summary: SummaryInput
    beta_weighted_delta: BetaWeightedDeltaResponse
    factor_exposure: FactorExposureResponse
    value_at_risk: VarResponse
    compliance: ComplianceAlert
    pro_forma: Optional[ProFormaResponse] = None
    positions: List[PositionRiskResponse] = []
    daily_expected_return: Optional[DailyExpectedReturnResponse] = None
    greeks_commentary: Optional[str] = None

# ----------------------------------------------------------------------
# ROUTE DEFINITION
# ----------------------------------------------------------------------

@router.post("", response_model=RiskAnalyticsResponse)
def get_risk_analytics(payload: RiskInput):
    """
    Ingest live portfolio state and compute factor exposures, beta-weighted deltas,
    historical Value-at-Risk (VaR) thresholds, compliance status, pro-forma shocks,
    and Days to Liquidate metrics.
    """
    try:
        # 1. Parse incoming positions into standard pricing format
        raw_positions = []
        for pos in payload.positions:
            raw_pos = {
                "ticker": pos.ticker,
                "type": pos.type,
                "strategy_name": pos.strategy_name,
                "size": pos.size,
                "avg_price": pos.avg_price,
                "current_price": pos.current_price,
                "underlying_beta_to_spx": pos.underlying_beta_to_spx,
                "legs": [
                    {
                        "strike": leg.strike,
                        "type": leg.type,
                        "expiration": leg.expiration,
                        "position_type": leg.position_type,
                        "delta": leg.delta,
                        "premium": leg.premium
                    }
                    for leg in pos.legs
                ] if pos.legs else []
            }
            raw_positions.append(raw_pos)
            
        parsed_positions = parse_positions(raw_positions)
        
        # 2. Get SPX baseline price
        spx_price = get_spx_price()
        
        # 3. Compute factor exposures
        factor_exp = calculate_factor_exposures(parsed_positions)
        
        # 4. Compute beta-weighted deltas
        beta_weighted = calculate_beta_weighted_delta(parsed_positions, spx_price)
        
        # 5. Compute Value-at-Risk limits
        var_limits = calculate_value_at_risk(parsed_positions)
        
        # 6. Compliance status check
        net_liq = payload.portfolio_summary.net_liquidity
        maint_margin = payload.portfolio_summary.maintenance_margin
        compliance_status = calculate_compliance_alert(net_liq, maint_margin)
        
        # 6b. Compute Daily Expected Return
        daily_expected = calculate_daily_expected_return(parsed_positions, net_liq)
        
        # 6c. Compute Greeks Commentary
        greeks_commentary = generate_greeks_commentary(parsed_positions, daily_expected)
        
        # 7. Pro-forma macroeconomic shock simulation
        pro_forma_data = None
        if payload.shock_scenario:
            pro_forma_data = calculate_shock_scenario(
                parsed_positions=parsed_positions,
                spot_shock_pct=payload.shock_scenario.spot_shock_pct or 0.0,
                iv_shock_pct=payload.shock_scenario.iv_shock_pct or 0.0,
                initial_summary={
                    "net_liquidity": net_liq,
                    "maintenance_margin": maint_margin,
                    "daily_pnl": payload.portfolio_summary.daily_pnl
                }
            )
            
        # Map response positions list
        response_positions = []
        for pos in parsed_positions:
            response_positions.append(
                PositionRiskResponse(
                    ticker=pos["ticker"],
                    type=pos["type"],
                    strategy_name=pos.get("strategy_name"),
                    size=pos["size"],
                    price=pos["price"],
                    beta=pos["beta"],
                    delta=pos["delta"],
                    market_value=pos["market_value"],
                    delta_equivalent=pos["delta_equivalent"],
                    early_assignment_risk=pos.get("early_assignment_risk"),
                    days_to_liquidate=pos["days_to_liquidate"],
                    adv=pos["adv"],
                    legs=[
                        LegRiskResponse(
                            strike=leg["strike"],
                            type=leg["type"],
                            expiration=leg["expiration"],
                            position_type=leg["position_type"],
                            delta=leg["delta"],
                            price=leg["price"],
                            early_assignment_risk=leg["early_assignment_risk"]
                        )
                        for leg in pos.get("legs", [])
                    ]
                )
            )
            
        return RiskAnalyticsResponse(
            portfolio_summary=payload.portfolio_summary,
            beta_weighted_delta=BetaWeightedDeltaResponse(
                total_beta_weighted_delta_shares=beta_weighted["total_beta_weighted_delta_shares"],
                total_beta_weighted_delta_dollars=beta_weighted["total_beta_weighted_delta_dollars"],
                spx_index_price=beta_weighted["spx_index_price"],
                positions=[
                    PositionBetaDelta(
                        ticker=p["ticker"],
                        strategy=p["strategy"],
                        position_delta=p["position_delta"],
                        beta=p["beta"],
                        beta_weighted_delta_shares=p["beta_weighted_delta_shares"],
                        beta_weighted_delta_dollars=p["beta_weighted_delta_dollars"],
                        delta_equivalent=p["delta_equivalent"]
                    )
                    for p in beta_weighted["positions"]
                ]
            ),
            factor_exposure=FactorExposureResponse(
                portfolio_factors=FactorSummary(
                    growth=factor_exp["portfolio_factors"]["growth"],
                    momentum=factor_exp["portfolio_factors"]["momentum"],
                    value=factor_exp["portfolio_factors"]["value"]
                ),
                sector_matrix=[
                    SectorAllocation(
                        sector=s["sector"],
                        exposure=s["exposure"],
                        percentage=s["percentage"]
                    )
                    for s in factor_exp["sector_matrix"]
                ]
            ),
            value_at_risk=VarResponse(
                var_95_dollars=var_limits["var_95_dollars"],
                var_95_pct=var_limits["var_95_pct"],
                var_99_dollars=var_limits["var_99_dollars"],
                var_99_pct=var_limits["var_99_pct"],
                lookback_days_actual=var_limits["lookback_days_actual"]
            ),
            compliance=ComplianceAlert(
                status=compliance_status["status"],
                ratio=compliance_status["ratio"],
                message=compliance_status["message"]
            ),
            pro_forma=ProFormaResponse(
                net_liquidity=pro_forma_data["net_liquidity"],
                maintenance_margin=pro_forma_data["maintenance_margin"],
                excess_liquidity=pro_forma_data["excess_liquidity"],
                daily_pnl=pro_forma_data["daily_pnl"],
                net_liquidity_change=pro_forma_data["net_liquidity_change"],
                positions=[
                    ProFormaPositionValue(
                        ticker=p["ticker"],
                        type=p["type"],
                        value_initial=p["value_initial"],
                        value_shocked=p["value_shocked"],
                        value_change=p["value_change"]
                    )
                    for p in pro_forma_data["positions"]
                ]
            ) if pro_forma_data else None,
            positions=response_positions,
            daily_expected_return=DailyExpectedReturnResponse(
                daily_expected_return_usd=daily_expected["daily_expected_return_usd"],
                expected_return_percentage=daily_expected["expected_return_percentage"],
                regime_status=daily_expected["regime_status"]
            ),
            greeks_commentary=greeks_commentary
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Risk analysis computation failed: {str(e)}")

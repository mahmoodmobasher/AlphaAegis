from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import List, Dict, Any, Optional, Literal

from app.routers.risk_analytics import (
    RiskInput,
    parse_positions,
    calculate_factor_exposures,
    calculate_beta_weighted_delta,
    calculate_value_at_risk,
    calculate_compliance_alert,
    get_spx_price
)
from app.services.agents import run_investment_committee, parse_natural_language_query

router = APIRouter(prefix="/agents", tags=["AI Agent Investment Committee Room"])

# ----------------------------------------------------------------------
# PYDANTIC SCHEMAS FOR INPUT/OUTPUT
# ----------------------------------------------------------------------

class CommandRequestInput(BaseModel):
    query: str

class CommandFilters(BaseModel):
    ticker: Optional[str] = None
    early_assignment_risk: Optional[Literal["Critical", "Medium", "Low"]] = None
    asset_type: Optional[Literal["OPTION", "EQUITY"]] = None
    position_type: Optional[Literal["SHORT", "LONG"]] = None
    factor_high: Optional[Literal["momentum", "growth", "value"]] = None
    expiration_days_lte: Optional[int] = Field(default=None, ge=0)

    @field_validator("ticker", mode="before")
    @classmethod
    def validate_ticker(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        if isinstance(v, str):
            v_clean = v.strip().upper()
            return v_clean if v_clean else None
        return None

    @field_validator("early_assignment_risk", mode="before")
    @classmethod
    def validate_early_assignment_risk(cls, v: Any) -> Optional[Literal["Critical", "Medium", "Low"]]:
        if v is None:
            return None
        if isinstance(v, str):
            v_clean = v.strip().capitalize()
            if v_clean in ("Critical", "Medium", "Low"):
                return v_clean
        return None

    @field_validator("asset_type", mode="before")
    @classmethod
    def validate_asset_type(cls, v: Any) -> Optional[Literal["OPTION", "EQUITY"]]:
        if v is None:
            return None
        if isinstance(v, str):
            v_clean = v.strip().upper()
            if v_clean in ("STOCKS", "EQUITIES"):
                return "EQUITY"
            if v_clean == "OPTIONS":
                return "OPTION"
            if v_clean in ("OPTION", "EQUITY"):
                return v_clean
        return None

    @field_validator("position_type", mode="before")
    @classmethod
    def validate_position_type(cls, v: Any) -> Optional[Literal["SHORT", "LONG"]]:
        if v is None:
            return None
        if isinstance(v, str):
            v_clean = v.strip().upper()
            if v_clean in ("SHORT", "LONG"):
                return v_clean
        return None

    @field_validator("factor_high", mode="before")
    @classmethod
    def validate_factor_high(cls, v: Any) -> Optional[Literal["momentum", "growth", "value"]]:
        if v is None:
            return None
        if isinstance(v, str):
            v_clean = v.strip().lower()
            if v_clean in ("momentum", "growth", "value"):
                return v_clean
        return None

    @field_validator("expiration_days_lte", mode="before")
    @classmethod
    def validate_expiration_days_lte(cls, v: Any) -> Optional[int]:
        if v is None:
            return None
        try:
            val = int(float(str(v).strip()))
            if val >= 0:
                return val
        except (ValueError, TypeError):
            pass
        return None

class DebateMessage(BaseModel):
    agent: str
    avatar: str
    message: str

class TradeDraftLeg(BaseModel):
    strike: float
    type: str
    expiration: str
    position_type: str
    delta: float

class StagedTradeDraft(BaseModel):
    ticker: str
    type: str
    action: str
    size: int
    description: Optional[str] = None
    avg_price: Optional[float] = None
    current_price: Optional[float] = None
    legs: Optional[List[TradeDraftLeg]] = []

class StagedRecommendation(BaseModel):
    id: str
    ticker: str
    type: str
    action: str
    description: str
    trade_draft: StagedTradeDraft

class DebateResponse(BaseModel):
    debate_logs: List[DebateMessage]
    advisory_report: str
    recommendations: List[StagedRecommendation]
    summary_report: Optional[str] = None

class CommandResponse(BaseModel):
    filters: CommandFilters
    message: str

# ----------------------------------------------------------------------
# ROUTE HANDLERS
# ----------------------------------------------------------------------

@router.post("/debate", response_model=DebateResponse)
async def get_agent_debate(payload: RiskInput):
    """
    Ingest portfolio data, calculate detailed risk metrics, and run
    the investment committee debate loops over the pro-forma state.
    """
    try:
        # 1. Parse raw positions using Phase 1 & 2 models
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
        
        # 2. Get baseline SPX and run calculations
        spx_price = get_spx_price()
        factor_exp = calculate_factor_exposures(parsed_positions)
        beta_weighted = calculate_beta_weighted_delta(parsed_positions, spx_price)
        var_limits = calculate_value_at_risk(parsed_positions)
        
        net_liq = payload.portfolio_summary.net_liquidity
        maint_margin = payload.portfolio_summary.maintenance_margin
        compliance_status = calculate_compliance_alert(net_liq, maint_margin)
        
        # Decorate parsed positions lists
        formatted_positions = []
        for p in parsed_positions:
            formatted_positions.append({
                "ticker": p["ticker"],
                "type": p["type"],
                "strategy_name": p.get("strategy_name"),
                "size": p["size"],
                "price": p["price"],
                "beta": p["beta"],
                "delta": p["delta"],
                "market_value": p["market_value"],
                "delta_equivalent": p["delta_equivalent"],
                "early_assignment_risk": p.get("early_assignment_risk"),
                "days_to_liquidate": p["days_to_liquidate"],
                "adv": p["adv"],
                "legs": p.get("legs", [])
            })
            
        # 3. Build unified state dict
        portfolio_state = {
            "portfolio_summary": {
                "net_liquidity": net_liq,
                "excess_liquidity": payload.portfolio_summary.excess_liquidity,
                "maintenance_margin": maint_margin,
                "daily_pnl": payload.portfolio_summary.daily_pnl
            },
            "compliance": compliance_status,
            "value_at_risk": var_limits,
            "factor_exposure": factor_exp,
            "beta_weighted_delta": beta_weighted,
            "positions": formatted_positions
        }
        
        # 4. Run dialectical debate loops
        res = await run_investment_committee(portfolio_state)
        return DebateResponse(
            debate_logs=res["debate_logs"],
            advisory_report=res["advisory_report"],
            recommendations=res["recommendations"],
            summary_report=res.get("summary_report")
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Committee debate failed: {str(e)}")

@router.post("/command", response_model=CommandResponse)
def execute_natural_language_command(payload: CommandRequestInput):
    """
    Parses a natural language query from the command bar into a structured filter payload.
    """
    try:
        res = parse_natural_language_query(payload.query)
        validated_filters = CommandFilters(**res.get("filters", {}))
        return CommandResponse(
            filters=validated_filters,
            message=res.get("message", "Applied filters.")
        )
    except Exception as e:
        return CommandResponse(
            filters=CommandFilters(),
            message=f"Command validation fell back to default: {str(e)}"
        )

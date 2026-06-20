from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

# Database related schemas
class StrategyLegBase(BaseModel):
    option_type: str = Field(..., description="CALL or PUT")
    action: str = Field(..., description="BUY or SELL")
    strike_price: float
    expiration_date: str = Field(..., description="YYYY-MM-DD string")
    quantity: int = Field(default=1, ge=1)
    premium: float

class StrategyLegCreate(StrategyLegBase):
    pass

class StrategyLegResponse(StrategyLegBase):
    id: int
    strategy_id: int

    class Config:
        from_attributes = True

class StrategyBase(BaseModel):
    name: str
    underlying_symbol: str

class StrategyCreate(StrategyBase):
    legs: List[StrategyLegCreate]

class StrategyResponse(StrategyBase):
    id: int
    user_id: int
    created_at: datetime
    legs: List[StrategyLegResponse]

    class Config:
        from_attributes = True


# Calculations schemas
class LegCalculationInput(BaseModel):
    option_type: str  # "CALL" or "PUT"
    action: str       # "BUY" or "SELL"
    strike_price: float
    expiration_date: str # YYYY-MM-DD string
    quantity: int = 1
    premium: float
    days_to_expiration: float # Computed on client, or we compute on server if preferred. Let's pass it.

class CalculationInput(BaseModel):
    underlying_symbol: str
    underlying_price: float
    implied_volatility: float
    risk_free_rate: float = 0.05
    legs: List[LegCalculationInput]

class GreeksResponse(BaseModel):
    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float
    position_delta: float
    position_gamma: float
    position_theta: float
    position_vega: float
    position_rho: float

class LegCalculationResult(BaseModel):
    leg_index: int
    price: float
    position_value: float
    greeks: GreeksResponse

class CalculationResult(BaseModel):
    legs: List[LegCalculationResult]
    net_price: float
    net_position_value: float
    net_greeks: GreeksResponse

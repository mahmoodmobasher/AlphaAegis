from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

# Portfolio Leg Schemas
class PortfolioLegBase(BaseModel):
    sec_type: Optional[str] = "OPT"
    option_type: str = Field(..., description="CALL or PUT")
    action: str = Field(..., description="BUY or SELL")
    strike_price: float
    expiration_date: str  # YYYY-MM-DD
    quantity: int = 1
    premium: float

class PortfolioLegCreate(PortfolioLegBase):
    pass

class PortfolioLegResponse(PortfolioLegBase):
    id: int
    position_id: int

    class Config:
        from_attributes = True

# Portfolio Position Schemas
class PortfolioPositionBase(BaseModel):
    name: str
    underlying_symbol: str
    entry_price: float
    quantity: int = 1

class PortfolioPositionCreate(PortfolioPositionBase):
    legs: List[PortfolioLegCreate]

class PortfolioPositionResponse(PortfolioPositionBase):
    id: int
    user_id: int
    created_at: datetime
    legs: List[PortfolioLegResponse]

    class Config:
        from_attributes = True

# Watchlist Schemas
class WatchlistBase(BaseModel):
    symbol: str

class WatchlistCreate(WatchlistBase):
    pass

class WatchlistResponse(WatchlistBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Trade Note Schemas
class TradeNoteBase(BaseModel):
    symbol: str
    note_text: str

class TradeNoteCreate(TradeNoteBase):
    pass

class TradeNoteResponse(TradeNoteBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True

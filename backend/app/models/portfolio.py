"""
SQLAlchemy models for portfolio positions, option legs, watchlists, and trade notes.
Used to persist user portfolios and preferences in AlphaAegis.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class PortfolioPosition(Base):
    __tablename__ = "portfolio_positions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    underlying_symbol = Column(String, nullable=False)
    entry_price = Column(Float, nullable=False)  # entry premium/cost per share
    quantity = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    legs = relationship("PortfolioLeg", back_populates="position", cascade="all, delete-orphan")

class PortfolioLeg(Base):
    __tablename__ = "portfolio_legs"

    id = Column(Integer, primary_key=True, index=True)
    position_id = Column(Integer, ForeignKey("portfolio_positions.id", ondelete="CASCADE"), nullable=False)
    option_type = Column(String, nullable=False)  # "CALL" or "PUT"
    action = Column(String, nullable=False)       # "BUY" or "SELL"
    strike_price = Column(Float, nullable=False)
    expiration_date = Column(String, nullable=False)  # Store as YYYY-MM-DD string
    quantity = Column(Integer, default=1, nullable=False)
    premium = Column(Float, nullable=False)

    # Relationships
    position = relationship("PortfolioPosition", back_populates="legs")

class Watchlist(Base):
    __tablename__ = "watchlists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    symbol = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class TradeNote(Base):
    __tablename__ = "trade_notes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    symbol = Column(String, nullable=False)
    note_text = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

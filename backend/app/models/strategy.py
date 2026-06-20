"""
SQLAlchemy database models for options strategies and strategy legs.
Used to persist predefined and custom multi-leg options spreads configured by users.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Date
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class Strategy(Base):
    __tablename__ = "strategies"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    underlying_symbol = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", back_populates="strategies")
    legs = relationship("StrategyLeg", back_populates="strategy", cascade="all, delete-orphan")

class StrategyLeg(Base):
    __tablename__ = "strategy_legs"

    id = Column(Integer, primary_key=True, index=True)
    strategy_id = Column(Integer, ForeignKey("strategies.id", ondelete="CASCADE"), nullable=False)
    option_type = Column(String, nullable=False)  # "CALL" or "PUT"
    action = Column(String, nullable=False)       # "BUY" or "SELL"
    strike_price = Column(Float, nullable=False)
    expiration_date = Column(String, nullable=False) # Store as YYYY-MM-DD string
    quantity = Column(Integer, default=1, nullable=False)
    premium = Column(Float, nullable=False)

    # Relationships
    strategy = relationship("Strategy", back_populates="legs")

"""
SQLAlchemy database models for User accounts, containing authentication info,
profile fields, account summary metrics (net liquidation, margin metrics), and relationships.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Account summary cash/margin metrics persisted from snapshot
    net_liquidation = Column(Float, default=0.0)
    total_cash_value = Column(Float, default=0.0)
    buying_power = Column(Float, default=0.0)
    maint_margin_req = Column(Float, default=0.0)

    # Relationship to strategies
    strategies = relationship("Strategy", back_populates="user", cascade="all, delete-orphan")
    ib_configs = relationship("IBConfig", back_populates="user", cascade="all, delete-orphan")

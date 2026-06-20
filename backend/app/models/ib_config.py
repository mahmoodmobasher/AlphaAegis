"""
SQLAlchemy database models for Interactive Brokers (IB) configuration settings.
Stores host, port, client ID, credentials, SSL, and connectivity mode.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class IBConfig(Base):
    __tablename__ = "ib_configs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    host = Column(String, default="127.0.0.1", nullable=False)
    port = Column(Integer, nullable=False)
    client_id = Column(Integer, nullable=False)
    account_id = Column(String, nullable=True)
    api_key = Column(String, nullable=True)
    api_secret = Column(String, nullable=True)
    use_ssl = Column(Boolean, default=True)
    mode = Column(String, default="paper")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationship back to user
    user = relationship("User", back_populates="ib_configs")

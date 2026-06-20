"""
Configuration settings for the AlphaAegis backend.
Includes database URL, secret key, JWT settings, and Redis URL.
Updated to use Pydantic Settings and includes placeholder secret key for development.
"""

from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./dev.db"
    SECRET_KEY: str = "7c9c0b115456fd71c26b52c0f68d6ef7146522c0022fa568b20ff8061bd89e2e" # Placeholder secret
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    REDIS_URL: Optional[str] = None

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

from sqlalchemy import Column, String, DateTime, Boolean
from datetime import datetime, timezone
from app.database import Base

class LLMProviderConfig(Base):
    __tablename__ = "llm_provider_configs"

    provider_id = Column(String, primary_key=True, index=True) # e.g. 'openai', 'ollama', 'anthropic'
    display_name = Column(String, nullable=False)
    api_base_url = Column(String, nullable=True)
    encrypted_api_key = Column(String, nullable=True)
    default_model = Column(String, nullable=False)
    is_active = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import logging

from app.database import get_db
from app.models.llm_config import LLMProviderConfig
from app.services.encryption import encrypt_key
from app.services.llm_router import get_dynamic_model

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/v1/models", tags=["LLM Provider Management"])

# Pydantic schemas
class LLMProviderConfigSchema(BaseModel):
    provider_id: str
    display_name: str
    api_base_url: Optional[str] = None
    api_key: Optional[str] = None
    default_model: str
    is_active: bool = False

class LLMProviderConfigResponse(BaseModel):
    provider_id: str
    display_name: str
    api_base_url: Optional[str] = None
    default_model: str
    is_active: bool

    class Config:
        from_attributes = True

class LLMTestRequest(BaseModel):
    provider_id: str
    model_name: Optional[str] = None
    temperature: float = 0.0

@router.get("/configs", response_model=List[LLMProviderConfigResponse])
def get_configs(db: Session = Depends(get_db)):
    """
    Returns the current array state of saved configurations, omitting sensitive API keys.
    """
    configs = db.query(LLMProviderConfig).all()
    return configs

@router.post("/configs/save")
def save_config(config_data: LLMProviderConfigSchema, db: Session = Depends(get_db)):
    """
    Saves or updates an LLM provider configuration, safely encrypting cloud tokens.
    """
    if config_data.is_active:
        # Deactivate all other configs to ensure single active provider
        db.query(LLMProviderConfig).update({LLMProviderConfig.is_active: False})

    config = db.query(LLMProviderConfig).filter(LLMProviderConfig.provider_id == config_data.provider_id).first()
    if config:
        config.display_name = config_data.display_name
        config.api_base_url = config_data.api_base_url
        config.default_model = config_data.default_model
        config.is_active = config_data.is_active
        if config_data.api_key:
            config.encrypted_api_key = encrypt_key(config_data.api_key)
    else:
        encrypted_key = encrypt_key(config_data.api_key) if config_data.api_key else None
        config = LLMProviderConfig(
            provider_id=config_data.provider_id,
            display_name=config_data.display_name,
            api_base_url=config_data.api_base_url,
            encrypted_api_key=encrypted_key,
            default_model=config_data.default_model,
            is_active=config_data.is_active
        )
        db.add(config)
    db.commit()
    return {"status": "success", "message": f"Configuration for '{config_data.provider_id}' saved successfully"}

@router.post("/configs/test")
async def test_config(test_data: LLMTestRequest):
    """
    Validates a specific LLM provider configuration by establishing a connection 
    (without fallback) and running a lightweight validation request.
    """
    try:
        # Instantiate model directly without fallback to ensure the actual endpoint works
        llm = await get_dynamic_model(
            provider_id=test_data.provider_id,
            model_name=test_data.model_name or "",
            temperature=test_data.temperature,
            fallback=False
        )
        # Issue a lightweight validation request
        response = await llm.ainvoke("ping")
        if response:
            return {"status": "success", "message": "Connection test passed successfully"}
        else:
            raise HTTPException(status_code=400, detail="LLM returned an empty response")
    except Exception as e:
        logger.error(f"LLM connection test failed for provider '{test_data.provider_id}': {e}")
        raise HTTPException(status_code=400, detail=f"LLM connection test failed: {str(e)}")

@router.get("/ollama/available", response_model=List[str])
async def get_available_ollama_models():
    """
    Queries local Ollama tags registry to find available models.
    Falls back to a default list if Ollama is unreachable.
    """
    fallback_models = ["qwen3:latest", "mistral:latest", "llama3.2:latest"]
    try:
        import httpx
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get("http://127.0.0.1:11434/api/tags")
            if response.status_code == 200:
                data = response.json()
                models = data.get("models", [])
                model_names = [m.get("name") for m in models if m.get("name")]
                if model_names:
                    return model_names
    except Exception as e:
        logger.warning(f"Ollama server /api/tags registry query failed: {e}. Returning fallback model list.")
    
    return fallback_models


try:
    from langchain.chat_models import init_chat_model
except ImportError:
    def init_chat_model(*args, **kwargs):
        raise ImportError("langchain package is required for LLM functionality")
from app.database import SessionLocal
from app.models.llm_config import LLMProviderConfig
from app.services.encryption import decrypt_key
import logging

logger = logging.getLogger("uvicorn.error")

async def get_dynamic_model(provider_id: str, model_name: str, temperature: float = 0.0, fallback: bool = True):
    """
    Asynchronously initializes a dynamic chat model via LangChain's init_chat_model abstraction.
    Queries database for dynamic configuration settings (URLs, API keys) on the fly, 
    falling back to local Ollama if initialization fails or service is offline.
    """
    fallback_provider = "ollama"
    fallback_model = "mistral:latest"
    fallback_api_base = "http://127.0.0.1:11434"
    
    db = SessionLocal()
    api_base_url = None
    decrypted_key = None
    try:
        config = db.query(LLMProviderConfig).filter(LLMProviderConfig.provider_id == provider_id).first()
        if config:
            api_base_url = config.api_base_url
            if config.encrypted_api_key:
                decrypted_key = decrypt_key(config.encrypted_api_key)
            if not model_name:
                model_name = config.default_model
    except Exception as e:
        logger.warning(f"Error querying LLMProviderConfig in get_dynamic_model: {e}")
    finally:
        db.close()

    # Active fallback mapping: if provider_id == 'ollama' and api_base_url is null, automatically default it
    if provider_id == "ollama" and not api_base_url:
        api_base_url = "http://127.0.0.1:11434"

    # Enforce defaults if model name is still empty
    if not model_name:
        model_name = "llama3" if provider_id == "ollama" else "gpt-4o"

    kwargs = {
        "model": model_name,
        "model_provider": provider_id,
        "temperature": temperature
    }

    if api_base_url:
        kwargs["api_base"] = api_base_url

    if decrypted_key:
        kwargs["api_key"] = decrypted_key

    try:
        logger.info(f"Initializing dynamic LLM client: provider={provider_id}, model={model_name}, api_base={api_base_url}")
        llm = init_chat_model(**kwargs)
        return llm
    except Exception as e:
        logger.error(f"Failed to initialize dynamic LLM client {provider_id}/{model_name}: {e}.")
        if not fallback:
            raise e
        logger.info("Attempting local Ollama fallback...")
        try:
            llm = init_chat_model(
                model=fallback_model,
                model_provider=fallback_provider,
                api_base=fallback_api_base,
                temperature=temperature
            )
            return llm
        except Exception as fe:
            logger.critical(f"Ollama fallback initialization failed: {fe}")
            raise fe

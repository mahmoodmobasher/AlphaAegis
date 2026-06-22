import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.llm_config import LLMProviderConfig
from app.services.encryption import decrypt_key

# Use a file-based SQLite database for testing to avoid in-memory connection loss issues
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override database dependency for tests
def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)

def test_save_and_retrieve_configs():
    # Save a configuration
    payload = {
        "provider_id": "openai",
        "display_name": "OpenAI Production",
        "api_base_url": "https://api.openai.com/v1",
        "api_key": "sk-1234567890",
        "default_model": "gpt-4o",
        "is_active": True
    }
    response = client.post("/api/v1/models/configs/save", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "success"

    # Get the configs and verify the key is omitted
    response = client.get("/api/v1/models/configs")
    assert response.status_code == 200
    configs = response.json()
    assert len(configs) == 1
    assert configs[0]["provider_id"] == "openai"
    assert configs[0]["display_name"] == "OpenAI Production"
    assert configs[0]["default_model"] == "gpt-4o"
    assert configs[0]["is_active"] is True
    # Ensure api_key or encrypted_api_key is not in response
    assert "api_key" not in configs[0]
    assert "encrypted_api_key" not in configs[0]

    # Verify database entry has encrypted key and we can decrypt it
    db = TestingSessionLocal()
    try:
        db_config = db.query(LLMProviderConfig).filter_by(provider_id="openai").first()
        assert db_config is not None
        assert db_config.encrypted_api_key != "sk-1234567890"
        decrypted = decrypt_key(db_config.encrypted_api_key)
        assert decrypted == "sk-1234567890"
    finally:
        db.close()

def test_singleton_active_status():
    # Save first configuration as active
    payload1 = {
        "provider_id": "openai",
        "display_name": "OpenAI Production",
        "api_base_url": "https://api.openai.com/v1",
        "api_key": "sk-123",
        "default_model": "gpt-4o",
        "is_active": True
    }
    response = client.post("/api/v1/models/configs/save", json=payload1)
    assert response.status_code == 200

    # Save second configuration as active
    payload2 = {
        "provider_id": "ollama",
        "display_name": "Local Ollama",
        "api_base_url": "http://127.0.0.1:11434",
        "api_key": "",
        "default_model": "mistral:latest",
        "is_active": True
    }
    response = client.post("/api/v1/models/configs/save", json=payload2)
    assert response.status_code == 200

    # Fetch and check that only second is active
    response = client.get("/api/v1/models/configs")
    configs = response.json()
    assert len(configs) == 2
    
    openai_cfg = next(c for c in configs if c["provider_id"] == "openai")
    ollama_cfg = next(c for c in configs if c["provider_id"] == "ollama")
    
    assert openai_cfg["is_active"] is False
    assert ollama_cfg["is_active"] is True

def test_connection_validation_endpoint(monkeypatch):
    class MockMessage:
        def __init__(self, content):
            self.content = content

    class MockLLM:
        async def ainvoke(self, prompt, **kwargs):
            return MockMessage("pong")

    async def mock_get_dynamic_model(provider_id, model_name, temperature=0.0, fallback=True):
        return MockLLM()

    monkeypatch.setattr("app.api.v1.models.get_dynamic_model", mock_get_dynamic_model)

    test_payload = {
        "provider_id": "openai",
        "model_name": "gpt-4o",
        "temperature": 0.0
    }
    response = client.post("/api/v1/models/configs/test", json=test_payload)
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert "test passed" in response.json()["message"].lower()

def test_get_available_ollama_models(monkeypatch):
    import httpx

    # Test unreachable daemon fallback baseline by mocking connection refusal
    async def mock_async_get_fail(self, url, *args, **kwargs):
        raise httpx.ConnectError("Connection refused")

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_async_get_fail)

    response = client.get("/api/v1/models/ollama/available")
    assert response.status_code == 200
    assert response.json() == ["qwen3:latest", "mistral:latest", "llama3.2:latest"]

    # Test successful API registry query
    class MockResponse:
        status_code = 200
        def json(self):
            return {
                "models": [
                    {"name": "llama3:latest"},
                    {"name": "deepseek-r1:1.5b"}
                ]
            }

    async def mock_async_get_success(self, url, *args, **kwargs):
        if "api/tags" in url:
            return MockResponse()
        raise ValueError("Invalid URL")

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_async_get_success)

    response = client.get("/api/v1/models/ollama/available")
    assert response.status_code == 200
    assert response.json() == ["llama3:latest", "deepseek-r1:1.5b"]


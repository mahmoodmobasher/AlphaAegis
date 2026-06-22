import pytest
import json
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db
from app.tests.test_api import override_get_db, TestingSessionLocal, engine
from app.database import Base

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)

class MockRedisClient:
    async def lrange(self, key, start, end):
        if key == "macro:feed:cache":
            return [
                json.dumps({
                    "headline": "FOMC keeps rates unchanged",
                    "source": "yahoo",
                    "timestamp": "2026-06-21T17:00:00.123456",
                    "sentiment": -0.2,
                    "iv_adj": 0.5,
                    "spot_shock": -0.4
                })
            ]
        return []

def test_feeds_recent_authenticated(monkeypatch):
    mock_redis = MockRedisClient()
    monkeypatch.setattr("app.main.redis_client", mock_redis)

    # Register user
    reg_payload = {
        "email": "feeds_test@alphaaegis.com",
        "password": "securepassword",
        "full_name": "Feeds Tester"
    }
    reg_resp = client.post("/api/auth/register", json=reg_payload)
    assert reg_resp.status_code == 201

    # Login user
    login_payload = {
        "username": "feeds_test@alphaaegis.com",
        "password": "securepassword"
    }
    login_resp = client.post("/api/auth/login", data=login_payload)
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    # Request feeds with auth header
    response = client.get("/api/v1/feeds/recent", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["headline"] == "FOMC keeps rates unchanged"
    assert data[0]["source"] == "yahoo"
    assert data[0]["sentiment"] == -0.2
    assert data[0]["iv_adj"] == 0.5
    assert data[0]["spot_shock"] == -0.4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db
from app.models import User, Strategy, StrategyLeg

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

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "online"

def test_auth_register_and_login():
    # Register user
    reg_payload = {
        "email": "test@optionflow.com",
        "password": "testpassword123",
        "full_name": "Test User"
    }
    response = client.post("/api/auth/register", json=reg_payload)
    assert response.status_code == 201
    assert response.json()["email"] == "test@optionflow.com"
    assert "id" in response.json()
    
    # Login user
    login_payload = {
        "username": "test@optionflow.com",
        "password": "testpassword123"
    }
    response = client.post("/api/auth/login", data=login_payload)
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"
    
    token = response.json()["access_token"]
    
    # Get current user (me)
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["email"] == "test@optionflow.com"

def test_calculate_strategy():
    calc_payload = {
        "underlying_symbol": "AAPL",
        "underlying_price": 150.0,
        "implied_volatility": 0.25,
        "risk_free_rate": 0.05,
        "legs": [
            {
                "option_type": "CALL",
                "action": "BUY",
                "strike_price": 150.0,
                "expiration_date": "2026-07-08",
                "quantity": 1,
                "premium": 4.5,
                "days_to_expiration": 30.0
            },
            {
                "option_type": "CALL",
                "action": "SELL",
                "strike_price": 160.0,
                "expiration_date": "2026-07-08",
                "quantity": 1,
                "premium": 1.2,
                "days_to_expiration": 30.0
            }
        ]
    }
    response = client.post("/api/strategies/calculate", json=calc_payload)
    assert response.status_code == 200
    res_data = response.json()
    
    # We bought 150 Call (debit) and sold 160 Call (credit). Net Price should be around 4.5 - 1.2 = 3.3
    assert 3.1 < res_data["net_price"] < 3.5
    # Net position value should be price * 100
    assert 310.0 < res_data["net_position_value"] < 350.0
    
    # Verify leg specific output
    assert len(res_data["legs"]) == 2
    assert res_data["legs"][0]["greeks"]["delta"] > 0
    assert res_data["legs"][1]["greeks"]["delta"] > 0 # individual call delta is positive
    
    # Verify aggregated greeks
    assert res_data["net_greeks"]["position_delta"] > 0 # Net delta of bull call spread is positive

def test_unauthenticated_expirations_yahoo_success(monkeypatch):
    # Mock YahooFinanceClient to return successful list
    from app.yahoo_finance_client import YahooFinanceClient
    monkeypatch.setattr(YahooFinanceClient, "fetch_expirations", lambda sym: ["2026-10-16", "2026-11-20"])
    
    response = client.get("/api/chain/expirations?symbol=AAPL")
    assert response.status_code == 200
    assert response.json() == ["2026-10-16", "2026-11-20"]

def test_unauthenticated_expirations_yahoo_failure_fallback_mock(monkeypatch):
    # Mock YahooFinanceClient to raise error
    from app.yahoo_finance_client import YahooFinanceClient
    def mock_fail(sym):
        raise ValueError("Yfinance offline")
    monkeypatch.setattr(YahooFinanceClient, "fetch_expirations", mock_fail)
    
    # Mock market_data_provider to return mock dates
    from app.services.market_data import market_data_provider
    monkeypatch.setattr(market_data_provider, "get_expiration_dates", lambda sym: ["2026-06-12", "2026-06-19"])
    
    response = client.get("/api/chain/expirations?symbol=AAPL")
    assert response.status_code == 200
    assert response.json() == ["2026-06-12", "2026-06-19"]

def test_unauthenticated_chain_yahoo_success(monkeypatch):
    # Mock YahooFinanceClient to return successful chain
    from app.yahoo_finance_client import YahooFinanceClient
    mock_response = {
        "underlying_symbol": "AAPL",
        "underlying_price": 185.50,
        "expiration_date": "2026-10-16",
        "days_to_expiration": 120,
        "options": [
            {
                "strike": 185.0,
                "call": {"bid": 5.0, "ask": 5.2, "last": 5.1, "volume": 100, "open_interest": 500, "iv": 0.22, "delta": 0.52, "gamma": 0.02, "vega": 0.15},
                "put": {"bid": 4.0, "ask": 4.2, "last": 4.1, "volume": 80, "open_interest": 400, "iv": 0.22, "delta": -0.48, "gamma": 0.02, "vega": 0.15}
            }
        ],
        "source": "yahoo"
    }
    monkeypatch.setattr(YahooFinanceClient, "fetch_option_chain", lambda sym, exp: mock_response)
    
    response = client.get("/api/chain?symbol=AAPL&expiration=2026-10-16")
    assert response.status_code == 200
    assert response.json()["source"] == "yahoo"
    assert response.json()["underlying_symbol"] == "AAPL"
    assert len(response.json()["options"]) == 1

def test_unauthenticated_chain_yahoo_failure_fallback_mock(monkeypatch):
    # Mock YahooFinanceClient to raise error
    from app.yahoo_finance_client import YahooFinanceClient
    def mock_fail(sym, exp):
        raise ValueError("Yfinance offline")
    monkeypatch.setattr(YahooFinanceClient, "fetch_option_chain", mock_fail)
    
    response = client.get("/api/chain?symbol=AAPL&expiration=2026-06-12")
    assert response.status_code == 200
    # Fallback to mock data provider doesn't have source="yahoo" (typically None or key is missing)
    assert response.json().get("source") != "yahoo"
    assert response.json()["underlying_symbol"] == "AAPL"


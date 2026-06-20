import pytest
import asyncio
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.user import User
from app.models.ib_config import IBConfig

# Setup SQLite test DB - use the same test.db to prevent session collisions
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

client = TestClient(app)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    
    # Create test user
    db = TestingSessionLocal()
    user = User(email="ib_user@optionflow.com", full_name="IB Test User", hashed_password="mocked_password")
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Create test config
    config = IBConfig(user_id=user.id, host="127.0.0.1", port=7497, client_id=1, mode="paper")
    db.add(config)
    db.commit()
    db.refresh(config)
    
    yield
    
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)

def test_get_ib_portfolio_success(monkeypatch):
    # Mock JWT authentication
    from app.services.auth_helpers import get_current_user
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "ib_user@optionflow.com").first()
    config = db.query(IBConfig).filter(IBConfig.user_id == user.id).first()
    
    app.dependency_overrides[get_current_user] = lambda: user
    
    # Mock IBClient and get_global_ib_client
    mock_ib_client = MagicMock()
    mock_ib_client.isConnected.return_value = True
    
    # Mock summary_event to prevent await failures on MagicMock
    from unittest.mock import AsyncMock
    mock_ib_client.summary_event = MagicMock()
    mock_ib_client.summary_event.wait = AsyncMock()
    
    # Mock account summary data
    mock_ib_client.account_summary = {}
    
    def mock_req_summary(reqId, group, tags):
        mock_ib_client.account_summary.update({
            "NetLiquidation": {"value": "100000.00", "currency": "USD"},
            "TotalCashValue": {"value": "50000.00", "currency": "USD"},
            "BuyingPower": {"value": "200000.00", "currency": "USD"}
        })
        
    mock_ib_client.reqAccountSummary = MagicMock(side_effect=mock_req_summary)
    
    # Mock positions data
    mock_positions = [
        {
            "account": "U12345",
            "symbol": "AAPL",
            "secType": "STK",
            "expiry": "",
            "strike": 0.0,
            "right": "",
            "multiplier": "",
            "position": 100.0,
            "avgCost": 150.0,
            "localSymbol": "AAPL"
        },
        {
            "account": "U12345",
            "symbol": "MSFT",
            "secType": "OPT",
            "expiry": "20260619",
            "strike": 400.0,
            "right": "C",
            "multiplier": "100",
            "position": 2.0,
            "avgCost": 5.0,
            "localSymbol": "MSFT 260619C00400000"
        }
    ]
    
    # Mock positions data using AsyncMock for the coroutine method
    from unittest.mock import AsyncMock
    mock_ib_client.fetch_positions = AsyncMock(return_value=mock_positions)
    
    # Mock get_global_ib_client to return our mock_ib_client
    async def mock_get_global_client(host, port, client_id):
        return mock_ib_client
        
    monkeypatch.setattr("app.routers.ib.get_global_ib_client", mock_get_global_client)
    
    # Execute call
    response = client.get(f"/api/ib/portfolio?config_id={config.id}")
    print("RESPONSE STATUS:", response.status_code)
    print("RESPONSE BODY:", response.text)
    
    assert response.status_code == 200
    res_data = response.json()
    assert "summary" in res_data
    assert "positions" in res_data
    
    # Check NetLiquidation mock
    assert res_data["summary"]["NetLiquidation"]["value"] == "100000.00"
    
    # Check that aggregated summary greeks exist
    assert "greeks" in res_data["summary"]
    assert "delta" in res_data["summary"]["greeks"]
    assert "gamma" in res_data["summary"]["greeks"]
    assert "theta" in res_data["summary"]["greeks"]
    assert "vega" in res_data["summary"]["greeks"]
    
    # Check positions mapping
    positions = res_data["positions"]
    assert len(positions) == 2
    
    # Check AAPL calculations
    aapl = [p for p in positions if p["symbol"] == "AAPL"][0]
    assert aapl["costBasis"] == 15000.0
    assert aapl["marketPrice"] > 0
    assert aapl["marketValue"] > 0
    assert "unrealizedPnL" in aapl
    # Stock Greeks check (Delta should be equal to position size, others 0)
    assert aapl["greeks"]["delta"] == 100.0
    assert aapl["greeks"]["gamma"] == 0.0
    assert aapl["greeks"]["theta"] == 0.0
    assert aapl["greeks"]["vega"] == 0.0
    
    # Check MSFT (Option) calculations
    msft = [p for p in positions if p["symbol"] == "MSFT"][0]
    assert msft["costBasis"] == 1000.0 # 2 * 5.0 * 100
    assert msft["marketPrice"] > 0
    assert msft["marketValue"] > 0
    assert "unrealizedPnL" in msft
    # Options Greeks check (should have computed values from Black-Scholes)
    assert "greeks" in msft
    assert "delta" in msft["greeks"]
    assert msft["greeks"]["delta"] != 0.0
    assert msft["greeks"]["gamma"] != 0.0
    assert msft["greeks"]["theta"] != 0.0
    assert msft["greeks"]["vega"] != 0.0
    
    # Aggregated greeks should reflect the sum
    assert res_data["summary"]["greeks"]["delta"] == aapl["greeks"]["delta"] + msft["greeks"]["delta"]

def test_snapshot_ib_portfolio_success(monkeypatch):
    from app.services.auth_helpers import get_current_user
    from app.models.portfolio import PortfolioPosition, PortfolioLeg
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "ib_user@optionflow.com").first()
    config = db.query(IBConfig).filter(IBConfig.user_id == user.id).first()
    
    app.dependency_overrides[get_current_user] = lambda: user
    
    # Mock IBClient
    mock_ib_client = MagicMock()
    mock_ib_client.isConnected.return_value = True
    mock_ib_client.summary_event = MagicMock()
    from unittest.mock import AsyncMock
    mock_ib_client.summary_event.wait = AsyncMock()
    mock_ib_client.account_summary = {}
    
    mock_positions = [
        {
            "account": "U12345",
            "symbol": "AAPL",
            "secType": "STK",
            "expiry": "",
            "strike": 0.0,
            "right": "",
            "multiplier": "",
            "position": 100.0,
            "avgCost": 150.0,
            "localSymbol": "AAPL"
        },
        {
            "account": "U12345",
            "symbol": "MSFT",
            "secType": "OPT",
            "expiry": "20260619",
            "strike": 400.0,
            "right": "C",
            "multiplier": "100",
            "position": 2.0,
            "avgCost": 5.0,
            "localSymbol": "MSFT 260619C00400000"
        }
    ]
    
    from unittest.mock import AsyncMock
    mock_ib_client.fetch_positions = AsyncMock(return_value=mock_positions)
    
    async def mock_get_global_client(host, port, client_id):
        return mock_ib_client
        
    monkeypatch.setattr("app.ib_client.get_global_ib_client", mock_get_global_client)
    
    # Execute call
    response = client.post(f"/api/portfolio/snapshot-ib?config_id={config.id}")
    assert response.status_code == 200
    assert response.json() == {"success": True, "positions_imported": 2}
    
    # Verify DB content
    db_positions = db.query(PortfolioPosition).filter(PortfolioPosition.user_id == user.id).all()
    assert len(db_positions) == 2
    
    aapl_pos = [p for p in db_positions if p.underlying_symbol == "AAPL"][0]
    assert aapl_pos.name == "AAPL Stock"
    assert aapl_pos.entry_price == 150.0
    assert aapl_pos.quantity == 100
    assert len(aapl_pos.legs) == 0  # Stock has no legs!
    
    msft_pos = [p for p in db_positions if p.underlying_symbol == "MSFT"][0]
    assert msft_pos.entry_price == 0.0
    assert len(msft_pos.legs) == 1
    leg = msft_pos.legs[0]
    assert leg.option_type == "CALL"
    assert leg.action == "BUY"
    assert leg.strike_price == 400.0
    assert leg.expiration_date == "2026-06-19"
    assert leg.quantity == 2

    # Get user portfolio and verify computed metrics
    response = client.get("/api/portfolio")
    assert response.status_code == 200
    portfolio_data = response.json()
    
    # Verify msft position metrics
    positions = portfolio_data["positions"]
    msft_summary = [p for p in positions if p["underlying_symbol"] == "MSFT"][0]
    # Entry cost should be: net_premium * strategy_qty * 100 = (5.0 * 2) * 1 * 100 = 1000.0
    assert msft_summary["entry_cost"] == 1000.0
    
    # Verify aapl position metrics (Stock)
    aapl_summary = [p for p in positions if p["underlying_symbol"] == "AAPL"][0]
    # Entry cost = 150.0 * 100 = 15000.0
    assert aapl_summary["entry_cost"] == 15000.0


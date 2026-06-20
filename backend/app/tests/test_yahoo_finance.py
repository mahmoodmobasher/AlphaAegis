import pytest
from unittest.mock import MagicMock, patch
import pandas as pd
from app.yahoo_finance_client import YahooFinanceClient

def test_fetch_expirations():
    with patch("app.yahoo_finance_client.yf.Ticker") as mock_ticker_class:
        mock_ticker = MagicMock()
        mock_ticker.options = ["2026-06-12", "2026-06-19"]
        mock_ticker_class.return_value = mock_ticker
        
        expirations = YahooFinanceClient.fetch_expirations("AAPL")
        assert expirations == ["2026-06-12", "2026-06-19"]
        mock_ticker_class.assert_called_once_with("AAPL")

def test_fetch_option_chain_success():
    with patch("app.yahoo_finance_client.yf.Ticker") as mock_ticker_class:
        mock_ticker = MagicMock()
        mock_ticker.info = {"regularMarketPrice": 185.0}
        mock_ticker.options = ["2026-06-12"]
        
        # Mock option chain dataframes
        calls_data = {
            "strike": [180.0, 185.0],
            "bid": [6.0, 2.5],
            "ask": [6.2, 2.7],
            "lastPrice": [6.1, 2.6],
            "volume": [100, 200],
            "openInterest": [1000, 2000],
            "impliedVolatility": [0.22, 0.23]
        }
        puts_data = {
            "strike": [180.0, 185.0],
            "bid": [1.5, 3.5],
            "ask": [1.7, 3.7],
            "lastPrice": [1.6, 3.6],
            "volume": [50, 150],
            "openInterest": [500, 1500],
            "impliedVolatility": [0.21, 0.22]
        }
        
        mock_chain = MagicMock()
        mock_chain.calls = pd.DataFrame(calls_data)
        mock_chain.puts = pd.DataFrame(puts_data)
        mock_ticker.option_chain.return_value = mock_chain
        
        mock_ticker_class.return_value = mock_ticker
        
        chain = YahooFinanceClient.fetch_option_chain("AAPL", "2026-06-12")
        
        assert chain["underlying_symbol"] == "AAPL"
        assert chain["underlying_price"] == 185.0
        assert chain["source"] == "yahoo"
        assert len(chain["options"]) == 2
        
        # Check strike 185
        strike_185 = [o for o in chain["options"] if o["strike"] == 185.0][0]
        assert strike_185["call"]["bid"] == 2.5
        assert strike_185["put"]["ask"] == 3.7
        # Greeks should be non-zero since they are calculated via BS
        assert strike_185["call"]["delta"] > 0
        assert strike_185["put"]["delta"] < 0

def test_fetch_option_chain_invalid_expiration():
    with patch("app.yahoo_finance_client.yf.Ticker") as mock_ticker_class:
        mock_ticker = MagicMock()
        mock_ticker.info = {"regularMarketPrice": 185.0}
        mock_ticker.options = ["2026-06-12"]
        mock_ticker_class.return_value = mock_ticker
        
        with pytest.raises(ValueError, match="Expiration 2026-06-19 not available"):
            YahooFinanceClient.fetch_option_chain("AAPL", "2026-06-19")

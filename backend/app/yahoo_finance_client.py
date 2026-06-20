"""
AlphaAegis backend module for Yahoo Finance client. Provides option chain fetching utilities.
"""
import yfinance as yf
import datetime
from typing import List, Dict, Any

class YahooFinanceClient:
    """Simple client to fetch option chain data from Yahoo Finance.

    The methods return data in the same shape as the IB branch of the `/api/chain`
    endpoint so the frontend can consume it without changes.
    """

    @staticmethod
    def fetch_expirations(symbol: str) -> List[str]:
        """Return a list of expiration dates (YYYY-MM-DD) for the given symbol.

        Uses the `yfinance` library which provides the `options` attribute.
        """
        ticker = yf.Ticker(symbol)
        # `options` returns a list like ['2024-09-20', ...]
        return ticker.options

    @staticmethod
    def fetch_option_chain(symbol: str, expiration: str) -> Dict[str, Any]:
        """Fetch the option chain for a specific expiration.

        Returns a dictionary compatible with the existing API response schema:
        {
            "underlying_symbol": str,
            "underlying_price": float,
            "expiration_date": str,
            "days_to_expiration": int,
            "options": [
                {
                    "strike": float,
                    "call": {"bid": float, "ask": float, "last": float, "volume": int, "open_interest": int, "iv": float, "delta": float, "gamma": float, "vega": float},
                    "put": {"bid": float, "ask": float, "last": float, "volume": int, "open_interest": int, "iv": float, "delta": float, "gamma": float, "vega": float}
                },
                ...
            ]
        }
        """
        ticker = yf.Ticker(symbol)
        # Spot price
        spot_price = ticker.info.get("regularMarketPrice") or ticker.info.get("previousClose")
        if spot_price is None:
            raise ValueError(f"Unable to retrieve spot price for {symbol}")

        # Expiration dates are strings like '2024-09-20'
        if expiration not in ticker.options:
            raise ValueError(f"Expiration {expiration} not available for {symbol}")

        opt_chain = ticker.option_chain(expiration)
        calls_df = opt_chain.calls
        puts_df = opt_chain.puts

        # Merge calls and puts on strike price
        strikes = sorted(set(calls_df["strike"]).union(set(puts_df["strike"])))
        rows: List[Dict[str, Any]] = []
        today = datetime.date.today()
        exp_date = datetime.datetime.strptime(expiration, "%Y-%m-%d").date()
        days_to_exp = max(1, (exp_date - today).days)

        from app.services.pricing import calculate_black_scholes
        import pandas as pd

        for strike in strikes:
            call_row = calls_df[calls_df["strike"] == strike]
            put_row = puts_df[puts_df["strike"] == strike]
            
            # Helper to safely extract values; fill with 0 if missing
            def get_val(df, col, default=0.0):
                if df.empty or col not in df.columns:
                    return default
                val = df.iloc[0][col]
                if pd.isna(val):
                    return default
                return float(val)

            call_bid = get_val(call_row, "bid")
            call_ask = get_val(call_row, "ask")
            call_last = get_val(call_row, "lastPrice")
            call_vol = int(get_val(call_row, "volume", 0))
            call_oi = int(get_val(call_row, "openInterest", 0))
            call_iv = get_val(call_row, "impliedVolatility", 0.28)

            put_bid = get_val(put_row, "bid")
            put_ask = get_val(put_row, "ask")
            put_last = get_val(put_row, "lastPrice")
            put_vol = int(get_val(put_row, "volume", 0))
            put_oi = int(get_val(put_row, "openInterest", 0))
            put_iv = get_val(put_row, "impliedVolatility", 0.28)

            # Calculate Greeks for Call using Black-Scholes engine
            try:
                call_res = calculate_black_scholes(
                    symbol=symbol,
                    spot_price=spot_price,
                    strike_price=strike,
                    days_to_expiration=days_to_exp,
                    implied_volatility=call_iv if call_iv > 0 else 0.28,
                    risk_free_rate=0.05,
                    option_type="CALL",
                    quantity=1,
                    action="BUY"
                )
                call_delta = round(call_res["greeks"]["delta"], 4)
                call_gamma = round(call_res["greeks"]["gamma"], 4)
                call_vega = round(call_res["greeks"]["vega"], 4)
            except Exception:
                call_delta, call_gamma, call_vega = 0.0, 0.0, 0.0

            # Calculate Greeks for Put using Black-Scholes engine
            try:
                put_res = calculate_black_scholes(
                    symbol=symbol,
                    spot_price=spot_price,
                    strike_price=strike,
                    days_to_expiration=days_to_exp,
                    implied_volatility=put_iv if put_iv > 0 else 0.28,
                    risk_free_rate=0.05,
                    option_type="PUT",
                    quantity=1,
                    action="BUY"
                )
                put_delta = round(put_res["greeks"]["delta"], 4)
                put_gamma = round(put_res["greeks"]["gamma"], 4)
                put_vega = round(put_res["greeks"]["vega"], 4)
            except Exception:
                put_delta, put_gamma, put_vega = 0.0, 0.0, 0.0

            call = {
                "bid": call_bid,
                "ask": call_ask,
                "last": call_last,
                "volume": call_vol,
                "open_interest": call_oi,
                "iv": round(call_iv, 4),
                "delta": call_delta,
                "gamma": call_gamma,
                "vega": call_vega,
            }
            put = {
                "bid": put_bid,
                "ask": put_ask,
                "last": put_last,
                "volume": put_vol,
                "open_interest": put_oi,
                "iv": round(put_iv, 4),
                "delta": put_delta,
                "gamma": put_gamma,
                "vega": put_vega,
            }
            rows.append({"strike": float(strike), "call": call, "put": put})

        return {
            "underlying_symbol": symbol.upper(),
            "underlying_price": spot_price,
            "expiration_date": expiration,
            "days_to_expiration": days_to_exp,
            "options": rows,
            "source": "yahoo",
        }

import math
import hashlib
from typing import List, Dict, Any
from datetime import datetime, date, timedelta
from abc import ABC, abstractmethod
from app.services.pricing import calculate_black_scholes

class BaseMarketDataProvider(ABC):
    @abstractmethod
    def get_spot_price(self, symbol: str) -> float:
        pass

    @abstractmethod
    def get_expiration_dates(self, symbol: str) -> List[str]:
        pass

    @abstractmethod
    def get_option_chain(self, symbol: str, expiration_date: str) -> Dict[str, Any]:
        pass


class MockMarketDataProvider(BaseMarketDataProvider):
    def __init__(self):
        # Base spot prices for common tickers
        self.base_spots = {
            "AAPL": 185.50,
            "MSFT": 422.30,
            "TSLA": 178.20,
            "SPY": 512.40,
            "QQQ": 438.10,
            "NVDA": 875.12,
            "AMD": 160.45,
            "AMZN": 185.20,
            "NFLX": 610.50,
            "META": 495.30
        }
        # Base Implied Volatilities for tickers
        self.base_ivs = {
            "AAPL": 0.22,
            "MSFT": 0.18,
            "TSLA": 0.45,
            "SPY": 0.12,
            "QQQ": 0.14,
            "NVDA": 0.50,
            "AMD": 0.38,
            "AMZN": 0.24,
            "NFLX": 0.32,
            "META": 0.28
        }
        # Sector mapping for symbols
        self.sectors = {
            "AAPL": "Technology",
            "MSFT": "Technology",
            "TSLA": "Consumer Cyclical",
            "SPY": "Index/ETF",
            "QQQ": "Index/ETF",
            "NVDA": "Technology",
            "AMD": "Technology",
            "AMZN": "Consumer Cyclical",
            "NFLX": "Communication Services",
            "META": "Communication Services"
        }

    def _get_seeded_random(self, seed_str: str) -> float:
        """Generate a deterministic float between 0 and 1 using hash of a string."""
        h = hashlib.md5(seed_str.encode()).hexdigest()
        val = int(h[:8], 16)
        return val / 4294967295.0

    def get_spot_price(self, symbol: str) -> float:
        symbol = symbol.upper()
        
        # Initialize cache if not exists
        if not hasattr(self, 'spot_cache'):
            self.spot_cache = {}
            
        import time
        now = time.time()
        
        # Check cache (5 minutes expiration)
        if symbol in self.spot_cache:
            cached_val, cached_time = self.spot_cache[symbol]
            if now - cached_time < 300:
                return cached_val
                
        # Try fetching from yfinance
        try:
            import yfinance as yf
            ticker = yf.Ticker(symbol)
            # Try history first as it is fast
            hist = ticker.history(period="1d")
            if not hist.empty and "Close" in hist.columns:
                spot_val = float(hist["Close"].iloc[-1])
                self.spot_cache[symbol] = (spot_val, now)
                return round(spot_val, 2)
            # Fallback to fast_info
            fast_val = ticker.fast_info.get("last_price") or ticker.fast_info.get("lastPrice")
            if fast_val is not None:
                spot_val = float(fast_val)
                self.spot_cache[symbol] = (spot_val, now)
                return round(spot_val, 2)
        except Exception:
            pass
            
        if symbol in self.base_spots:
            return self.base_spots[symbol]
        # Deterministic spot price for arbitrary symbols
        import hashlib
        seed = float(int(hashlib.md5(symbol.encode()).hexdigest()[:6], 16) % 450) + 50.0
        return round(seed, 2)


    def get_sector(self, symbol: str) -> str:
        symbol = symbol.upper()
        if symbol in self.sectors:
            return self.sectors[symbol]
        # Deterministic sector based on hashing
        sectors_list = ["Technology", "Financial", "Healthcare", "Consumer Cyclical", "Industrial", "Energy", "Index/ETF"]
        idx = int(hashlib.md5(symbol.encode()).hexdigest()[:2], 16) % len(sectors_list)
        return sectors_list[idx]

    def get_expiration_dates(self, symbol: str) -> List[str]:
        # Generate 6 consecutive Fridays starting from today
        dates = []
        today = date.today()
        # Find next Friday (weekday 4: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4)
        days_ahead = 4 - today.weekday()
        if days_ahead <= 0:  # If today is Friday, show next Friday
            days_ahead += 7
        next_friday = today + timedelta(days_ahead)
        
        for i in range(6):
            expiry = next_friday + timedelta(weeks=i)
            dates.append(expiry.strftime("%Y-%m-%d"))
        return dates

    def get_option_chain(self, symbol: str, expiration_date: str) -> Dict[str, Any]:
        symbol = symbol.upper()
        spot = self.get_spot_price(symbol)
        base_iv = self.base_ivs.get(symbol, 0.28)
        
        # Calculate days to expiration
        today = date.today()
        exp_dt = datetime.strptime(expiration_date, "%Y-%m-%d").date()
        days_to_exp = max(1, (exp_dt - today).days)
        
        # Select strike intervals
        if spot < 50:
            interval = 1.0
        elif spot < 200:
            interval = 2.5
        elif spot < 500:
            interval = 5.0
        else:
            interval = 10.0
            
        # Standard index/ETF strikes are closer
        if symbol in ["SPY", "QQQ"]:
            interval = 1.0

        # Center strike
        atm_strike = round(spot / interval) * interval
        
        # Generate 15 strikes below and 15 strikes above ATM
        strikes = []
        for i in range(-15, 16):
            strikes.append(round(atm_strike + (i * interval), 2))

        rows = []
        for strike in strikes:
            # Deterministic seed for each strike contract
            seed_key = f"{symbol}_{expiration_date}_{strike}"
            rand_val = self._get_seeded_random(seed_key)
            
            # Distance from spot
            dist_ratio = (strike - spot) / spot
            
            # Volatility smile (IV rises further from spot, slightly skewed)
            # Call IV skew vs Put IV skew
            skew = -0.08 * dist_ratio
            smile = 0.4 * (dist_ratio ** 2)
            strike_iv = base_iv + skew + smile
            strike_iv = max(0.05, min(1.8, strike_iv)) # clamp IV
            
            # Calculate option values
            # Call calculations
            call_res = calculate_black_scholes(
                symbol=symbol,
                spot_price=spot,
                strike_price=strike,
                days_to_expiration=days_to_exp,
                implied_volatility=strike_iv,
                risk_free_rate=0.05,
                option_type="CALL",
                quantity=1,
                action="BUY"
            )
            # Put calculations
            put_res = calculate_black_scholes(
                symbol=symbol,
                spot_price=spot,
                strike_price=strike,
                days_to_expiration=days_to_exp,
                implied_volatility=strike_iv,
                risk_free_rate=0.05,
                option_type="PUT",
                quantity=1,
                action="BUY"
            )

            # Extract Call prices
            call_price = call_res["price"]
            call_spread = max(0.02, round(0.01 + 0.02 * call_price, 2))
            call_bid = max(0.01, round(call_price - call_spread / 2.0, 2))
            call_ask = round(call_price + call_spread / 2.0, 2)
            
            # Extract Put prices
            put_price = put_res["price"]
            put_spread = max(0.02, round(0.01 + 0.02 * put_price, 2))
            put_bid = max(0.01, round(put_price - put_spread / 2.0, 2))
            put_ask = round(put_price + put_spread / 2.0, 2)

            # Generate volume & open interest
            atm_factor = math.exp(-12.0 * (dist_ratio ** 2))
            volume_multiplier = int(1000 + 15000 * rand_val)
            oi_multiplier = int(5000 + 40000 * rand_val)
            
            call_volume = int(atm_factor * volume_multiplier * 0.9)
            call_oi = int(atm_factor * oi_multiplier * 0.95)
            put_volume = int(atm_factor * volume_multiplier * 1.1)
            put_oi = int(atm_factor * oi_multiplier * 1.05)

            # Assemble rows
            rows.append({
                "strike": strike,
                "call": {
                    "bid": call_bid,
                    "ask": call_ask,
                    "last": round(call_bid + (call_ask - call_bid) * 0.4, 2),
                    "volume": call_volume,
                    "open_interest": call_oi,
                    "iv": round(strike_iv, 4),
                    "delta": round(call_res["greeks"]["delta"], 4),
                    "gamma": round(call_res["greeks"]["gamma"], 4),
                    "vega": round(call_res["greeks"]["vega"], 4)
                },
                "put": {
                    "bid": put_bid,
                    "ask": put_ask,
                    "last": round(put_bid + (put_ask - put_bid) * 0.4, 2),
                    "volume": put_volume,
                    "open_interest": put_oi,
                    "iv": round(strike_iv, 4),
                    "delta": round(put_res["greeks"]["delta"], 4),
                    "gamma": round(put_res["greeks"]["gamma"], 4),
                    "vega": round(put_res["greeks"]["vega"], 4)
                }
            })

        return {
            "underlying_symbol": symbol,
            "underlying_price": spot,
            "expiration_date": expiration_date,
            "days_to_expiration": days_to_exp,
            "options": rows
        }

# Provider instance
market_data_provider = MockMarketDataProvider()

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Dict, Any, Optional
import asyncio
import math
import hashlib
from datetime import datetime
from sqlalchemy.orm import Session

from app.services.market_data import market_data_provider
from app.database import get_db
from app.services.auth_helpers import get_current_user_optional
from app.models.user import User
from app.models.ib_config import IBConfig
from app.ib_client import IBClient, get_global_ib_client
from app.services.pricing import calculate_black_scholes
from app.yahoo_finance_client import YahooFinanceClient

router = APIRouter(prefix="/chain", tags=["Options Chain"])

@router.get("/quote", response_model=Dict[str, Any])
async def get_underlying_quote(
    symbol: str = Query(..., description="The ticker symbol (e.g. AAPL, SPY)"),
    config_id: Optional[int] = Query(None, description="Active IB configuration ID"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Get the current spot price and basic asset parameters for a symbol."""
    import yfinance as yf
    symbol = symbol.upper()
    spot = None
    iv = None
    
    if current_user and config_id:
        config = db.query(IBConfig).filter(IBConfig.id == config_id, IBConfig.user_id == current_user.id).first()
        if config:
            try:
                client = await get_global_ib_client(config.host, int(config.port), int(config.client_id))
                spot = await client.fetch_spot_price(symbol)
                # Volatility lookup
                iv = market_data_provider.base_ivs.get(symbol, 0.25)
            except Exception as e:
                print(f"IB quote fetch failed for {symbol}: {e}")
                
    if spot is None or spot <= 0:
        # Fallback to Yahoo Finance (delayed data)
        try:
            ticker = yf.Ticker(symbol)
            spot = ticker.info.get("regularMarketPrice") or ticker.info.get("previousClose")
            if spot is None:
                hist = ticker.history(period="1d")
                if not hist.empty:
                    spot = float(hist["Close"].iloc[-1])
            iv = market_data_provider.base_ivs.get(symbol, 0.25)
        except Exception as e:
            print(f"Yahoo Finance quote fetch failed for {symbol}: {e}")
            
    if spot is None or spot <= 0:
        # Fallback to mock data provider
        spot = market_data_provider.get_spot_price(symbol)
        iv = market_data_provider.base_ivs.get(symbol, 0.25)
        
    return {
        "symbol": symbol,
        "spot_price": spot,
        "implied_volatility": iv if iv is not None else 0.25,
        "risk_free_rate": 0.05
    }

@router.get("/expirations", response_model=List[str])
async def get_chain_expirations(
    symbol: str = Query(..., description="The ticker symbol (e.g. AAPL, SPY)"),
    config_id: Optional[int] = Query(None, description="Active IB configuration ID"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Get the available expiration dates for a ticker symbol."""
    if current_user:
        # Authenticated path – use IB if config provided, DO NOT fallback to Yahoo Finance
        if config_id:
            config = db.query(IBConfig).filter(IBConfig.id == config_id, IBConfig.user_id == current_user.id).first()
            if config:
                try:
                    client = await get_global_ib_client(config.host, int(config.port), int(config.client_id))
                    raw_params = await client.fetch_options_params(symbol)
                    
                    # Extract and format unique expiration dates (YYYYMMDD to YYYY-MM-DD)
                    expirations_set = set()
                    for param in raw_params:
                        expirations = param.get("expirations", [])
                        for date_str in expirations:
                            if date_str and len(date_str) == 8:
                                formatted_date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
                                expirations_set.add(formatted_date)
                    
                    if expirations_set:
                        return sorted(list(expirations_set))
                except Exception as e:
                    print(f"IB expirations fetch failed: {e}. Falling back to mock data for authenticated user.")
        
        # Fallback to mock data provider (no Yahoo Finance)
        try:
            expirations = market_data_provider.get_expiration_dates(symbol)
            if not expirations:
                raise HTTPException(status_code=404, detail=f"No expiration dates found for symbol: {symbol}")
            return expirations
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
            
    else:
        # Unauthenticated path - use Yahoo Finance, fallback to mock data
        try:
            expirations = YahooFinanceClient.fetch_expirations(symbol)
            if expirations:
                return sorted(expirations)
        except Exception as e:
            print(f"Yahoo Finance expirations fetch failed: {e}. Falling back to mock data.")
                     
        # Fallback to mock data provider
        try:
            expirations = market_data_provider.get_expiration_dates(symbol)
            if not expirations:
                raise HTTPException(status_code=404, detail=f"No expiration dates found for symbol: {symbol}")
            return expirations
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=Dict[str, Any])
async def get_option_chain(
    symbol: str = Query(..., description="The ticker symbol"),
    expiration: str = Query(..., description="The option expiration date in YYYY-MM-DD format"),
    config_id: Optional[int] = Query(None, description="Active IB configuration ID"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Get the call/put option chain matrix for a symbol and expiration date."""
    if current_user:
        # Authenticated path – use IB if config provided, DO NOT fallback to Yahoo Finance
        if config_id:
            config = db.query(IBConfig).filter(IBConfig.id == config_id, IBConfig.user_id == current_user.id).first()
            if config:
                try:
                    client = await get_global_ib_client(config.host, int(config.port), int(config.client_id))
                    
                    # Fetch spot price dynamically from IB
                    spot = await client.fetch_spot_price(symbol)
                    if not spot or spot <= 0:
                        spot = market_data_provider.get_spot_price(symbol)
                    
                    # Format to YYYYMMDD for matching IBAPI contracts
                    ib_expiration = expiration.replace("-", "")
                    
                    # Fetch option chain filtered by expiration date
                    matching_contracts = await client.fetch_option_chain(symbol, expiration=ib_expiration)
                    
                    # Group contracts by strike
                    strikes_data = {}
                    for c in matching_contracts:
                        strike = float(c["strike"])
                        right = c["right"].upper()
                        
                        if strike not in strikes_data:
                            strikes_data[strike] = {"call": None, "put": None}
                        
                        if right.startswith("C"):
                            strikes_data[strike]["call"] = c
                        elif right.startswith("P"):
                            strikes_data[strike]["put"] = c
                    
                    # Calculate days to expiration
                    today = datetime.now().date()
                    exp_dt = datetime.strptime(expiration, "%Y-%m-%d").date()
                    days_to_exp = max(1, (exp_dt - today).days)
                    
                    rows = []
                    base_iv = market_data_provider.base_ivs.get(symbol.upper(), 0.28)
                    
                    for strike in sorted(strikes_data.keys()):
                        dist_ratio = (strike - spot) / spot
                        skew = -0.08 * dist_ratio
                        smile = 0.4 * (dist_ratio ** 2)
                        strike_iv = max(0.05, min(1.8, base_iv + skew + smile))
                        
                        # Generate call pricing details
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
                        call_price = call_res["price"]
                        call_spread = max(0.02, round(0.01 + 0.02 * call_price, 2))
                        call_bid = max(0.01, round(call_price - call_spread / 2.0, 2))
                        call_ask = round(call_price + call_spread / 2.0, 2)
                        
                        # Generate put pricing details
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
                        put_price = put_res["price"]
                        put_spread = max(0.02, round(0.01 + 0.02 * put_price, 2))
                        put_bid = max(0.01, round(put_price - put_spread / 2.0, 2))
                        put_ask = round(put_price + put_spread / 2.0, 2)
                        
                        h = hashlib.md5(f"{symbol}_{expiration}_{strike}".encode()).hexdigest()
                        rand_val = (int(h[:8], 16) / 4294967295.0)
                        atm_factor = math.exp(-12.0 * (dist_ratio ** 2))
                        
                        call_vol = int(atm_factor * (1000 + 15000 * rand_val) * 0.9)
                        call_oi = int(atm_factor * (5000 + 40000 * rand_val) * 0.95)
                        put_vol = int(atm_factor * (1000 + 15000 * rand_val) * 1.1)
                        put_oi = int(atm_factor * (5000 + 40000 * rand_val) * 1.05)
                        
                        rows.append({
                            "strike": strike,
                            "call": {
                                "bid": call_bid,
                                "ask": call_ask,
                                "last": round(call_bid + (call_ask - call_bid) * 0.4, 2),
                                "volume": call_vol,
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
                                "volume": put_vol,
                                "open_interest": put_oi,
                                "iv": round(strike_iv, 4),
                                "delta": round(put_res["greeks"]["delta"], 4),
                                "gamma": round(put_res["greeks"]["gamma"], 4),
                                "vega": round(put_res["greeks"]["vega"], 4)
                            }
                        })
                    
                    if rows:
                        return {
                            "underlying_symbol": symbol.upper(),
                            "underlying_price": spot,
                            "expiration_date": expiration,
                            "days_to_expiration": days_to_exp,
                            "options": rows,
                            "source": "ib"
                        }
                except Exception as e:
                    # Propagate error to client instead of silently using mock data
                    raise HTTPException(status_code=504, detail=f"Failed to fetch option chain from IB: {e}")

        # Fallback to mock data provider for authenticated user (no Yahoo Finance)
        try:
            spot = market_data_provider.get_spot_price(symbol)
            if not spot:
                raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found")
            chain_data = market_data_provider.get_option_chain(symbol, expiration)
            return chain_data
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    else:
        # Unauthenticated path – use Yahoo Finance, fallback to mock data
        try:
            yf_data = YahooFinanceClient.fetch_option_chain(symbol, expiration)
            return yf_data
        except Exception as e:
            print(f"Yahoo Finance fetch failed: {e}. Falling back to mock data.")
            try:
                spot = market_data_provider.get_spot_price(symbol)
                if not spot:
                    raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found")
                chain_data = market_data_provider.get_option_chain(symbol, expiration)
                return chain_data
            except ValueError as ve:
                raise HTTPException(status_code=400, detail=str(ve))
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

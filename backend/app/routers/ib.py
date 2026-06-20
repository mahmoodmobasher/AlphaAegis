from fastapi import APIRouter, HTTPException, Query, Depends
import asyncio
from datetime import datetime, date

# Import the IB client wrapper
from ..ib_client import IBClient, get_global_ib_client
from sqlalchemy.orm import Session
from ..models.ib_config import IBConfig
from ..models.user import User
from ..services.auth_helpers import get_current_user
from ..database import get_db
from ..services.market_data import market_data_provider
from ..services.pricing import calculate_black_scholes

router = APIRouter()







@router.get("/ib/test")
async def test_ib_connection(
    config_id: int = Query(..., description="IB config ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    config = db.query(IBConfig).filter(IBConfig.id == config_id, IBConfig.user_id == current_user.id).first()
    if not config:
        raise HTTPException(status_code=404, detail="IB config not found")
    try:
        client = await get_global_ib_client(config.host, int(config.port), int(config.client_id))
        return {"connected": True, "host": config.host, "port": config.port}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Connection failed: {e}")

@router.get("/ib/account")
async def get_account_summary(
    config_id: int = Query(..., description="IB config ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    config = db.query(IBConfig).filter(IBConfig.id == config_id, IBConfig.user_id == current_user.id).first()
    if not config:
        raise HTTPException(status_code=404, detail="IB config not found")
    try:
        client = await get_global_ib_client(config.host, int(config.port), int(config.client_id))
        client.summary_event.clear()
        client.account_summary.clear()
        client.reqAccountSummary(9001, "All", "NetLiquidation,TotalCashValue,BuyingPower,MaintMarginReq")
        await asyncio.wait_for(client.summary_event.wait(), timeout=5)
        summary = client.account_summary.copy()
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch account summary: {e}")

@router.get("/ib/option-chain")
async def get_option_chain(
    symbol: str = Query(..., description="Underlying symbol"),
    config_id: int = Query(..., description="IB config ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    config = db.query(IBConfig).filter(IBConfig.id == config_id, IBConfig.user_id == current_user.id).first()
    if not config:
        raise HTTPException(status_code=404, detail="IB config not found")
    try:
        client = await get_global_ib_client(config.host, int(config.port), int(config.client_id))
        chain = await client.fetch_option_chain(symbol)
        return chain
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch option chain: {e}")

@router.get("/ib/portfolio")
async def get_ib_portfolio(
    config_id: int = Query(..., description="IB config ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    config = db.query(IBConfig).filter(IBConfig.id == config_id, IBConfig.user_id == current_user.id).first()
    if not config:
        raise HTTPException(status_code=404, detail="IB config not found")
    try:
        client = await get_global_ib_client(config.host, int(config.port), int(config.client_id))
        
        # 1. Fetch account summary
        client.summary_event.clear()
        client.account_summary.clear()
        client.reqAccountSummary(9002, "All", "NetLiquidation,TotalCashValue,BuyingPower,MaintMarginReq")
        try:
            await asyncio.wait_for(client.summary_event.wait(), timeout=4.0)
        except asyncio.TimeoutError:
            pass
        summary = client.account_summary.copy()
        
        # 2. Fetch positions
        positions = []
        try:
            positions = await asyncio.wait_for(client.fetch_positions(), timeout=4.0)
        except asyncio.TimeoutError:
            pass
            
        # Filter out positions with quantity = 0
        positions = [p for p in positions if p.get("position", 0) != 0]
            
        # 3. Process positions and calculate metrics
        ib_delta = 0.0
        ib_gamma = 0.0
        ib_theta = 0.0
        ib_vega = 0.0
        ib_rho = 0.0

        for pos in positions:
            symbol = pos["symbol"]
            sec_type = pos["secType"]
            qty = pos["position"]
            avg_cost = pos["avgCost"]
            multiplier = 100.0 if sec_type == "OPT" else 1.0
            
            market_price = 0.0
            pos_delta = 0.0
            pos_gamma = 0.0
            pos_theta = 0.0
            pos_vega = 0.0
            pos_rho = 0.0

            if sec_type == "STK":
                market_price = market_data_provider.get_spot_price(symbol)
                # Stock position Delta is just the position quantity (multiplier=1, delta=1.0)
                pos_delta = qty * 1.0
            elif sec_type == "OPT":
                # For options, calculate via Black-Scholes using spot price
                spot = market_data_provider.get_spot_price(symbol)
                strike = pos["strike"]
                today = date.today()
                days_to_exp = 30
                try:
                    expiry_str = pos["expiry"] # YYYYMMDD
                    if len(expiry_str) == 8:
                        exp_dt = datetime.strptime(expiry_str, "%Y%m%d").date()
                    else:
                        exp_dt = datetime.strptime(expiry_str, "%Y-%m-%d").date()
                    days_to_exp = max(1, (exp_dt - today).days)
                except Exception:
                    pass
                
                right_str = str(pos.get("right", "")).upper().strip()
                opt_right = "CALL" if right_str.startswith("C") or right_str == "CALL" else "PUT"
                base_iv = market_data_provider.base_ivs.get(symbol.upper(), 0.28)
                
                # Check position action (BUY/SELL)
                action = "BUY" if qty >= 0 else "SELL"
                abs_qty = int(abs(qty)) if abs(qty) >= 1 else 1
                
                calc = calculate_black_scholes(
                    symbol=symbol,
                    spot_price=spot,
                    strike_price=strike,
                    days_to_expiration=days_to_exp,
                    implied_volatility=base_iv,
                    risk_free_rate=0.05,
                    option_type=opt_right,
                    quantity=abs_qty,
                    action=action
                )
                market_price = calc["price"]
                # Extract position-adjusted greeks
                pos_delta = calc["greeks"]["position_delta"]
                pos_gamma = calc["greeks"]["position_gamma"]
                pos_theta = calc["greeks"]["position_theta"]
                pos_vega = calc["greeks"]["position_vega"]
                pos_rho = calc["greeks"]["position_rho"]
                
            pos["marketPrice"] = market_price
            
            pos_cost = avg_cost * qty * multiplier
            market_value = market_price * qty * multiplier
            unrealized_pnl = market_value - pos_cost
            pnl_percent = (unrealized_pnl / pos_cost * 100.0) if pos_cost != 0.0 else 0.0
            
            pos["costBasis"] = pos_cost
            pos["marketValue"] = market_value
            pos["unrealizedPnL"] = unrealized_pnl
            pos["unrealizedPnLPercent"] = pnl_percent
            
            # Save position-level Greeks
            pos["greeks"] = {
                "delta": pos_delta,
                "gamma": pos_gamma,
                "theta": pos_theta,
                "vega": pos_vega,
                "rho": pos_rho
            }
            
            # Accumulate Greeks
            ib_delta += pos_delta
            ib_gamma += pos_gamma
            ib_theta += pos_theta
            ib_vega += pos_vega
            ib_rho += pos_rho
            
        summary["greeks"] = {
            "delta": ib_delta,
            "gamma": ib_gamma,
            "theta": ib_theta,
            "vega": ib_vega,
            "rho": ib_rho
        }
        
        # Group options and stock legs corresponding to same ticker
        from app.services.strategy_recognizer import recognize_strategy
        positions_by_symbol = {}
        for pos in positions:
            sym = pos["symbol"].upper()
            if sym not in positions_by_symbol:
                positions_by_symbol[sym] = []
            positions_by_symbol[sym].append(pos)
            
        grouped_positions = []
        fake_id = 1
        for sym, pos_list in positions_by_symbol.items():
            legs_for_recognition = []
            for pos in pos_list:
                sec_type = pos["secType"]
                qty = pos["position"]
                
                # Check position action (BUY/SELL)
                action = "BUY" if qty >= 0 else "SELL"
                abs_qty = int(abs(qty)) if abs(qty) >= 1 else 1
                
                if sec_type == "STK":
                    legs_for_recognition.append({
                        "sec_type": "STK",
                        "option_type": None,
                        "action": action,
                        "strike": None,
                        "expiry": None,
                        "qty": abs_qty
                    })
                elif sec_type == "OPT":
                    right_str = str(pos.get("right", "")).upper().strip()
                    opt_right = "CALL" if right_str.startswith("C") or right_str == "CALL" else "PUT"
                    expiry_str = pos["expiry"] # YYYYMMDD or YYYY-MM-DD
                    # normalize expiry to YYYY-MM-DD
                    try:
                        if len(expiry_str) == 8:
                            exp_dt = datetime.strptime(expiry_str, "%Y%m%d").date()
                        else:
                            exp_dt = datetime.strptime(expiry_str, "%Y-%m-%d").date()
                        expiry_formatted = exp_dt.strftime("%Y-%m-%d")
                    except Exception:
                        expiry_formatted = expiry_str
                        
                    legs_for_recognition.append({
                        "sec_type": "OPT",
                        "option_type": opt_right,
                        "action": action,
                        "strike": float(pos["strike"]),
                        "expiry": expiry_formatted,
                        "qty": abs_qty
                    })
            
            strategy_name = recognize_strategy(legs_for_recognition)
            
            # Calculate aggregate metrics
            total_market_value = sum(p["marketValue"] for p in pos_list)
            total_cost_basis = sum(p["costBasis"] for p in pos_list)
            total_unrealized_pnl = total_market_value - total_cost_basis
            total_pnl_percent = (total_unrealized_pnl / abs(total_cost_basis) * 100.0) if total_cost_basis != 0.0 else 0.0
            
            g_delta = sum(p["greeks"]["delta"] for p in pos_list)
            g_gamma = sum(p["greeks"]["gamma"] for p in pos_list)
            g_theta = sum(p["greeks"]["theta"] for p in pos_list)
            g_vega = sum(p["greeks"]["vega"] for p in pos_list)
            g_rho = sum(p["greeks"]["rho"] for p in pos_list)
            
            spot = market_data_provider.get_spot_price(sym)
            
            legs_list = []
            for p in pos_list:
                sec_type = p["secType"]
                action = "BUY" if p["position"] >= 0 else "SELL"
                abs_qty = abs(int(p["position"]))
                # Normalize right & expiry date
                o_type = ""
                expiry_formatted = ""
                if sec_type == "OPT":
                    right_str = str(p.get("right", "")).upper().strip()
                    o_type = "CALL" if right_str.startswith("C") or right_str == "CALL" else "PUT"
                    expiry_str = p.get("expiry", "")
                    try:
                        if len(expiry_str) == 8:
                            exp_dt = datetime.strptime(expiry_str, "%Y%m%d").date()
                        else:
                            exp_dt = datetime.strptime(expiry_str, "%Y-%m-%d").date()
                        expiry_formatted = exp_dt.strftime("%Y-%m-%d")
                    except Exception:
                        expiry_formatted = expiry_str
                
                legs_list.append({
                    "id": len(legs_list) + 1,
                    "sec_type": sec_type,
                    "option_type": o_type,
                    "action": action,
                    "strike_price": p.get("strike", 0.0) if sec_type == "OPT" else 0.0,
                    "expiration_date": expiry_formatted,
                    "quantity": abs_qty,
                    "entry_premium": p["avgCost"],
                    "current_price": p["marketPrice"],
                    "market_value": p["marketValue"],
                    "unrealized_pnl": p["unrealizedPnL"],
                    "unrealized_pnl_percent": p["unrealizedPnLPercent"],
                    "greeks": p["greeks"]
                })
                
            grouped_positions.append({
                "id": fake_id,
                "symbol": sym,
                "underlying_symbol": sym,
                "underlying_price": spot,
                "marketPrice": spot,
                "quantity": 1,
                "entry_price": 0.0,
                "entry_cost": total_cost_basis,
                "costBasis": total_cost_basis,
                "current_value": total_market_value,
                "marketValue": total_market_value,
                "total_pnl": total_unrealized_pnl,
                "unrealizedPnL": total_unrealized_pnl,
                "total_pnl_percent": total_pnl_percent,
                "unrealizedPnLPercent": total_pnl_percent,
                "name": f"{sym} - {strategy_name}",
                "strategy": strategy_name,
                "greeks": {
                    "delta": g_delta,
                    "gamma": g_gamma,
                    "theta": g_theta,
                    "vega": g_vega,
                    "rho": g_rho
                },
                "legs": legs_list
            })
            fake_id += 1
            
        return {
            "summary": summary,
            "positions": grouped_positions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch IB portfolio: {e}")

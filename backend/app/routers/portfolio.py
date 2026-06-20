from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from app.database import get_db
from app.models.user import User
from app.models.portfolio import PortfolioPosition, PortfolioLeg, Watchlist, TradeNote
from app.schemas.portfolio import (
    PortfolioPositionCreate,
    PortfolioPositionResponse,
    WatchlistCreate,
    WatchlistResponse,
    TradeNoteCreate,
    TradeNoteResponse
)
from app.services.auth_helpers import get_current_user
from app.services.market_data import market_data_provider
from app.services.pricing import calculate_black_scholes
from datetime import datetime, timezone, date

router = APIRouter(prefix="/portfolio", tags=["Portfolio"])

@router.get("", response_model=Dict[str, Any])
def get_user_portfolio(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get user portfolio positions with current valuation, real-time pricing,
    Greeks calculation, and sector exposure.
    """
    positions = db.query(PortfolioPosition).filter(PortfolioPosition.user_id == current_user.id).all()
    
    # Group positions by symbol
    positions_by_symbol = {}
    for pos in positions:
        sym = pos.underlying_symbol.upper()
        if sym not in positions_by_symbol:
            positions_by_symbol[sym] = []
        positions_by_symbol[sym].append(pos)
        
    positions_summary = []
    total_entry_cost = 0.0
    total_current_value = 0.0
    portfolio_delta = 0.0
    portfolio_gamma = 0.0
    portfolio_theta = 0.0
    portfolio_vega = 0.0
    portfolio_rho = 0.0
    
    sector_exposures = {}
    fake_id = 1
    
    for sym, pos_list in positions_by_symbol.items():
        spot = market_data_provider.get_spot_price(sym)
        sector = market_data_provider.get_sector(sym)
        
        legs_for_recognition = []
        legs_calculated = []
        
        pos_entry_cost = 0.0
        pos_current_value = 0.0
        pos_delta = 0.0
        pos_gamma = 0.0
        pos_theta = 0.0
        pos_vega = 0.0
        pos_rho = 0.0
        
        # 1. Process stock positions under this symbol
        stock_positions = [p for p in pos_list if len(p.legs) == 0]
        total_stock_qty = sum(p.quantity for p in stock_positions)
        if total_stock_qty != 0:
            total_cost_basis = sum(p.entry_price * p.quantity for p in stock_positions)
            avg_stock_cost = total_cost_basis / total_stock_qty
            
            stock_entry_cost = total_cost_basis
            stock_current_value = spot * total_stock_qty
            stock_delta = total_stock_qty * 1.0
            
            pos_entry_cost += stock_entry_cost
            pos_current_value += stock_current_value
            pos_delta += stock_delta
            
            action = "BUY" if total_stock_qty >= 0 else "SELL"
            abs_qty = abs(total_stock_qty)
            
            legs_for_recognition.append({
                "sec_type": "STK",
                "option_type": None,
                "action": action,
                "strike": None,
                "expiry": None,
                "qty": abs_qty
            })
            
            legs_calculated.append({
                "id": len(legs_calculated) + 1,
                "sec_type": "STK",
                "option_type": "",
                "action": action,
                "strike_price": 0.0,
                "expiration_date": "",
                "quantity": abs_qty,
                "entry_premium": avg_stock_cost,
                "current_price": spot,
                "greeks": {
                    "delta": stock_delta,
                    "gamma": 0.0,
                    "theta": 0.0,
                    "vega": 0.0,
                    "rho": 0.0
                }
            })
            
        # 2. Process option positions under this symbol
        option_positions = [p for p in pos_list if len(p.legs) > 0]
        for pos in option_positions:
            net_premium = sum(
                leg.premium * leg.quantity * (1.0 if leg.action.upper() == "BUY" else -1.0)
                for leg in pos.legs
            )
            pos_entry_cost += net_premium * pos.quantity * 100.0
            
            for leg in pos.legs:
                today = date.today()
                try:
                    exp_dt = datetime.strptime(leg.expiration_date, "%Y-%m-%d").date()
                    days_to_exp = max(1, (exp_dt - today).days)
                except Exception:
                    days_to_exp = 30
                
                base_iv = market_data_provider.base_ivs.get(sym, 0.28)
                dist_ratio = (leg.strike_price - spot) / spot
                smile_iv = base_iv + 0.4 * (dist_ratio ** 2)
                
                total_leg_qty = leg.quantity * pos.quantity
                
                calc = calculate_black_scholes(
                    symbol=sym,
                    spot_price=spot,
                    strike_price=leg.strike_price,
                    days_to_expiration=days_to_exp,
                    implied_volatility=smile_iv,
                    risk_free_rate=0.05,
                    option_type=leg.option_type,
                    quantity=total_leg_qty,
                    action=leg.action
                )
                
                pos_current_value += calc["position_value"]
                
                pos_delta += calc["greeks"]["position_delta"]
                pos_gamma += calc["greeks"]["position_gamma"]
                pos_theta += calc["greeks"]["position_theta"]
                pos_vega += calc["greeks"]["position_vega"]
                pos_rho += calc["greeks"]["position_rho"]
                
                legs_for_recognition.append({
                    "sec_type": "OPT",
                    "option_type": leg.option_type.upper(),
                    "action": leg.action.upper(),
                    "strike": leg.strike_price,
                    "expiry": leg.expiration_date,
                    "qty": total_leg_qty
                })
                
                legs_calculated.append({
                    "id": len(legs_calculated) + 1,
                    "sec_type": "OPT",
                    "option_type": leg.option_type,
                    "action": leg.action,
                    "strike_price": leg.strike_price,
                    "expiration_date": leg.expiration_date,
                    "quantity": total_leg_qty,
                    "entry_premium": leg.premium,
                    "current_price": calc["price"],
                    "greeks": {
                        "delta": calc["greeks"]["position_delta"],
                        "gamma": calc["greeks"]["position_gamma"],
                        "theta": calc["greeks"]["position_theta"],
                        "vega": calc["greeks"]["position_vega"],
                        "rho": calc["greeks"]["position_rho"],
                    }
                })
                
        total_entry_cost += pos_entry_cost
        total_current_value += pos_current_value
        
        portfolio_delta += pos_delta
        portfolio_gamma += pos_gamma
        portfolio_theta += pos_theta
        portfolio_vega += pos_vega
        portfolio_rho += pos_rho
        
        total_pnl = pos_current_value - pos_entry_cost
        total_pnl_percent = (total_pnl / abs(pos_entry_cost) * 100.0) if pos_entry_cost != 0 else 0.0
        
        sector_exposures[sector] = sector_exposures.get(sector, 0.0) + abs(pos_current_value)
        
        from app.services.strategy_recognizer import recognize_strategy
        strategy_name = recognize_strategy(legs_for_recognition)
        
        created_at_dt = pos_list[0].created_at if pos_list else datetime.now(timezone.utc)
        
        positions_summary.append({
            "id": fake_id,
            "name": f"{sym} - {strategy_name}",
            "underlying_symbol": sym,
            "underlying_price": spot,
            "quantity": 1,
            "entry_price": 0.0,
            "entry_cost": pos_entry_cost,
            "current_value": pos_current_value,
            "total_pnl": total_pnl,
            "total_pnl_percent": total_pnl_percent,
            "strategy": strategy_name,
            "greeks": {
                "delta": pos_delta,
                "gamma": pos_gamma,
                "theta": pos_theta,
                "vega": pos_vega,
                "rho": pos_rho
            },
            "legs": legs_calculated,
            "created_at": created_at_dt
        })
        fake_id += 1
        
    portfolio_total_pnl = total_current_value - total_entry_cost
    portfolio_total_pnl_percent = (portfolio_total_pnl / abs(total_entry_cost) * 100.0) if total_entry_cost != 0 else 0.0
    
    # Calculate percentages for sector exposure
    total_exposure = sum(sector_exposures.values())
    sector_percentages = []
    if total_exposure > 0:
        for sec, val in sector_exposures.items():
            sector_percentages.append({
                "sector": sec,
                "value": val,
                "percentage": round((val / total_exposure) * 100, 2)
            })
    else:
        # Default allocation if empty
        sector_percentages = []

    return {
        "positions": positions_summary,
        "summary": {
            "total_entry_cost": total_entry_cost,
            "total_current_value": total_current_value,
            "total_pnl": portfolio_total_pnl,
            "total_pnl_percent": portfolio_total_pnl_percent,
            "net_liquidation": current_user.net_liquidation or 0.0,
            "total_cash_value": current_user.total_cash_value or 0.0,
            "buying_power": current_user.buying_power or 0.0,
            "maint_margin_req": current_user.maint_margin_req or 0.0,
            "greeks": {
                "delta": portfolio_delta,
                "gamma": portfolio_gamma,
                "theta": portfolio_theta,
                "vega": portfolio_vega,
                "rho": portfolio_rho
            }
        },
        "sector_exposure": sector_percentages
    }

@router.post("", response_model=PortfolioPositionResponse, status_code=status.HTTP_201_CREATED)
def create_portfolio_position(
    position_in: PortfolioPositionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save an active options strategy/position to the user's portfolio."""
    db_position = PortfolioPosition(
        user_id=current_user.id,
        name=position_in.name,
        underlying_symbol=position_in.underlying_symbol.upper(),
        entry_price=position_in.entry_price,
        quantity=position_in.quantity
    )
    db.add(db_position)
    db.commit()
    db.refresh(db_position)

    for leg_in in position_in.legs:
        db_leg = PortfolioLeg(
            position_id=db_position.id,
            option_type=leg_in.option_type.upper(),
            action=leg_in.action.upper(),
            strike_price=leg_in.strike_price,
            expiration_date=leg_in.expiration_date,
            quantity=leg_in.quantity,
            premium=leg_in.premium
        )
        db.add(db_leg)
        
    db.commit()
    db.refresh(db_position)
    return db_position

@router.delete("/{position_id}", status_code=status.HTTP_204_NO_CONTENT)
def close_portfolio_position(
    position_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Close an open portfolio position (deletes from active portfolio)."""
    db_position = db.query(PortfolioPosition).filter(
        PortfolioPosition.id == position_id,
        PortfolioPosition.user_id == current_user.id
    ).first()
    
    if not db_position:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio position not found"
        )
        
    db.delete(db_position)
    db.commit()
    return None

# --- WATCHLIST ENDPOINTS ---

@router.get("/watchlists", response_model=List[WatchlistResponse])
def get_user_watchlist(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the user's watched tickers."""
    return db.query(Watchlist).filter(Watchlist.user_id == current_user.id).all()

@router.post("/watchlists", response_model=WatchlistResponse, status_code=status.HTTP_201_CREATED)
def add_watchlist_symbol(
    watchlist_in: WatchlistCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a symbol to the user's watchlist."""
    symbol_upper = watchlist_in.symbol.upper()
    # Check if already in watchlist
    existing = db.query(Watchlist).filter(
        Watchlist.user_id == current_user.id,
        Watchlist.symbol == symbol_upper
    ).first()
    if existing:
        return existing
        
    db_watchlist = Watchlist(
        user_id=current_user.id,
        symbol=symbol_upper
    )
    db.add(db_watchlist)
    db.commit()
    db.refresh(db_watchlist)
    return db_watchlist

@router.delete("/watchlists/{symbol}", status_code=status.HTTP_204_NO_CONTENT)
def remove_watchlist_symbol(
    symbol: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove a symbol from the user's watchlist."""
    symbol_upper = symbol.upper()
    db_watchlist = db.query(Watchlist).filter(
        Watchlist.user_id == current_user.id,
        Watchlist.symbol == symbol_upper
    ).first()
    
    if not db_watchlist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Symbol not found in watchlist"
        )
        
    db.delete(db_watchlist)
    db.commit()
    return None

# --- JOURNAL NOTE ENDPOINTS ---

@router.get("/notes/{symbol}", response_model=List[TradeNoteResponse])
def get_symbol_notes(
    symbol: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get journal notes for a symbol."""
    return db.query(TradeNote).filter(
        TradeNote.user_id == current_user.id,
        TradeNote.symbol == symbol.upper()
    ).all()

@router.post("/notes", response_model=TradeNoteResponse, status_code=status.HTTP_201_CREATED)
def create_symbol_note(
    note_in: TradeNoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a journal note for a symbol."""
    db_note = TradeNote(
        user_id=current_user.id,
        symbol=note_in.symbol.upper(),
        note_text=note_in.note_text
    )
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db_note
@router.post("/snapshot-ib", status_code=status.HTTP_200_OK)
async def snapshot_ib_portfolio(
    positions_in: Optional[List[PortfolioPositionCreate]] = None,
    config_id: int = Query(..., description="IB config ID"),
    net_liquidation: Optional[float] = Query(None, description="Net Liquidation Value"),
    total_cash_value: Optional[float] = Query(None, description="Total Cash Value"),
    buying_power: Optional[float] = Query(None, description="Buying Power"),
    maint_margin_req: Optional[float] = Query(None, description="Maintenance Margin Requirement"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Take a snapshot of the live IB portfolio and save it as the local portfolio,
    replacing any existing user-saved positions.
    If positions_in is provided in the request body, those positions are saved.
    Otherwise, we fetch them from the live IB connection.
    """
    # 1. Update user cash/margin metadata
    if net_liquidation is not None:
        current_user.net_liquidation = net_liquidation
    if total_cash_value is not None:
        current_user.total_cash_value = total_cash_value
    if buying_power is not None:
        current_user.buying_power = buying_power
    if maint_margin_req is not None:
        current_user.maint_margin_req = maint_margin_req
    db.merge(current_user)
    db.commit()

    # 2. Delete existing positions in DB
    existing_positions = db.query(PortfolioPosition).filter(PortfolioPosition.user_id == current_user.id).all()
    for pos in existing_positions:
        db.delete(pos)
    db.commit()

    if positions_in is not None:
        imported_count = 0
        for pos in positions_in:
            if pos.quantity == 0:
                continue
            # Check if this is a stock position (either empty legs, or contains a STK leg)
            is_stock = len(pos.legs) == 0 or any(leg.sec_type == "STK" for leg in pos.legs)
            
            if is_stock:
                stock_leg = next((leg for leg in pos.legs if leg.sec_type == "STK"), None)
                qty = stock_leg.quantity if stock_leg else pos.quantity
                avg_cost = stock_leg.premium if stock_leg else pos.entry_price
                if qty == 0:
                    continue
                
                db_pos = PortfolioPosition(
                    user_id=current_user.id,
                    name=f"{pos.underlying_symbol} Stock",
                    underlying_symbol=pos.underlying_symbol.upper(),
                    entry_price=avg_cost,
                    quantity=qty
                )
                db.add(db_pos)
                imported_count += 1
            else:
                db_pos = PortfolioPosition(
                    user_id=current_user.id,
                    name=pos.name,
                    underlying_symbol=pos.underlying_symbol.upper(),
                    entry_price=pos.entry_price,
                    quantity=pos.quantity
                )
                db.add(db_pos)
                db.flush()
                
                leg_count = 0
                for leg in pos.legs:
                    if leg.quantity == 0:
                        continue
                    db_leg = PortfolioLeg(
                        position_id=db_pos.id,
                        option_type=leg.option_type.upper(),
                        action=leg.action.upper(),
                        strike_price=leg.strike_price,
                        expiration_date=leg.expiration_date,
                        quantity=leg.quantity,
                        premium=leg.premium
                    )
                    db.add(db_leg)
                    imported_count += 1
                    leg_count += 1
                if leg_count == 0:
                    # delete parent position if it ended up having no active legs
                    db.delete(db_pos)
        db.commit()
        return {"success": True, "positions_imported": imported_count}

    import asyncio
    from app.models.ib_config import IBConfig
    from app.ib_client import get_global_ib_client
    
    config = db.query(IBConfig).filter(IBConfig.id == config_id, IBConfig.user_id == current_user.id).first()
    if not config:
        raise HTTPException(status_code=404, detail="IB configuration not found")
        
    # 3. Connect to IB and fetch positions/summary
    try:
        client = await get_global_ib_client(config.host, int(config.port), int(config.client_id))
        
        # Fetch live account summary if not passed from frontend
        if net_liquidation is None:
            client.summary_event.clear()
            client.account_summary.clear()
            client.reqAccountSummary(9002, "All", "NetLiquidation,TotalCashValue,BuyingPower,MaintMarginReq")
            try:
                await asyncio.wait_for(client.summary_event.wait(), timeout=4.0)
            except asyncio.TimeoutError:
                pass
            summary = client.account_summary.copy()
            current_user.net_liquidation = float(summary.get("NetLiquidation", {}).get("value", 0.0) or 0.0)
            current_user.total_cash_value = float(summary.get("TotalCashValue", {}).get("value", 0.0) or 0.0)
            current_user.buying_power = float(summary.get("BuyingPower", {}).get("value", 0.0) or 0.0)
            current_user.maint_margin_req = float(summary.get("MaintMarginReq", {}).get("value", 0.0) or 0.0)
            db.merge(current_user)
            db.commit()

        positions = await asyncio.wait_for(client.fetch_positions(), timeout=6.0)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch live data from IB: {e}")
        
    # 4. Group positions by symbol
    positions_by_symbol = {}
    for pos in positions:
        qty = pos["position"]
        if qty == 0:
            continue
        sym = pos["symbol"].upper()
        if sym not in positions_by_symbol:
            positions_by_symbol[sym] = []
        positions_by_symbol[sym].append(pos)
        
    imported_count = 0
    from app.services.strategy_recognizer import recognize_strategy
    
    for sym, pos_list in positions_by_symbol.items():
        # Separate stock and options
        stock_positions = [p for p in pos_list if p["secType"] == "STK"]
        option_positions = [p for p in pos_list if p["secType"] == "OPT"]
        
        # Build legs_for_recognition including BOTH stock and option legs
        # (matches IB Live and GET /portfolio behavior for strategy detection)
        legs_for_recognition = []
        
        # Save stock position (if any)
        for p in stock_positions:
            qty = int(float(p.get("position", 0)))
            avg_cost = float(p.get("avgCost", 0) or 0)
            if qty == 0:
                continue
            db_pos = PortfolioPosition(
                user_id=current_user.id,
                name=f"{sym} Stock",
                underlying_symbol=sym,
                entry_price=avg_cost,
                quantity=qty
            )
            db.add(db_pos)
            imported_count += 1
            
            # Include stock in strategy recognition (needed for Covered Call, etc.)
            action = "BUY" if qty >= 0 else "SELL"
            legs_for_recognition.append({
                "sec_type": "STK",
                "option_type": None,
                "action": action,
                "strike": None,
                "expiry": None,
                "qty": abs(qty)
            })
            
        # Save option positions (if any)
        if option_positions:
            # Build option legs for recognition
            for p in option_positions:
                right_str = str(p.get("right", "")).upper().strip()
                opt_right = "CALL" if right_str.startswith("C") or right_str == "CALL" else "PUT"
                expiry_str = p.get("expiry", "") or ""
                try:
                    if len(expiry_str) == 8:
                        exp_dt = datetime.strptime(expiry_str, "%Y%m%d").date()
                    else:
                        exp_dt = datetime.strptime(expiry_str, "%Y-%m-%d").date()
                    expiry_formatted = exp_dt.strftime("%Y-%m-%d")
                except Exception:
                    expiry_formatted = expiry_str
                pos_qty = int(float(p.get("position", 0)))
                action = "BUY" if pos_qty >= 0 else "SELL"
                abs_qty = abs(pos_qty) if abs(pos_qty) >= 1 else 1
                legs_for_recognition.append({
                    "sec_type": "OPT",
                    "option_type": opt_right,
                    "action": action,
                    "strike": float(p.get("strike", 0) or 0),
                    "expiry": expiry_formatted,
                    "qty": abs_qty
                })
            
            strategy_name = recognize_strategy(legs_for_recognition)
            
            # Create a single PortfolioPosition for all options under this symbol
            db_pos = PortfolioPosition(
                user_id=current_user.id,
                name=f"{sym} - {strategy_name}",
                underlying_symbol=sym,
                entry_price=0.0, # net premium will be calculated from legs
                quantity=1
            )
            db.add(db_pos)
            db.flush()  # flush to populate db_pos.id without committing
            
            for p in option_positions:
                right_str = str(p.get("right", "")).upper().strip()
                opt_right = "CALL" if right_str.startswith("C") or right_str == "CALL" else "PUT"
                expiry_str = p.get("expiry", "") or ""
                try:
                    if len(expiry_str) == 8:
                        exp_dt = datetime.strptime(expiry_str, "%Y%m%d").date()
                    else:
                        exp_dt = datetime.strptime(expiry_str, "%Y-%m-%d").date()
                    expiry_formatted = exp_dt.strftime("%Y-%m-%d")
                except Exception:
                    expiry_formatted = expiry_str
                pos_qty = int(float(p.get("position", 0)))
                action = "BUY" if pos_qty >= 0 else "SELL"
                abs_qty = abs(pos_qty) if abs(pos_qty) >= 1 else 1
                
                db_leg = PortfolioLeg(
                    position_id=db_pos.id,
                    option_type=opt_right,
                    action=action,
                    strike_price=float(p.get("strike", 0) or 0),
                    expiration_date=expiry_formatted,
                    quantity=abs_qty,
                    premium=float(p.get("avgCost", 0) or 0)
                )
                db.add(db_leg)
                imported_count += 1
        elif legs_for_recognition:
            # Only stock positions for this symbol — run recognition for naming
            # (will produce "Long Stock" or "Short Stock")
            strategy_name = recognize_strategy(legs_for_recognition)
            
    db.commit()
    return {"success": True, "positions_imported": imported_count}

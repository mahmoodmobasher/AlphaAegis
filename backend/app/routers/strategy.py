from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.user import User
from app.models.strategy import Strategy, StrategyLeg
from app.schemas.strategy import (
    CalculationInput,
    CalculationResult,
    LegCalculationResult,
    GreeksResponse,
    StrategyCreate,
    StrategyResponse
)
from app.services.auth_helpers import get_current_user
from app.services.pricing import calculate_black_scholes

router = APIRouter(prefix="/strategies", tags=["Options Strategies"])

@router.post("/calculate", response_model=CalculationResult)
def calculate_strategy(payload: CalculationInput):
    legs_results = []
    net_price = 0.0
    net_position_value = 0.0
    
    # Initialize net greeks
    net_delta = 0.0
    net_gamma = 0.0
    net_theta = 0.0
    net_vega = 0.0
    net_rho = 0.0
    
    net_pos_delta = 0.0
    net_pos_gamma = 0.0
    net_pos_theta = 0.0
    net_pos_vega = 0.0
    net_pos_rho = 0.0

    for idx, leg in enumerate(payload.legs):
        calc = calculate_black_scholes(
            symbol=payload.underlying_symbol,
            spot_price=payload.underlying_price,
            strike_price=leg.strike_price,
            days_to_expiration=leg.days_to_expiration,
            implied_volatility=payload.implied_volatility,
            risk_free_rate=payload.risk_free_rate,
            option_type=leg.option_type,
            quantity=leg.quantity,
            action=leg.action
        )
        
        g = calc["greeks"]
        
        # Accumulate net values
        # Long adds to debit, Short adds to credit
        pos_mult = 1.0 if leg.action.upper() == "BUY" else -1.0
        
        net_price += calc["price"] * leg.quantity * pos_mult
        net_position_value += calc["position_value"]
        
        # Aggregate Greeks
        # Per-share greeks (weighted by quantity * action)
        net_delta += g["delta"] * leg.quantity * pos_mult
        net_gamma += g["gamma"] * leg.quantity * pos_mult
        net_theta += g["theta"] * leg.quantity * pos_mult
        net_vega += g["vega"] * leg.quantity * pos_mult
        net_rho += g["rho"] * leg.quantity * pos_mult
        
        # Position-adjusted greeks
        net_pos_delta += g["position_delta"]
        net_pos_gamma += g["position_gamma"]
        net_pos_theta += g["position_theta"]
        net_pos_vega += g["position_vega"]
        net_pos_rho += g["position_rho"]

        legs_results.append(
            LegCalculationResult(
                leg_index=idx,
                price=calc["price"],
                position_value=calc["position_value"],
                greeks=GreeksResponse(
                    delta=g["delta"],
                    gamma=g["gamma"],
                    theta=g["theta"],
                    vega=g["vega"],
                    rho=g["rho"],
                    position_delta=g["position_delta"],
                    position_gamma=g["position_gamma"],
                    position_theta=g["position_theta"],
                    position_vega=g["position_vega"],
                    position_rho=g["position_rho"]
                )
            )
        )

    return CalculationResult(
        legs=legs_results,
        net_price=net_price,
        net_position_value=net_position_value,
        net_greeks=GreeksResponse(
            delta=net_delta,
            gamma=net_gamma,
            theta=net_theta,
            vega=net_vega,
            rho=net_rho,
            position_delta=net_pos_delta,
            position_gamma=net_pos_gamma,
            position_theta=net_pos_theta,
            position_vega=net_pos_vega,
            position_rho=net_pos_rho
        )
    )

@router.post("", response_model=StrategyResponse, status_code=status.HTTP_201_CREATED)
def create_user_strategy(
    strategy_in: StrategyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_strategy = Strategy(
        user_id=current_user.id,
        name=strategy_in.name,
        underlying_symbol=strategy_in.underlying_symbol
    )
    db.add(db_strategy)
    db.commit()
    db.refresh(db_strategy)

    for leg_in in strategy_in.legs:
        db_leg = StrategyLeg(
            strategy_id=db_strategy.id,
            option_type=leg_in.option_type.upper(),
            action=leg_in.action.upper(),
            strike_price=leg_in.strike_price,
            expiration_date=leg_in.expiration_date,
            quantity=leg_in.quantity,
            premium=leg_in.premium
        )
        db.add(db_leg)
    
    db.commit()
    db.refresh(db_strategy)
    return db_strategy

@router.get("", response_model=List[StrategyResponse])
def get_user_strategies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(Strategy).filter(Strategy.user_id == current_user.id).all()

@router.delete("/{strategy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_strategy(
    strategy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_strategy = db.query(Strategy).filter(
        Strategy.id == strategy_id,
        Strategy.user_id == current_user.id
    ).first()
    
    if not db_strategy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Strategy not found"
        )
        
    db.delete(db_strategy)
    db.commit()
    return None

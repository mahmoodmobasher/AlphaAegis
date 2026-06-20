"""AlphaAegis Backend FastAPI application. Provides API endpoints for the AlphaAegis options strategy builder and pricing engine."""
import os
import json
import asyncio
import logging
from typing import List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import redis.asyncio as aioredis

from app.database import engine, Base
from app.models import User, Strategy, StrategyLeg, PortfolioPosition, PortfolioLeg, Watchlist, TradeNote # Import models to register with Base
from app.routers import auth, strategy, chain, portfolio, ib, ib_config, risk_analytics, agents  # ib routers enabled

from app.services.risk_analytics import (
    parse_positions,
    calculate_factor_exposures,
    calculate_beta_weighted_delta,
    calculate_value_at_risk,
    get_spx_price,
    calculate_shock_scenario,
    calculate_compliance_alert,
    calculate_daily_expected_return,
    generate_greeks_commentary
)

# Initialize Database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AlphaAegis API",
    description="Backend API for AlphaAegis Options Strategy Builder and Pricing Engine",
    version="1.0.0"
)

# Set up CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow any origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router, prefix="/api")
app.include_router(strategy.router, prefix="/api")
app.include_router(chain.router, prefix="/api")
app.include_router(portfolio.router, prefix="/api")
app.include_router(ib.router, prefix="/api")
app.include_router(ib_config.router, prefix="/api")
app.include_router(risk_analytics.router, prefix="/api")
app.include_router(agents.router, prefix="/api")

logger = logging.getLogger("uvicorn.error")

# Connection Manager for WebSockets
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.error(f"Error broadcasting to WebSocket: {e}")

manager = ConnectionManager()

# Redis Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = None
redis_pubsub = None
redis_listener_task = None

async def init_redis():
    global redis_client, redis_pubsub, redis_listener_task
    try:
        redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
        await redis_client.ping()
        logger.info(f"Successfully connected to Redis at {REDIS_URL}")
        
        # Start background listener task
        redis_pubsub = redis_client.pubsub()
        await redis_pubsub.subscribe("portfolio:updates")
        redis_listener_task = asyncio.create_task(redis_message_listener())
    except Exception as e:
        logger.warning(f"Could not connect to Redis: {e}. Falling back to in-memory broker mode.")
        redis_client = None

async def redis_message_listener():
    try:
        while True:
            # listen to pubsub messages asynchronously
            message = await redis_pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                data_str = message["data"]
                try:
                    payload = json.loads(data_str)
                    analytics_res = run_calculations(payload)
                    await manager.broadcast(json.dumps(analytics_res))
                except Exception as e:
                    logger.error(f"Error processing Redis pub/sub message: {e}")
            await asyncio.sleep(0.01)
    except asyncio.CancelledError:
        logger.info("Redis listener task cancelled.")
    except Exception as e:
        logger.error(f"Redis listener encountered error: {e}")

def run_calculations(payload: dict) -> dict:
    try:
        raw_positions = []
        for pos in payload.get("positions", []):
            raw_pos = {
                "ticker": pos.get("ticker"),
                "type": pos.get("type"),
                "strategy_name": pos.get("strategy_name"),
                "size": pos.get("size"),
                "avg_price": pos.get("avg_price"),
                "current_price": pos.get("current_price"),
                "underlying_beta_to_spx": pos.get("underlying_beta_to_spx"),
                "legs": [
                    {
                        "strike": leg.get("strike"),
                        "type": leg.get("type"),
                        "expiration": leg.get("expiration"),
                        "position_type": leg.get("position_type"),
                        "delta": leg.get("delta"),
                        "premium": leg.get("premium", 2.50)
                    }
                    for leg in pos.get("legs", [])
                ] if pos.get("legs") else []
            }
            raw_positions.append(raw_pos)
            
        parsed_positions = parse_positions(raw_positions)
        spx_price = get_spx_price()
        factor_exp = calculate_factor_exposures(parsed_positions)
        beta_weighted = calculate_beta_weighted_delta(parsed_positions, spx_price)
        var_limits = calculate_value_at_risk(parsed_positions)
        
        summary = payload.get("portfolio_summary", {})
        net_liq = summary.get("net_liquidity", 5000.0)
        maint_margin = summary.get("maintenance_margin", 3000.0)
        daily_pnl = summary.get("daily_pnl", 0.0)
        
        compliance_status = calculate_compliance_alert(net_liq, maint_margin)
        daily_expected = calculate_daily_expected_return(parsed_positions, net_liq)
        greeks_commentary = generate_greeks_commentary(parsed_positions, daily_expected)
        
        shock_scenario = payload.get("shock_scenario")
        pro_forma_data = None
        if shock_scenario:
            pro_forma_data = calculate_shock_scenario(
                parsed_positions=parsed_positions,
                spot_shock_pct=shock_scenario.get("spot_shock_pct") or 0.0,
                iv_shock_pct=shock_scenario.get("iv_shock_pct") or 0.0,
                initial_summary={
                    "net_liquidity": net_liq,
                    "maintenance_margin": maint_margin,
                    "daily_pnl": daily_pnl
                }
            )
            
        response_positions = []
        for pos in parsed_positions:
            response_positions.append({
                "ticker": pos["ticker"],
                "type": pos["type"],
                "strategy_name": pos.get("strategy_name"),
                "size": pos["size"],
                "price": pos["price"],
                "beta": pos["beta"],
                "delta": pos["delta"],
                "market_value": pos["market_value"],
                "delta_equivalent": pos["delta_equivalent"],
                "early_assignment_risk": pos.get("early_assignment_risk"),
                "days_to_liquidate": pos["days_to_liquidate"],
                "adv": pos["adv"],
                "legs": [
                    {
                        "strike": leg["strike"],
                        "type": leg["type"],
                        "expiration": leg["expiration"],
                        "position_type": leg["position_type"],
                        "delta": leg["delta"],
                        "price": leg["price"],
                        "early_assignment_risk": leg["early_assignment_risk"]
                    }
                    for leg in pos.get("legs", [])
                ]
            })
            
        return {
            "portfolio_summary": {
                "net_liquidity": net_liq,
                "excess_liquidity": summary.get("excess_liquidity", 3000.0),
                "maintenance_margin": maint_margin,
                "daily_pnl": daily_pnl
            },
            "beta_weighted_delta": {
                "total_beta_weighted_delta_shares": beta_weighted["total_beta_weighted_delta_shares"],
                "total_beta_weighted_delta_dollars": beta_weighted["total_beta_weighted_delta_dollars"],
                "spx_index_price": beta_weighted["spx_index_price"],
                "positions": [
                    {
                        "ticker": p["ticker"],
                        "strategy": p["strategy"],
                        "position_delta": p["position_delta"],
                        "beta": p["beta"],
                        "beta_weighted_delta_shares": p["beta_weighted_delta_shares"],
                        "beta_weighted_delta_dollars": p["beta_weighted_delta_dollars"],
                        "delta_equivalent": p["delta_equivalent"]
                    }
                    for p in beta_weighted["positions"]
                ]
            },
            "factor_exposure": {
                "portfolio_factors": {
                    "growth": factor_exp["portfolio_factors"]["growth"],
                    "momentum": factor_exp["portfolio_factors"]["momentum"],
                    "value": factor_exp["portfolio_factors"]["value"]
                },
                "sector_matrix": [
                    {
                        "sector": s["sector"],
                        "exposure": s["exposure"],
                        "percentage": s["percentage"]
                    }
                    for s in factor_exp["sector_matrix"]
                ]
            },
            "value_at_risk": {
                "var_95_dollars": var_limits["var_95_dollars"],
                "var_95_pct": var_limits["var_95_pct"],
                "var_99_dollars": var_limits["var_99_dollars"],
                "var_99_pct": var_limits["var_99_pct"],
                "lookback_days_actual": var_limits["lookback_days_actual"]
            },
            "compliance": {
                "status": compliance_status["status"],
                "ratio": compliance_status["ratio"],
                "message": compliance_status["message"]
            },
            "pro_forma": {
                "net_liquidity": pro_forma_data["net_liquidity"],
                "maintenance_margin": pro_forma_data["maintenance_margin"],
                "excess_liquidity": pro_forma_data["excess_liquidity"],
                "daily_pnl": pro_forma_data["daily_pnl"],
                "net_liquidity_change": pro_forma_data["net_liquidity_change"],
                "positions": [
                    {
                        "ticker": p["ticker"],
                        "type": p["type"],
                        "value_initial": p["value_initial"],
                        "value_shocked": p["value_shocked"],
                        "value_change": p["value_change"]
                    }
                    for p in pro_forma_data["positions"]
                ]
            } if pro_forma_data else None,
            "positions": response_positions,
            "daily_expected_return": {
                "daily_expected_return_usd": daily_expected["daily_expected_return_usd"],
                "expected_return_percentage": daily_expected["expected_return_percentage"],
                "regime_status": daily_expected["regime_status"]
            },
            "greeks_commentary": greeks_commentary
        }
    except Exception as e:
        logger.error(f"Error executing quantitative analytics in WebSocket: {e}")
        return {"error": f"Calculations failed: {str(e)}"}

@app.on_event("startup")
async def startup_event():
    await init_redis()

@app.on_event("shutdown")
async def shutdown_event():
    global redis_listener_task, redis_client
    if redis_listener_task:
        redis_listener_task.cancel()
        try:
            await redis_listener_task
        except asyncio.CancelledError:
            pass
    if redis_client:
        await redis_client.aclose()

@app.websocket("/ws/portfolio-analytics")
async def websocket_portfolio_analytics(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
                # Check for standard calculation payload
                if redis_client:
                    # Publish the payload/update message to Redis
                    await redis_client.publish("portfolio:updates", data)
                else:
                    # Redis fallback: calculate directly and broadcast to all active connections in memory
                    analytics_res = run_calculations(payload)
                    await manager.broadcast(json.dumps(analytics_res))
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"error": "Invalid JSON format"}))
            except Exception as e:
                logger.error(f"Error handling WebSocket message: {e}")
                await websocket.send_text(json.dumps({"error": str(e)}))
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "app": "AlphaAegis API",
        "version": "1.0.0"
    }

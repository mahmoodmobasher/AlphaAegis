"""AlphaAegis Backend FastAPI application. Provides API endpoints for the AlphaAegis options strategy builder and pricing engine."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.models import User, Strategy, StrategyLeg, PortfolioPosition, PortfolioLeg, Watchlist, TradeNote # Import models to register with Base
from app.routers import auth, strategy, chain, portfolio, ib, ib_config, risk_analytics, agents  # ib routers enabled

# Initialize Database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AlphaAegis API",
    description="Backend API for AlphaAegis Options Strategy Builder and Pricing Engine",
    version="1.0.0"
)

# Set up CORS middleware
# Set up CORS middleware to allow all origins during development
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

@app.get("/")
def read_root():
    return {
        "status": "online",
        "app": "AlphaAegis API",
        "version": "1.0.0"
    }

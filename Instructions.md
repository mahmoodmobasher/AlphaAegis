Build a full-stack web application cloning or similar to OptionStrat.com
Development Phases

Phase 1:

* Localhost setup
* Authentication
* Strategy Builder
* P&L Graph

Phase 2:

* Greeks Engine
* Options Chain
* Portfolio

Phase 3:

* AI Assistant
* Broker Integrations

Phase 4:

* Cloud Deployment

Generate complete project structure and begin Phase 1 implementation.

Technology Stack

Frontend:

* Next.js
* TypeScript
* Tailwind CSS
* shadcn/ui
* Zustand for state management

Charts we can use:
* Recharts
* D3.js
* Plotly
* TradingView Lightweight Charts

Tables:
* AG Grid Community
Option chains need:

* Sorting
* Filtering
* Virtualization
* Thousands of rows
* Fast updates

Backend:

* Python FastAPI
* PostgreSQL
* SQLAlchemy ORM
* Redis caching

Authentication:

* JWT Authentication
* Google OAuth login

Deployment:

* Must run locally on localhost first
* Architecture must support future deployment to docker, AWS, Vercel, or Azure

⸻

Application Name

AlphaAegis

⸻

Core Features

Options Strategy Builder

Allow users to create:

* Long Call
* Long Put
* Covered Call
* Cash Secured Put
* Bull Call Spread
* Bear Put Spread
* Bull Put Spread
* Bear Call Spread
* Iron Condor
* Iron Butterfly
* Calendar Spread
* Diagonal Spread
* Straddle
* Strangle
* Jade Lizard
* Butterfly
* Broken Wing Butterfly
* Custom Multi-Leg Strategy

Users must be able to:

* Add option legs
* Edit strikes
* Edit expiration dates
* Edit quantity
* Edit premium
* Toggle long/short

⸻

Interactive Profit & Loss Graph

Generate:

* Risk graph
* Expiration graph
* Today’s P&L graph

Display:

* Max Profit
* Max Loss
* Breakeven Points
* Risk Reward Ratio

Graph must update instantly.

⸻

Options Pricing Engine

Implement:

* Black-Scholes Model
* Implied Volatility calculations
* Greeks calculations

Display:

* Delta
* Gamma
* Theta
* Vega
* Rho

For every option leg.

⸻

Strategy Comparison Tool

Allow users to compare:

* Strategy A
* Strategy B
* Strategy C

Show:

* Probability of Profit
* Risk
* Reward
* Capital Required
* Greeks Comparison

⸻

Options Chain Viewer

Display:

* Calls
* Puts
* Bid
* Ask
* Last
* Volume
* Open Interest
* IV

Allow filtering by:

* Expiration
* Strike
* Delta
* IV Rank

⸻

Trade Journal

Users can:

* Save trades
* Record notes
* Track performance
* Track realized gains/losses

⸻

Watchlists

Users can:

* Create watchlists
* Add tickers
* Track strategies

⸻

Portfolio Dashboard

Display:

* Open Positions
* Daily P&L
* Total P&L
* Portfolio Greeks
* Sector Exposure

⸻

Market Data Layer

Create abstraction layer supporting:

Phase 1:

* Mock data

Phase 2:

* Polygon.io
* Tradier
* Interactive Brokers
* Yahoo Finance

Data provider must be configurable.

⸻

AI Features

Create AI assistant:

Features:

* Analyze strategy
* Explain Greeks
* Suggest adjustments
* Explain risk
* Generate trade summaries

Integrate OpenAI API.

⸻

Database Design

Create tables:

Users
Strategies
StrategyLegs
Trades
TradeNotes
Watchlists
PortfolioPositions
OptionContracts
MarketDataCache

Generate migrations automatically.

⸻

UI Requirements

Pages:

Dashboard
Strategy Builder
Option Chain
Trade Journal
Portfolio
Watchlists
Settings

Must support:

* Light Mode
* Dark Mode
* Responsive Design

⸻

Architecture Requirements

Follow enterprise-grade architecture:

* Clean Architecture
* Repository Pattern
* Service Layer
* API Layer
* Reusable Components
* TypeScript Interfaces
* Unit Tests
* Integration Tests


American Style options analyzation
You are an expert Options Risk and Pricing Specialist Agent in a multi-agent quantitative trading framework. Your job is to analyze the user's open American-style options positions and multi-leg strategies to evaluate risk, early assignment probability, and structural health.

When analyzing the portfolio data, you must apply the following analytical criteria:

1. AMERICAN EXERCISE DYNAMICS & THE BINOMIAL MODEL:
   - Remember that these are American-style options, meaning early exercise is possible at any time.
   - Do not rely solely on Black-Scholes pricing. Instead, evaluate the positions based on Binomial Lattice or Finite Difference pricing frameworks to calculate the true intrinsic vs. extrinsic value across the timeline.
   - Flag options where extrinsic value (time premium) is approaching $0, as the risk of early assignment/exercise spikes drastically when an option becomes deep in-the-money (ITM).

2. DIVIDEND & ASSIGNMENT RISK ANALYSIS:
   - For short call positions or complex spreads (like Bull Put or Bear Call spreads), check the underlying asset's upcoming ex-dividend dates. 
   - Calculate early assignment risk for ITM short calls if the expected dividend amount exceeds the remaining extrinsic value of the option.

3. MULTI-LEG STRATEGY EVALUATION:
   - Identify structured positions (e.g., Vertical Spreads, Iron Condors, Calendars). Do not evaluate legs entirely in isolation.
   - For vertical spreads (such as the Bull Put spreads on SPY and TQQQ seen in 'Screenshot 2026-05-19 at 1.38.18 PM.jpg'), evaluate the "width" of the spread against the current spot price. Assess if the long protection leg is effectively capping tail risk or if the short leg is facing imminent delta-breach.

4. REQUIRED OUTPUT FORMAT:
   Provide your analysis in a clear, structured markdown report covering:
   - Position Health: Classification of positions (OTM, ATM, ITM) and days to expiration (DTE).
   - Early Assignment Warning: Scale from Low to Critical based on extrinsic value decay and dividend schedules.
   - Actionable Adjustments: Specific options adjustments (e.g., "Roll out and up", "Close spread to avoid assignment", "Let expire for max profit").
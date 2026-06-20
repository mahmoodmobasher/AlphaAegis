# 🛡️ AlphaAegis: Institutional Options Suite & Portfolio Risk Analytics

**AlphaAegis** is an institutional-grade, high-performance options strategy builder, profit-and-loss (P&L) simulator, and multi-asset portfolio risk analytics workstation. Modeled after professional trading platforms, AlphaAegis allows quantitative analysts and portfolio managers to construct complex multi-leg derivatives positions, simulate macro shocks, check risk compliance limits, and perform dialectical AI-driven investment reviews.

---

## 🚀 System Architecture & Key Features

### Architectural Topology & Data Flow Pipeline
1. **Frontend Input Layer ([page.tsx](file:///Users/moemahmood/builder_code/myoption/frontend/src/app/portfolio/page.tsx))**: Collects active positions, user portfolio selections (Local Saved Portfolio vs. Live Sessions), and macroeconomic stress testing inputs.
2. **Event-Driven WebSocket Gateway & Redis Pub/Sub**: Connects the client's Zustand store ([usePortfolioStore.ts](file:///Users/moemahmood/builder_code/myoption/frontend/src/store/usePortfolioStore.ts)) over a persistent WebSocket `/ws/portfolio-analytics`. Sliders or ingestion worker events trigger automated backend re-evaluations.
3. **Backend Quantitative Engine ([risk_analytics.py](file:///Users/moemahmood/builder_code/myoption/backend/app/services/risk_analytics.py))**: 
   - Ingests position arrays.
   - Computes historical drift, equity lookback parameters ($\mu$), and VaR metrics.
   - Passes option variables to [pricing.py](file:///Users/moemahmood/builder_code/myoption/backend/app/services/pricing.py) to process dynamic trees via the **Cox-Ross-Rubinstein Binomial Lattice**.
4. **AI Generation Layer**: The calculated data structures are routed through our LangGraph Multi-Agent Committee Room routing loop in [agents.py](file:///Users/moemahmood/builder_code/myoption/backend/app/services/agents.py), producing textual market commentary and coordinated action logs before returning a uniform JSON frame back to the frontend dashboard.


### 1. Advanced Options Strategy Builder & Payoff Engine
* **Multi-Leg Structures:** Build custom options spreads of up to 4 contract legs with dynamic adjustment of strikes, expiration dates, size (quantity), and premiums.
* **Pre-configured Preset Spreads:** Instantly load standard strategies (e.g., Bull Call Spreads, Bear Put Spreads, Straddles, Strangles, Iron Condors).
* **60 FPS Client-Side Reactivity Engine:** Utilizes a standard, lightweight Black-Scholes implementation ([calculateBSClient](file:///Users/moemahmood/builder_code/myoption/frontend/src/utils/pricing.ts#L33-L89)) completely in client-side TypeScript. This powers the real-time slider interpolation across [PnLChart.tsx](file:///Users/moemahmood/builder_code/myoption/frontend/src/components/InteractiveGraph/PnLChart.tsx), [PnLTable.tsx](file:///Users/moemahmood/builder_code/myoption/frontend/src/components/InteractiveGraph/PnLTable.tsx), and [LegBuilder.tsx](file:///Users/moemahmood/builder_code/myoption/frontend/src/components/StrategyBuilder/LegBuilder.tsx) to eliminate UI latency.
* **Institutional Backend Risk Engine:** Powered by a comprehensive Cox-Ross-Rubinstein (CRR) Binomial Lattice pricing model ([calculate_binomial_american](file:///Users/moemahmood/builder_code/myoption/backend/app/services/pricing.py#L126-L338) in [pricing.py](file:///Users/moemahmood/builder_code/myoption/backend/app/services/pricing.py)). This backend layer handles exact portfolio analytics, tracking discrete dividend schedules, calculating true early assignment risk flags, and simulating macroeconomic shocks ([risk_analytics.py](file:///Users/moemahmood/builder_code/myoption/backend/app/services/risk_analytics.py) lines 147–158 and 539–550).
* **Risk-Adjusted Return Analytics:** Confirms that all Value-at-Risk (VaR) and Daily Expected Return ($\mu + \Theta$) metrics displayed on the dashboard are derived entirely from the rigorous backend Binomial Lattice framework.
* **Payoff Trajectories:** Visualizes both the **payoff at expiration** (dashed boundary) and **simulated payoff today** (solid curve) with custom hover tooltips showing leg-by-leg P&L contributions.


### 2. Standalone Daily Expected Return Engine (Feature F-11)
AlphaAegis features a dedicated service method to compute the portfolio's expected daily dollar return, combining historical underlying drift with option theta decay:
* **Equities/Underlyings:** Pulls the trailing 100-day historical daily returns for each asset. Calculates the mean daily return ($\mu_i$) using historical closing prices from [yahoo_finance_client.py](file:///Users/moemahmood/builder_code/myoption/backend/app/yahoo_finance_client.py). If offline or rate-limited, the system falls back to a beta-weighted CAPM simulation.
* **Options Decay Integration:** Extracts the active daily **Theta ($\Theta_j$)** for all open option legs.
* **Expected Return Formula:**
  $$\text{Daily Expected Return (USD)} = \sum_{i \in \text{Equities}} \mu_i \cdot \text{Market Value}_i + \sum_{j \in \text{Options}} \Theta_j \cdot \text{Size}_j \cdot 100 \cdot \text{Position Multiplier}_j$$
  *Where $\text{Position Multiplier}_j = 1.0$ for LONG positions and $-1.0$ for SHORT positions.*
* **Regime Categorization:** Classifies the portfolio drift into **BULLISH** (Expected Return > $0.01/day), **BEARISH** (Expected Return < -$0.01/day), or **NEUTRAL**.

This logic is implemented in the [calculate_daily_expected_return](file:///Users/moemahmood/builder_code/myoption/backend/app/services/risk_analytics.py#L634-L713) function in [risk_analytics.py](file:///Users/moemahmood/builder_code/myoption/backend/app/services/risk_analytics.py).

### 3. Portfolio Greeks & Expected Return AI Commentary Engine (Feature F-12)
Directly integrated into the portfolio dashboard, this engine provides automated, institutional-grade risk analysis:
* **Greeks Ingestion:** Extracts the aggregate net portfolio parameters: **Net Delta** (directional exposure), **Net Vega** (volatility premium sensitivity), and **Net Theta** (daily time-decay capture).
* **Structured Commentary:** Analyzes the risk parameters alongside the F-11 expected return value to generate clear, actionable Markdown breakdowns:
  * **Delta Exposure:** Highlights long/short exposure risks or neutral-insulated state.
  * **Theta Capture:** Details time-decay harvesting versus premium decay drag.
  * **Vega Profile:** Classifies the portfolio as net buyer/seller of volatility and warns about volatility spikes.
  * **Strategy Summary:** Confirms if the portfolio is successfully capturing premium via short options (e.g., active TQQQ spreads) while maintaining controlled directional exposure.
* This logic is defined in [generate_greeks_commentary](file:///Users/moemahmood/builder_code/myoption/backend/app/services/risk_analytics.py#L716-L791) in [risk_analytics.py](file:///Users/moemahmood/builder_code/myoption/backend/app/services/risk_analytics.py).

### 4. Multi-Agent AI Investment Committee Room & Real-Time Macro Sentiment Feed
* **Live Event-Driven Stream Ingestion:** Periodically generates mock financial news headlines and streams text payloads via [macro_stream.py](file:///Users/moemahmood/builder_code/myoption/backend/app/services/macro_stream.py) directly into a Redis Pub/Sub backplane channel named `macro:feed:raw`.
* **Dynamic AI Investment Committee Feeds:** Highlights how the LangGraph multi-agent committee—consisting of a **Macro Risk Agent** (interprets macro headline sentiment and defines IV/spot shocks), an **Options Specialist Agent** (triggers the CRR Binomial Lattice engine in [pricing.py](file:///Users/moemahmood/builder_code/myoption/backend/app/services/pricing.py) to re-price active options), and a **Portfolio Manager Coordinator Agent**—processes sentiment vectors and runs automated portfolio risk shocks in real-time.
* **Glassmorphic Headline Monitor:** A frontend UI banner within the Committee Room tab that dynamically maps `macroHeadline` and `macroSentimentScore` with a flashing indicator light completely driven by async WebSocket broadcast frames.
* **LangGraph Debate Orchestration:** Simulates a dialectical debate twice daily (or on-demand) between an **Options Specialist Agent**, a **Macro Risk Agent**, and a **Portfolio Manager Coordinator Agent** (implemented in [agents.py](file:///Users/moemahmood/builder_code/myoption/backend/app/services/agents.py)).
* **Advisory Report:** Output includes detailed logs, staged compliance recommendations, and a narrative summary report displayed directly in the dashboard left drawer.

### 5. Production Hardening & Robustness
* **Frontend Debounce (150ms):** Implements a debouncing delay on the spot price and IV shock sliders in [page.tsx](file:///Users/moemahmood/builder_code/myoption/frontend/src/app/portfolio/page.tsx) to prevent rapid consecutive API requests and backend event-loop congestion.
* **Strict Pydantic Validation:** The `/api/agents/command` endpoint utilizes the strict [CommandFilters](file:///Users/moemahmood/builder_code/myoption/backend/app/routers/agents.py#L25-L32) validation model, filtering out malformed natural language queries.

---

## 🛠️ Technology Stack

* **Frontend:** Next.js, React, Tailwind CSS, [Zustand](file:///Users/moemahmood/builder_code/myoption/frontend/src/store/useStrategyStore.ts) (state management), Lucide React (icons), Recharts.
* **Backend:** FastAPI (Python), Uvicorn (ASGI server), Pydantic v2 (data validation).
* **Database:** SQLAlchemy ORM, SQLite (`alphaaegis.db` for local development), PostgreSQL compatible.

---

## 💻 Local Setup & Execution

### 1. Backend Setup & Run
1. Navigate to the backend directory and activate the virtual environment:
   ```bash
   cd backend
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Launch the FastAPI server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   * The database tables will automatically initialize in `alphaaegis.db`.
   * Access the interactive OpenAPI docs at `http://localhost:8000/docs`.

### 2. Frontend Setup & Run
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   ```
2. Run the Next.js development server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000` in your web browser.

---

## 🧪 Testing Suite

Run the automated tests to validate options pricing mathematics, Greeks, Pydantic schemas, and risk analytics routers:
```bash
cd backend
source .venv/bin/activate
pytest
```
*Key test coverage includes:*
* [test_risk_analytics.py](file:///Users/moemahmood/builder_code/myoption/backend/app/tests/test_risk_analytics.py): Verifies the `calculate_daily_expected_return` method.
* [test_api.py](file:///Users/moemahmood/builder_code/myoption/backend/app/tests/test_api.py): Assures router authentication and command validations.

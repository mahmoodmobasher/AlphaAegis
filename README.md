# 🛡️ AlphaAegis: Institutional Options Suite & Portfolio Risk Analytics

**AlphaAegis** is an institutional-grade, high-performance options strategy builder, profit-and-loss (P&L) simulator, and multi-asset portfolio risk analytics workstation. Modeled after professional trading platforms, AlphaAegis allows quantitative analysts and portfolio managers to construct complex multi-leg derivatives positions, simulate macro shocks, check risk compliance limits, and perform dialectical AI-driven investment reviews.

---

## 🚀 System Architecture & Key Features

### 1. Advanced Options Strategy Builder & Payoff Engine
* **Multi-Leg Structures:** Build custom options spreads of up to 4 contract legs with dynamic adjustment of strikes, expiration dates, size (quantity), and premiums.
* **Pre-configured Preset Spreads:** Instantly load standard strategies (e.g., Bull Call Spreads, Bear Put Spreads, Straddles, Strangles, Iron Condors).
* **60 FPS Client-Side Engine:** Real-time Black-Scholes calculations update the payoff chart instantly as spot price and volatility sliders are adjusted.
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

### 4. Multi-Agent AI Investment Committee Room
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

# Contributing to AlphaAegis

Thank you for contributing to the AlphaAegis workstation! This document outlines the local development setup, infrastructure prerequisites, and automated verification compliance.

---

## 🛠️ Infrastructure Requirements & Setups

### 1. Redis Environment Requirement
AlphaAegis leverages a Redis Pub/Sub backplane for event-driven pricing streams and real-time news ticker ingestion:
- **Local Redis Instance:** By default, the FastAPI backend attempts to bind to a Redis server running on `localhost:6379` (configurable via the `REDIS_URL` environment variable).
- **Graceful In-Memory Fallback:** If the connection fails or if Redis is not installed locally, the server activates an automated in-memory fallback. It will spin up background loops and broadcast calculation frames directly using Python memory pools, ensuring full workspace functionality without manual Redis administration.

### 2. Multi-Container Orchestration (Docker Compose)
For local development isolation, a unified container configuration is provided:
- **Docker Compose Startup:** To instantly compile, link, and boot up the Next.js frontend client, the FastAPI ASGI backend server, and the Redis broker environment concurrently, execute:
  ```bash
  docker compose up --build
  ```
- **Local Endpoints:**
  - **Next.js Client-Side View:** `http://localhost:3000`
  - **FastAPI OpenAPI Tier:** `http://localhost:8000` (Docs available at `/docs`)
  - **Redis Cache Layer:** Port `6379`

---

## 🧪 Automated Testing Compliance

All modifications to option pricing modules, risk exposure utilities, or agent debate paths must pass our compliance checks. Run the regression test suite prior to committing:
```bash
cd backend
source .venv/bin/activate
pytest app/tests
```
Verify that all 44 regression tests cover models and endpoint structures correctly.

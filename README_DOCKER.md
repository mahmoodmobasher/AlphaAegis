# AlphaAegis Docker Orchestration Guide

This guide explains how to spin up and tear down the multi-container development environment for the AlphaAegis portfolio application.

## Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop/) installed and running.
- [Docker Compose](https://docs.docker.com/compose/install/) (typically bundled with Docker Desktop).

---

## Spin Up the Stack

To build and launch the entire local container stack (Frontend, Backend, and Redis broker) in the background, run the following single command from the project root:

```bash
docker compose up -d --build
```

### Services Included

- **Frontend**: Accessible at `http://localhost:3000` (Next.js app).
- **Backend**: Accessible at `http://localhost:8000` (FastAPI app).
- **Redis**: Exposed on internal port `6379` (Redis database).

---

## View Service Logs

To monitor the logs of the running containers:

```bash
docker compose logs -f
```

---

## Tear Down the Stack

To stop and remove all services, networks, and containers created by the compose script, execute:

```bash
docker compose down
```

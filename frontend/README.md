This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

## Running the Application

### Backend

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
npm install   # install once
npm run dev   # starts dev server at http://localhost:3000
```

### Optional Docker (commented out for later use)

<!--
```bash
docker-compose up --build
```
-->


Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Efficient Development

To run the application efficiently during development:

- **Backend**: Activate the Python virtual environment and start FastAPI with hot‑reload:
  ```bash
  source .venv/bin/activate
  uvicorn app.main:app --reload --port 8000
  ```
  This watches for code changes and restarts automatically.

- **Frontend**: Use the Next.js dev server which supports fast refresh:
  ```bash
  npm install   # once to install dependencies
  npm run dev   # starts on http://localhost:3000
  ```

- **Redis (optional)**: If you need the real‑time macro feed, start a Redis container in the background:
  ```bash
  docker run -d --name alphaaegis-redis -p 6379:6379 redis:alpine
  ```
  The backend will automatically connect to `redis://localhost:6379`.

- **Environment variables**: Create a `.env` file in `backend/` with the following defaults if not already set:
  ```
  REDIS_URL=redis://localhost:6379
  DATABASE_URL=sqlite:///dev.db
  IB_HOST=127.0.0.1
  IB_PORT=4002
  ```
  Adjust as needed for your local setup.

- **Performance tip**: Keep the backend and frontend terminals open side‑by‑side so file changes trigger hot‑reload without restarting the other service.

Once both servers are running, open **http://localhost:3000** to see the UI and **http://localhost:8000** for the API health check.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

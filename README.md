# BookMyShow Clone

A full-stack movie ticket booking app with **safe concurrent seat holds**, a manual booking flow, and an **AI booking assistant** powered by Gemini.

Browse movies → pick a showtime → select seats → hold for 5 minutes → confirm. Or use the split-screen **Movie Assistant** to search, compare prices, and hold seats via chat.

## Features

- Movie catalog with city filter and showtimes
- Live seat map with optimistic selection and 5-second polling
- Pessimistic row locking (`SELECT … FOR UPDATE`) — no double bookings under load
- JWT auth (register, login, my bookings)
- AI agent: search movies, compare showtimes, suggest/hold seats
- Interactive seat pane in agent mode (tap seats + ask assistant to hold)

## Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | React 18, Vite, React Router |
| Backend | Node.js, Express, Prisma |
| Database | PostgreSQL |
| AI | Google Gemini (tool calling) |

## Quick start (local)

### Prerequisites

- Node.js 18+
- Docker (for local Postgres), or use a remote `DATABASE_URL` (e.g. Neon)

### 1. Database

```bash
docker compose up -d
```

Postgres runs on `localhost:5433`.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` — set at least `GEMINI_API_KEY` and `TMDB_API_KEY` for the agent and seed.

```bash
npx prisma migrate dev
npm run seed
npm run dev
```

API: **http://localhost:4000** — health check: `/health`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: **http://localhost:5173**

Leave `VITE_API_URL` unset locally; Vite proxies `/api` to the backend.

## Environment variables

**Backend** (`backend/.env`):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing JWTs |
| `GEMINI_API_KEY` | Yes (agent) | Google Gemini API key |
| `TMDB_API_KEY` | Yes (seed) | TMDB API key for movie data |
| `PORT` | No | Default `4000` |
| `CORS_ORIGIN` | Prod only | Lock CORS to your frontend URL |

**Frontend** (`frontend/.env`):

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Prod only | Backend URL (e.g. Render). Unset locally. |



## API overview

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /auth/register` | — | Create account |
| `POST /auth/login` | — | Get JWT |
| `GET /movies` | — | List/search movies |
| `GET /shows` | — | Showtimes for a movie + date |
| `GET /shows/:id/seats` | — | Seat map |
| `POST /bookings/hold` | JWT | Hold seats (5 min) |
| `POST /bookings/:id/confirm` | JWT | Confirm booking |
| `POST /bookings/:id/cancel` | JWT | Release hold |
| `POST /agent/chat` | JWT | AI assistant |

## License

MIT (or your choice — add a `LICENSE` file if needed).

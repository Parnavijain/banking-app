# Real-Time Banking App — Full Stack Demo

A production-flavored banking application demonstrating a full event-driven
architecture with real-time notifications, RBAC, atomic transactions,
and a complete admin experience.

## Features

**Phase 1 — Core**
- JWT auth with **revocable sessions** (see any device that's signed in, revoke individually)
- RBAC (user vs admin)
- Atomic money transfers with row-level locking + idempotency keys
- Real-time Socket.io notifications
- Auto-categorized transactions

**Phase 2 — Event-driven**
- Kafka (Redpanda) event bus
- Three microservice workers: notifier, audit-logger, fraud-detector
- Retry + dead-letter queue

**Phase 3 — Advanced**
- **Transaction analytics** — category donut, monthly bars, top counterparties
- **Multi-currency wallets** (USD, EUR, GBP) with FX conversion at transfer time
- **Scheduled payments** — one-off, daily, weekly, monthly (background scheduler worker)
- **PDF statements** — user requests, worker generates, downloadable
- **Session management** — list active sessions, revoke individually or all-but-current
- **Admin dashboard** — user list, all-system transactions, **maker-checker workflow** for freezing accounts

## Architecture

```
┌──────────┐    ┌──────────────┐
│React UI  │◄──►│  API Server  │◄── HTTP
└──────────┘    │  (producer)  │
      ▲   Socket└──────┬───────┘
      │   .io          │
      │                ▼
      │       ┌───────────────┐
      │       │Kafka/Redpanda │
      │       └───────┬───────┘
      │               │
      │    ┌──────────┼───────────┬────────────┐
      │    ▼          ▼           ▼            ▼
      │  Notifier   Audit      Fraud       Scheduler
      │             Logger     Detector    (polls DB, executes transfers)
      │    │
      └────┘  (via internal HTTP → Socket.io)

                    ┌───────────────┐
                    │Statement      │  polls DB → generates PDF
                    │Worker         │
                    └───────────────┘
```

## Stack
- **Backend:** Node.js, Express, PostgreSQL, Socket.io, JWT, bcrypt, Zod, KafkaJS
- **Frontend:** React 18, Vite, Tailwind, socket.io-client, Recharts
- **Bus:** Redpanda (Kafka-compatible)
- **Workers:** notifier · audit-logger · fraud-detector · scheduler · statement

## Setup

### 0. Prerequisites
Node.js 18+, Docker + Docker Compose

### 1. Infrastructure
```bash
cd docker && docker compose up -d
```
Postgres → :5432 · Redpanda → :19092 · Redpanda Console UI → http://localhost:8080

### 2. Kafka topics (once)
```bash
cd shared/kafka && npm install && node bootstrap-topics.js
```

### 3. Backend
```bash
cd backend
cp .env.example .env  # edit JWT_SECRET and INTERNAL_TOKEN
npm install
npm run migrate  # runs migrations 001–008
npm run dev
```

### 4. Workers (each in its own terminal)
```bash
cd workers/notifier         && cp .env.example .env && npm install && npm run dev
cd workers/audit-logger     && cp .env.example .env && npm install && npm run dev
cd workers/fraud-detector   && cp .env.example .env && npm install && npm run dev
cd workers/scheduler        && cp .env.example .env && npm install && npm run dev
cd workers/statement-worker && cp .env.example .env && npm install && npm run dev
```
Remember: `INTERNAL_TOKEN` must match across backend, notifier, and scheduler.
`STATEMENT_DIR` must match between backend and statement-worker.

### 5. Frontend
```bash
cd frontend && cp .env.example .env && npm install && npm run dev
```
http://localhost:5173

## Demo tour

1. **Register two users** in two browsers. Watch the real-time notifications
   when one sends money to the other.
2. **Send transfers with descriptive notes** — `dinner at pizza`, `rent may`,
   `netflix`, `amazon` — then open **Analytics** to see the category donut.
3. **Open a EUR wallet** in the Wallets tab, transfer USD → EUR, watch the
   FX rate applied. The transaction shows both original and received amounts.
4. **Schedule a payment** for 2 minutes from now in the Scheduled tab.
   Watch the scheduler worker log `⏰ ran schedule N` when it fires.
5. **Request a PDF statement** for the last month. Watch the statement worker
   log `📄 statement N → …`, then download from the UI.
6. **Sessions:** open a second browser, sign in again, then in browser 1
   go to Sessions and revoke browser 2. Browser 2's next request will 401.
7. **Admin demo:**
   ```bash
   cd backend && node scripts/make-admin.js first@user.com
   cd backend && node scripts/make-admin.js second@user.com
   ```
   Sign in as admin #1, go to Admin tab, propose a freeze on an account.
   Sign in as admin #2, approve it. Now try to send from that account —
   the transfer service rejects with "Sender account is frozen".

## Honest simplifications

- **Fraud detector** uses in-memory counters (not durable across restarts).
- **Money math** uses `Number`, not a decimal library. Small edge cases at
  extreme values.
- **Notifier → API hop for Socket.io** is a shared-secret HTTP call. In
  production you'd use Redis pub/sub or a Socket.io adapter cluster.
- **Session revocation** hits the DB on every request. Add Redis caching
  keyed by `jti` with TTL = token expiry to eliminate the read.
- **FX rates** are seeded static values. Wire up a real feed (ECB, etc.).
- **Statement download** is unauthenticated at the file layer — the API
  streams from disk after checking ownership. Good enough. In S3/GCS you'd
  use signed URLs with short TTL.

## Project structure

```
banking-app/
├── docker/
│   └── docker-compose.yml
├── shared/kafka/                 # topics, producer, consumer helpers, DLQ
├── backend/
│   ├── migrations/               # 001–008
│   ├── scripts/
│   │   ├── test-transfers.js
│   │   └── make-admin.js
│   └── src/
│       ├── config/       (db, kafka, socket)
│       ├── controllers/  (auth, account, transfer, analytics, schedule,
│       │                  statement, admin)
│       ├── middleware/   (auth with session revocation, rbac, errors)
│       ├── routes/
│       └── services/     (transferService, categorize, fxService)
├── workers/
│   ├── notifier/                 # transaction-completed → Socket.io
│   ├── audit-logger/             # all topics → audit_log
│   ├── fraud-detector/           # transaction-initiated → alerts
│   ├── scheduler/                # polls scheduled_payments, executes
│   └── statement-worker/         # polls statement_requests, writes PDFs
└── frontend/
    └── src/
        ├── components/  (Analytics, Wallets, Scheduled, Statements,
        │                 Sessions, Admin, TransferForm)
        ├── context/     (Auth, Socket, Toast)
        └── pages/       (Login, Register, Dashboard)
```

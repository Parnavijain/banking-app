# Banking App — Backend (Phase 1, Step 1)

Node.js + Express + PostgreSQL + JWT + RBAC.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ running locally (or a connection string to one)

## Setup

```bash
# 1. Install deps
npm install

# 2. Copy env and edit values
cp .env.example .env
# Edit DATABASE_URL and JWT_SECRET

# 3. Create the database (one time)
createdb banking_app
# or in psql: CREATE DATABASE banking_app;

# 4. Run migrations
npm run migrate

# 5. Start the server
npm run dev
```

Server runs on `http://localhost:4000`.

## Endpoints so far

| Method | Path                  | Auth       | Description                       |
|--------|-----------------------|------------|-----------------------------------|
| GET    | /health               | —          | Health check                      |
| POST   | /api/auth/register    | —          | Create user + starter account     |
| POST   | /api/auth/login       | —          | Get JWT                           |
| GET    | /api/auth/me          | Bearer JWT | Current user profile              |
| GET    | /api/accounts         | Bearer JWT | Own accounts                      |
| GET    | /api/admin/accounts   | Admin JWT  | All accounts (admin only)         |

## Quick test with curl

```bash
# Register
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"password123","fullName":"Alice"}'

# Save the token from the response, then:
TOKEN="paste_token_here"

curl http://localhost:4000/api/accounts -H "Authorization: Bearer $TOKEN"
```

## Promoting a user to admin

There's no self-serve admin signup (on purpose). Do it in psql:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

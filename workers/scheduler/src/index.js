// Scheduler worker.
// Every SCHEDULER_POLL_MS, wake up and run every scheduled payment whose
// next_run_at has passed and status is 'active'.
//
// Concurrency-safe: SELECT ... FOR UPDATE SKIP LOCKED means multiple worker
// instances can run in parallel without racing on the same row. If a payment
// is being processed by one worker, others skip past it.
require('dotenv').config();
const { Pool } = require('pg');
const { v4: uuid } = require('uuid');
const { createProducer, TOPICS } = require('@banking/kafka');

const POLL_MS = Number(process.env.SCHEDULER_POLL_MS) || 15_000;
const API_BASE = process.env.API_BASE || 'http://localhost:4000';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let publish;

function nextRun(current, freq) {
  const d = new Date(current);
  if (freq === 'daily')   d.setUTCDate(d.getUTCDate() + 1);
  if (freq === 'weekly')  d.setUTCDate(d.getUTCDate() + 7);
  if (freq === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

// The scheduler calls the API's internal endpoint to execute a transfer with
// service-level credentials. This means the transfer service's ownership,
// locking, and idempotency checks all still apply — we don't reinvent them.
async function executeViaApi(payment) {
  const idempotencyKey = uuid();
  const res = await fetch(`${API_BASE}/internal/execute-transfer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': INTERNAL_TOKEN,
    },
    body: JSON.stringify({
      onBehalfOfUserId: payment.user_id,
      fromAccountId:    payment.from_account_id,
      toAccountNumber:  payment.to_account_number,
      amount:           Number(payment.amount),
      note:             `[scheduled] ${payment.note || ''}`.trim(),
      idempotencyKey,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function processOne(client, payment) {
  try {
    await executeViaApi(payment);
    const nextAt = payment.frequency === 'once'
      ? null
      : nextRun(payment.next_run_at, payment.frequency);
    if (nextAt) {
      await client.query(
        `UPDATE scheduled_payments
         SET last_run_at = NOW(), last_error = NULL,
             next_run_at = $2
         WHERE id = $1`,
        [payment.id, nextAt]
      );
    } else {
      await client.query(
        `UPDATE scheduled_payments
         SET last_run_at = NOW(), last_error = NULL, status = 'completed'
         WHERE id = $1`,
        [payment.id]
      );
    }
    console.log(`⏰ ran schedule ${payment.id} (${payment.frequency})`);
  } catch (err) {
    console.warn(`⏰ schedule ${payment.id} failed:`, err.message);
    await client.query(
      `UPDATE scheduled_payments SET last_error = $2, last_run_at = NOW()
       WHERE id = $1`,
      [payment.id, err.message.slice(0, 500)]
    );
    // Don't advance next_run_at — will retry on the next tick.
  }
}

async function tick() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Grab up to 20 due payments; lock them so other schedulers skip them.
    const r = await client.query(
      `SELECT * FROM scheduled_payments
       WHERE status = 'active' AND next_run_at <= NOW()
       ORDER BY next_run_at ASC
       LIMIT 20 FOR UPDATE SKIP LOCKED`
    );
    for (const payment of r.rows) {
      await processOne(client, payment);
    }
    await client.query('COMMIT');
    if (r.rows.length > 0) console.log(`⏰ processed ${r.rows.length} scheduled payments`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('scheduler tick error:', err);
  } finally {
    client.release();
  }
}

(async () => {
  const p = await createProducer('scheduler-producer');
  publish = p.publish;
  console.log(`⏰ Scheduler running (poll ${POLL_MS}ms)`);
  setInterval(tick, POLL_MS);
  tick();
})().catch((err) => { console.error(err); process.exit(1); });

// Audit logger.
// Consumes every business topic and writes an immutable row to audit_log.
// This is what compliance auditors ask for: "show me every action that
// touched an account between these dates."
//
// Idempotent: audit_log.event_id is UNIQUE. Duplicate deliveries are safely
// swallowed via ON CONFLICT DO NOTHING.
require('dotenv').config();
const { Pool } = require('pg');
const { runConsumer, TOPICS } = require('@banking/kafka');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function handle({ topic, event }) {
  await pool.query(
    `INSERT INTO audit_log (event_type, event_id, actor_user_id, payload, occurred_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (event_id) DO NOTHING`,
    [
      event.type || topic,
      event.id,
      event.actorUserId || event.senderUserId || null,
      event,
      event.occurredAt,
    ]
  );
  console.log(`📝 audit: ${event.type || topic} (${event.id})`);
}

(async () => {
  console.log('📚 Audit logger starting…');
  await runConsumer({
    clientId: 'audit-logger',
    groupId: 'audit-logger-group',
    topics: [
      TOPICS.TRANSACTION_INITIATED,
      TOPICS.TRANSACTION_COMPLETED,
      TOPICS.USER_ACTIVITY,
    ],
    handler: handle,
  });
  console.log('📚 Audit logger running.');
})().catch((err) => { console.error(err); process.exit(1); });

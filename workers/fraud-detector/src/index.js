// Fraud detector.
// Consumes `transaction-initiated` and applies rules:
//   - Rule 1: more than 5 transfers in 60 seconds from same user
//   - Rule 2: single transfer exceeding $10,000
//
// When a rule fires, we publish a `user-activity` event with type=fraud.alert.
// The audit logger picks that up, giving you a compliance trail.
//
// This is a demo — in production you'd:
//   - persist per-user counters (Redis) so state survives restarts
//   - actually block the transaction (return a fraud verdict the API waits for)
//   - notify the user, freeze the account, etc.
require('dotenv').config();
const { runConsumer, createProducer, TOPICS } = require('@banking/kafka');

const HIGH_AMOUNT = 10_000;
const VELOCITY_WINDOW_MS = 60_000;
const VELOCITY_MAX = 5;

// In-memory sliding window per userId. Not durable across restarts — Redis
// would be the next step. Fine for a demo.
const recentTransfers = new Map(); // userId -> [timestamps]

function pushRecent(userId, ts) {
  const arr = recentTransfers.get(userId) || [];
  const cutoff = ts - VELOCITY_WINDOW_MS;
  const pruned = arr.filter((t) => t > cutoff);
  pruned.push(ts);
  recentTransfers.set(userId, pruned);
  return pruned.length;
}

let publish = null;

async function handle({ event }) {
  if (event.type !== 'transaction.initiated') return;
  const now = Date.now();
  const count = pushRecent(event.actorUserId, now);

  const alerts = [];
  if (Number(event.amount) >= HIGH_AMOUNT) {
    alerts.push({ rule: 'high_amount', amount: event.amount });
  }
  if (count > VELOCITY_MAX) {
    alerts.push({ rule: 'velocity', count, windowMs: VELOCITY_WINDOW_MS });
  }

  if (alerts.length === 0) return;

  console.log(
    `🚨 fraud signals for user ${event.actorUserId}:`,
    alerts.map((a) => a.rule).join(', ')
  );

  await publish(TOPICS.USER_ACTIVITY, {
    partitionKey: String(event.actorUserId),
    type: 'fraud.alert',
    actorUserId: event.actorUserId,
    triggeredBy: event.id,
    idempotencyKey: event.idempotencyKey,
    amount: event.amount,
    alerts,
  });
}

(async () => {
  console.log('🕵 Fraud detector starting…');
  const producerHandle = await createProducer('fraud-detector-producer');
  publish = producerHandle.publish;
  await runConsumer({
    clientId: 'fraud-detector',
    groupId: 'fraud-detector-group',
    topics: [TOPICS.TRANSACTION_INITIATED],
    handler: handle,
  });
  console.log('🕵 Fraud detector running.');
})().catch((err) => { console.error(err); process.exit(1); });

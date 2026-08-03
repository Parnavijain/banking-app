// Notifier worker.
// Subscribes to `transaction-completed`, fans out Socket.io events to
// sender and receiver by calling the API's internal /internal/notify endpoint.
//
// If this worker crashes, Kafka retains events. When it restarts, it picks
// up from the last committed offset — no lost notifications.
require('dotenv').config();
const { runConsumer, TOPICS } = require('@banking/kafka');

const API_BASE = process.env.API_BASE || 'http://localhost:4000';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN;

if (!INTERNAL_TOKEN) {
  console.error('INTERNAL_TOKEN env var is required'); process.exit(1);
}

async function notify(userId, event, payload) {
  const res = await fetch(`${API_BASE}/internal/notify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': INTERNAL_TOKEN,
    },
    body: JSON.stringify({ userId, event, payload }),
  });
  if (!res.ok) {
    // Throwing → runConsumer will retry, then DLQ.
    const body = await res.text().catch(() => '');
    throw new Error(`notify failed: ${res.status} ${body}`);
  }
}

async function handle({ event }) {
  if (event.type !== 'transaction.completed') return;

  await notify(event.senderUserId, 'transfer:sent', {
    transactionId: event.transactionId,
    amount: event.amount,
    currency: event.currency,
    toAccountId: event.receiverAccountId,
    at: event.at,
  });
  await notify(event.receiverUserId, 'transfer:received', {
    transactionId: event.transactionId,
    amount: event.amount,
    currency: event.currency,
    fromAccountId: event.senderAccountId,
    at: event.at,
  });

  console.log(
    `✉  notified sender=${event.senderUserId} receiver=${event.receiverUserId} tx=${event.transactionId}`
  );
}

(async () => {
  console.log('🔔 Notifier worker starting…');
  await runConsumer({
    clientId: 'notifier',
    groupId: 'notifier-group',
    topics: [TOPICS.TRANSACTION_COMPLETED],
    handler: handle,
  });
  console.log('🔔 Notifier worker running.');
})().catch((err) => { console.error(err); process.exit(1); });

// Internal endpoints protected by shared secret.
const express = require('express');
const { notifyUser } = require('../config/socket');
const { executeTransfer } = require('../services/transferService');
const { publish, TOPICS } = require('../config/kafka');

const router = express.Router();

router.use((req, res, next) => {
  const token = req.headers['x-internal-token'];
  if (!token || token !== process.env.INTERNAL_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Emit Socket.io event to a user
router.post('/notify', (req, res) => {
  const { userId, event, payload } = req.body || {};
  if (!userId || !event) return res.status(400).json({ error: 'userId and event required' });
  notifyUser(userId, event, payload);
  res.json({ ok: true });
});

// Execute a transfer on behalf of a user — used by the scheduler worker.
router.post('/execute-transfer', async (req, res, next) => {
  const {
    onBehalfOfUserId, fromAccountId, toAccountNumber,
    amount, note, idempotencyKey,
  } = req.body || {};
  if (!onBehalfOfUserId || !fromAccountId || !toAccountNumber || !amount || !idempotencyKey) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  try {
    // Publish initiated event so fraud detector still sees it.
    await publish(TOPICS.TRANSACTION_INITIATED, {
      partitionKey: String(onBehalfOfUserId),
      type: 'transaction.initiated',
      actorUserId: onBehalfOfUserId,
      fromAccountId, toAccountNumber, amount, idempotencyKey,
      source: 'scheduler',
    });
    const result = await executeTransfer({
      senderUserId: onBehalfOfUserId,
      fromAccountId, toAccountNumber, amount, note, idempotencyKey,
    });
    if (!result.replayed) {
      await publish(TOPICS.TRANSACTION_COMPLETED, {
        partitionKey: String(result.senderUserId),
        type: 'transaction.completed',
        transactionId: result.transaction.id,
        senderUserId: result.senderUserId,
        receiverUserId: result.receiverUserId,
        senderAccountId: result.transaction.sender_account_id,
        receiverAccountId: result.transaction.receiver_account_id,
        amount: result.transaction.amount,
        currency: result.senderCurrency,
        at: result.transaction.created_at,
        source: 'scheduler',
      });
    }
    res.status(result.replayed ? 200 : 201).json({
      replayed: result.replayed,
      transaction: result.transaction,
    });
  } catch (err) { next(err); }
});

module.exports = router;

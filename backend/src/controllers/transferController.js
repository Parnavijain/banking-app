const { z } = require('zod');
const pool = require('../config/db');
const { executeTransfer } = require('../services/transferService');
const { publish, TOPICS } = require('../config/kafka');

const transferSchema = z.object({
  fromAccountId: z.number().int().positive(),
  toAccountNumber: z.string().min(6),
  amount: z.number().positive().max(1_000_000),
  idempotencyKey: z.string().uuid(),
  note: z.string().max(200).optional(),
});

// POST /api/transfers
async function createTransfer(req, res, next) {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  try {
    // 1) Publish "initiated" BEFORE execution. Fraud detector will see it.
    //    (In a stricter setup you'd wait for a fraud verdict; keeping it
    //    async here so the API stays fast.)
    await publish(TOPICS.TRANSACTION_INITIATED, {
      partitionKey: String(req.user.sub),
      type: 'transaction.initiated',
      actorUserId: req.user.sub,
      fromAccountId: parsed.data.fromAccountId,
      toAccountNumber: parsed.data.toAccountNumber,
      amount: parsed.data.amount,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    // 2) Do the actual money movement.
    const result = await executeTransfer({
      senderUserId: req.user.sub,
      ...parsed.data,
    });

    // 3) Publish "completed" AFTER the DB commit. The notifier and audit
    //    logger consume this. If they crash or lag, Kafka retains the event.
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
      });
    }

    res.status(result.replayed ? 200 : 201).json({
      replayed: result.replayed,
      transaction: result.transaction,
    });
  } catch (err) {
    next(err);
  }
}

async function listTransfers(req, res, next) {
  const accountId = Number(req.query.accountId);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    return res.status(400).json({ error: 'accountId query param required' });
  }
  try {
    const owns = await pool.query(
      `SELECT 1 FROM accounts WHERE id = $1 AND user_id = $2`,
      [accountId, req.user.sub]
    );
    if (owns.rowCount === 0) {
      return res.status(403).json({ error: 'You do not own this account' });
    }
    const result = await pool.query(
      `SELECT t.id, t.amount, t.status, t.note, t.category, t.created_at,
              t.sender_account_id, t.receiver_account_id,
              CASE WHEN t.sender_account_id = $1 THEN 'debit' ELSE 'credit' END AS direction,
              sa.account_number AS sender_account_number,
              ra.account_number AS receiver_account_number
       FROM transactions t
       JOIN accounts sa ON sa.id = t.sender_account_id
       JOIN accounts ra ON ra.id = t.receiver_account_id
       WHERE t.sender_account_id = $1 OR t.receiver_account_id = $1
       ORDER BY t.created_at DESC LIMIT 100`,
      [accountId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { createTransfer, listTransfers };

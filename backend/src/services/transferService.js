// The transfer engine. This is where correctness matters most.
//
// Guarantees we need:
//   A) Atomic: either both accounts change or neither does.
//   B) Consistent: no account goes negative; totals are preserved.
//   C) Isolated: two concurrent transfers can't both read the same
//      balance and cause a lost update ("double spend").
//   D) Idempotent: the same client retry must not charge twice.
//
// How we achieve each:
//   A + B → wrap in a DB transaction; the CHECK (balance >= 0) constraint
//           on the accounts table is our last line of defence.
//   C     → SELECT ... FOR UPDATE locks both rows for the duration of the tx.
//   D     → idempotency_key UUID with a UNIQUE constraint. Client sends it;
//           if we see the same key twice, we return the original result.
//
// Locking order matters! Always lock accounts in a deterministic order
// (lowest id first) to prevent deadlocks between two transfers going
// in opposite directions at the same time.

const pool = require('../config/db');
const { categorize } = require('./categorize');
const { getRate, convert } = require('./fxService');

class TransferError extends Error {
  constructor(message, status = 400, code = 'TRANSFER_ERROR') {
    super(message);
    this.status = status;
    this.publicMessage = message;
    this.code = code;
  }
}

async function executeTransfer({
  senderUserId,
  fromAccountId,
  toAccountNumber,
  amount,
  idempotencyKey,
  note,
}) {
  // Basic input checks (controller does Zod validation; this is defense in depth).
  if (!(amount > 0)) throw new TransferError('Amount must be positive');
  if (!idempotencyKey) throw new TransferError('idempotencyKey is required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // --- 1. Idempotency check --------------------------------------------
    // If we've already processed this key, return the previous result
    // instead of running the transfer again.
    const existing = await client.query(
      `SELECT id, sender_account_id, receiver_account_id, amount, status, created_at
       FROM transactions WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    if (existing.rowCount > 0) {
      await client.query('COMMIT');
      return { replayed: true, transaction: existing.rows[0] };
    }

    // --- 2. Resolve the receiver account by account_number ---------------
    const receiverLookup = await client.query(
      `SELECT id, user_id FROM accounts WHERE account_number = $1`,
      [toAccountNumber]
    );
    if (receiverLookup.rowCount === 0) {
      throw new TransferError('Receiver account not found', 404);
    }
    const receiverAccountId = receiverLookup.rows[0].id;
    const receiverUserId = receiverLookup.rows[0].user_id;

    if (fromAccountId === receiverAccountId) {
      throw new TransferError('Cannot transfer to the same account');
    }

    // --- 3. Verify the sender actually owns the from-account --------------
    const ownership = await client.query(
      `SELECT user_id FROM accounts WHERE id = $1`,
      [fromAccountId]
    );
    if (ownership.rowCount === 0) {
      throw new TransferError('Sender account not found', 404);
    }
    if (ownership.rows[0].user_id !== senderUserId) {
      throw new TransferError('You do not own this account', 403);
    }

    // --- 4. Lock BOTH accounts, in id order, to prevent deadlocks --------
    const [firstId, secondId] =
      fromAccountId < receiverAccountId
        ? [fromAccountId, receiverAccountId]
        : [receiverAccountId, fromAccountId];

    // FOR UPDATE takes a row-level exclusive lock. Any other tx that tries
    // to SELECT FOR UPDATE the same row will wait until we commit or rollback.
    const locked = await client.query(
      `SELECT id, user_id, balance, currency, status
       FROM accounts WHERE id IN ($1, $2) ORDER BY id FOR UPDATE`,
      [firstId, secondId]
    );
    const rows = locked.rows;
    const sender = rows.find((r) => r.id === fromAccountId);
    const receiver = rows.find((r) => r.id === receiverAccountId);

    if (sender.status === 'frozen') {
      throw new TransferError('Sender account is frozen', 403);
    }
    if (receiver.status === 'frozen') {
      throw new TransferError('Receiver account is frozen', 403);
    }

    // --- 5. Business rules -----------------------------------------------
    if (Number(sender.balance) < Number(amount)) {
      throw new TransferError('Insufficient funds', 402);
    }

    // Cross-currency: convert `amount` (in sender currency) into receiver currency.
    let receivedAmount = Number(amount);
    let fxRate = null;
    if (sender.currency !== receiver.currency) {
      fxRate = await getRate(client, sender.currency, receiver.currency);
      receivedAmount = convert(amount, fxRate);
    }

    // --- 6. Apply the balance updates ------------------------------------
    // Sender loses `amount` in their currency; receiver gains `receivedAmount`
    // in theirs. The CHECK (balance >= 0) constraint is our safety net.
    await client.query(
      `UPDATE accounts SET balance = balance - $1 WHERE id = $2`,
      [amount, fromAccountId]
    );
    await client.query(
      `UPDATE accounts SET balance = balance + $1 WHERE id = $2`,
      [receivedAmount, receiverAccountId]
    );

    // --- 7. Write the transaction row ------------------------------------
    const category = categorize(note);
    const txResult = await client.query(
      `INSERT INTO transactions
        (sender_account_id, receiver_account_id, amount, status,
         idempotency_key, note, category,
         fx_rate, received_amount, received_currency)
       VALUES ($1, $2, $3, 'completed', $4, $5, $6, $7, $8, $9)
       RETURNING id, sender_account_id, receiver_account_id, amount, status,
                 idempotency_key, note, category, fx_rate,
                 received_amount, received_currency, created_at`,
      [
        fromAccountId, receiverAccountId, amount, idempotencyKey, note || null, category,
        fxRate, receivedAmount, receiver.currency,
      ]
    );

    await client.query('COMMIT');

    return {
      replayed: false,
      transaction: txResult.rows[0],
      senderUserId,
      receiverUserId,
      senderCurrency: sender.currency,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    // If two identical requests race, the second will lose the UNIQUE race
    // on idempotency_key. Convert that into a friendly replay.
    if (err.code === '23505' /* unique_violation */) {
      const existing = await pool.query(
        `SELECT id, sender_account_id, receiver_account_id, amount, status, created_at
         FROM transactions WHERE idempotency_key = $1`,
        [idempotencyKey]
      );
      if (existing.rowCount > 0) {
        return { replayed: true, transaction: existing.rows[0] };
      }
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { executeTransfer, TransferError };

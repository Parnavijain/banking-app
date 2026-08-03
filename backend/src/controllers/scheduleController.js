const pool = require('../config/db');
const { z } = require('zod');

const scheduleSchema = z.object({
  fromAccountId:   z.number().int().positive(),
  toAccountNumber: z.string().min(6),
  amount:          z.number().positive().max(1_000_000),
  note:            z.string().max(200).optional(),
  frequency:       z.enum(['once', 'daily', 'weekly', 'monthly']),
  firstRunAt:      z.string().datetime(),  // ISO
});

async function assertOwnAccount(userId, accountId) {
  const r = await pool.query('SELECT 1 FROM accounts WHERE id=$1 AND user_id=$2', [accountId, userId]);
  if (r.rowCount === 0) {
    const e = new Error('You do not own this account');
    e.status = 403; e.publicMessage = e.message;
    throw e;
  }
}

// POST /api/scheduled-payments
async function createSchedule(req, res, next) {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  try {
    await assertOwnAccount(req.user.sub, parsed.data.fromAccountId);
    const r = await pool.query(
      `INSERT INTO scheduled_payments
       (user_id, from_account_id, to_account_number, amount, note, frequency, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.user.sub, parsed.data.fromAccountId, parsed.data.toAccountNumber,
        parsed.data.amount, parsed.data.note || null,
        parsed.data.frequency, parsed.data.firstRunAt,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
}

// GET /api/scheduled-payments
async function listSchedules(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT s.*, a.account_number AS from_account_number, a.currency AS from_currency
       FROM scheduled_payments s
       JOIN accounts a ON a.id = s.from_account_id
       WHERE s.user_id = $1
       ORDER BY s.next_run_at ASC`,
      [req.user.sub]
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

// DELETE /api/scheduled-payments/:id
async function cancelSchedule(req, res, next) {
  try {
    const r = await pool.query(
      `UPDATE scheduled_payments SET status='cancelled'
       WHERE id=$1 AND user_id=$2 AND status='active'
       RETURNING id`,
      [Number(req.params.id), req.user.sub]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Not found or not cancellable' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { createSchedule, listSchedules, cancelSchedule };
